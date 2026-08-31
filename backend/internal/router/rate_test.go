package router

import (
	"net/http"
	"testing"
	"time"
)

// The mechanism a module's upstream-rate bound is met by, read against a fixture
// entry rather than any module's registration: what a module contributes is its
// figures, and those are asserted in the package that declares them. Both cases
// run here because the clock a cache interval is measured on is injectable
// inside this package and nowhere else.
//
// The figures below are the fixture's own and are deliberately not any module's.
// A case echoing a module's numbers would pass for two reasons and tell them
// apart for neither.
const (
	// heldFor is how long the fixture route serves a success from cache.
	heldFor = 20 * time.Minute
	// polledEvery is how often the staged display asks. It is shorter than
	// heldFor, which is the arrangement the bound exists for: the surplus asks
	// reach the cache rather than the source.
	polledEvery = 5 * time.Minute
	// overOneHour is the window the calls are counted in, and heldFor divides it.
	overOneHour = time.Hour
)

// oneQuery and anotherQuery are two locations in the fixture's own vocabulary.
const (
	oneQuery     = "/api/readings?station=one"
	anotherQuery = "/api/readings?station=two"
)

// heldEntry is the fixture registration these cases stage: the testEntry above
// under a cache interval long enough for the polling below to spend most of it
// on the cache.
func heldEntry(fake *upstreamFake) Entry {
	entry := testEntry(fake, "readings")
	entry.SuccessTTL = heldFor
	return entry
}

// TST062: the first clause's mechanism. A display polling faster than the route
// holds its answer spends the surplus on the cache, so what reaches the source
// over a window is that window divided by the interval and no more. Which
// interval a module registers, and what that comes to, is the module's own
// package to assert.
func TestTST062_ASourceIsAskedOncePerCacheIntervalForOneLocation(t *testing.T) {
	clock := newFakeClock()
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{heldEntry(fake)}, clock.now)

	for elapsed := time.Duration(0); elapsed < overOneHour; elapsed += polledEvery {
		served := ask(handler, http.MethodGet, oneQuery)
		if served.Code != http.StatusOK {
			t.Fatalf("the poll at %s: status = %d, want %d (%s)", elapsed, served.Code, http.StatusOK, served.Body)
		}
		clock.advance(polledEvery)
	}

	// Exactly the window over the interval: more would be a cache not holding,
	// and fewer would be one holding past its interval, which the same hour of
	// polling is what shows.
	want := int(overOneHour / heldFor)
	if calls := fake.count(); calls != want {
		t.Errorf("upstream calls in %s at a %s interval = %d, want %d", overOneHour, heldFor, calls, want)
	}

	// The bound is per location: the cache is keyed on the query, so a second
	// place is a second conversation and the first having spent its budget is not
	// a reason to starve it.
	if served := ask(handler, http.MethodGet, anotherQuery); served.Code != http.StatusOK {
		t.Errorf("a second location: status = %d, want %d (%s)", served.Code, http.StatusOK, served.Body)
	}
}

// TST062: the second clause's mechanism, which no policy value reaches — every
// entry gets it. Reissuing on top of a slow answer would multiply a route's rate
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
	handler := newRouter([]Entry{heldEntry(fake)}, newFakeClock().now)

	release := fake.hold()
	t.Cleanup(release)

	arrived := make(chan struct{}, callers)
	answered := make(chan int, callers)
	for range callers {
		go func() {
			arrived <- struct{}{}
			answered <- ask(handler, http.MethodGet, oneQuery).Code
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
