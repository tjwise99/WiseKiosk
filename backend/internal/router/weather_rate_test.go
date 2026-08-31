package router

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/modules/weather"
)

// The two cases below are the only place a framework test names a module, and
// they name it for the reason the requirement does: the rate they read is the
// weather module's own figure rather than a policy the framework has. They run
// here because the clock a TTL is measured on is injectable inside this package
// and nowhere else, and they take the module's policy from the module so a
// figure that moved there moves here rather than being restated.

// The location the cases ask about, and a second one to read the bound's "for
// any one location" against.
const (
	oneLocation     = "/api/weather?lat=40.7128&lon=-74.006"
	anotherLocation = "/api/weather?lat=51.4779&lon=-0.0015"
)

// weatherEntry is the weather module's registration against a staged source. Its
// policy and its pattern are the module's; the URL and the shaping stand in,
// there being no upstream here to build one for.
func weatherEntry(fake *upstreamFake) Entry {
	entry := testEntry(fake, weather.Source)
	entry.Config = weather.Config()
	entry.Validate = weather.Validate
	entry.BuildURL = func(params url.Values) (string, error) {
		return fake.server.URL + "/?" + params.Encode(), nil
	}
	entry.Shape = func(body []byte) (any, error) {
		var payload map[string]any
		return payload, json.Unmarshal(body, &payload)
	}
	return entry
}

// TST062: SRS047<!-- The weather module asks its source at most four times an hour for a location -->,
// first clause. A display polling for its freshness bound spends the hour on the
// cache, and what leaves for the source is the four the requirement allows.
func TestTST062_TheSourceIsAskedNoMoreThanFourTimesAnHourForOneLocation(t *testing.T) {
	// What the display polls at. It is the frontend's constant and is written here
	// as the traffic this case stages, not as a figure the backend holds.
	const cadence = 5 * time.Minute

	clock := newFakeClock()
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{weatherEntry(fake)}, clock.now)

	for elapsed := time.Duration(0); elapsed < time.Hour; elapsed += cadence {
		served := ask(handler, http.MethodGet, oneLocation)
		if served.Code != http.StatusOK {
			t.Fatalf("the poll at %s: status = %d, want %d (%s)", elapsed, served.Code, http.StatusOK, served.Body)
		}
		clock.advance(cadence)
	}

	// Four and no more is the requirement's figure; fewer than four would be a
	// route holding an answer past the freshness bound, which the same hour of
	// polling is what shows.
	if calls := fake.count(); calls != 4 {
		t.Errorf("upstream calls in an hour for one location = %d, want 4", calls)
	}

	// The bound is per location: a second place is a second conversation, and the
	// first having spent its budget is not a reason to starve it.
	if served := ask(handler, http.MethodGet, anotherLocation); served.Code != http.StatusOK {
		t.Errorf("a second location: status = %d, want %d (%s)", served.Code, http.StatusOK, served.Body)
	}
}

// TST062: SRS047<!-- The weather module asks its source at most four times an hour for a location -->,
// second clause. Reissuing on top of a slow answer would multiply the rate
// exactly when the source is least able to bear it.
func TestTST062_ASecondRequestIsNeverOutstandingWhileAFirstHasNotAnswered(t *testing.T) {
	// How many ask at once, and how long the ones after the first are given to
	// reach the pipeline. The wait is scheduling slack rather than part of the
	// property: what it buys is that the assertions below are made with all four
	// still outstanding.
	const (
		callers = 4
		joining = 100 * time.Millisecond
	)

	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{weatherEntry(fake)}, newFakeClock().now)

	release := fake.hold()
	t.Cleanup(release)

	arrived := make(chan struct{}, callers)
	answered := make(chan int, callers)
	for range callers {
		go func() {
			arrived <- struct{}{}
			answered <- ask(handler, http.MethodGet, oneLocation).Code
		}()
	}
	for range callers {
		<-arrived
	}

	waitFor(t, "the staged source to be reached", func() bool { return fake.count() >= 1 })
	time.Sleep(joining)

	if answers := len(answered); answers != 0 {
		t.Errorf("%d of %d callers were answered while the source had not answered", answers, callers)
	}
	if calls := fake.count(); calls != 1 {
		t.Errorf("outstanding upstream calls for one location = %d, want 1", calls)
	}

	release()
	for range callers {
		if code := <-answered; code != http.StatusOK {
			t.Errorf("a caller waiting on the one flight: status = %d, want %d", code, http.StatusOK)
		}
	}
	if calls := fake.count(); calls != 1 {
		t.Errorf("upstream calls for %d concurrent requests = %d, want the one they shared", callers, calls)
	}
}

// waitFor blocks until want holds, failing the test rather than hanging where it
// does not.
func waitFor(t *testing.T, what string, want func() bool) {
	t.Helper()

	const (
		bound = 5 * time.Second
		step  = time.Millisecond
	)

	deadline := time.Now().Add(bound)
	for !want() {
		if time.Now().After(deadline) {
			t.Fatalf("waited %s for %s", bound, what)
		}
		time.Sleep(step)
	}
}
