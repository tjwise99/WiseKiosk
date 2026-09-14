package park_wait_times

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// The two captured responses every shaping case runs against: one park's real
// live-data answer and its real schedule answer, both taken for the park below.
// No case here reaches a network.
const (
	capturedLive     = "testdata/mk-live.json"
	capturedSchedule = "testdata/mk-schedule.json"
)

// The park the captures were taken for.
const capturedSlug = "magic-kingdom"

// liveResponseBytes and scheduleResponseBytes read the captured responses.
func liveResponseBytes(t *testing.T) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.FromSlash(capturedLive))
	if err != nil {
		t.Fatalf("reading the captured live response: %v", err)
	}
	return body
}

func scheduleResponseBytes(t *testing.T) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.FromSlash(capturedSchedule))
	if err != nil {
		t.Fatalf("reading the captured schedule response: %v", err)
	}
	return body
}

// roundTrip is a transport written as a function.
type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

// stagedSource puts a transport that answers nothing in front of every
// outbound call for the length of the test, and returns the count of the
// calls that reach it.
func stagedSource(t *testing.T) *atomic.Int64 {
	t.Helper()

	var calls atomic.Int64
	held := http.DefaultTransport
	http.DefaultTransport = roundTrip(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return nil, errors.New("no case in this package asks the source")
	})
	t.Cleanup(func() { http.DefaultTransport = held })
	return &calls
}

// serve runs one request against this module's own schema handler, which is
// what judges a body and what answers a rejection.
func serve(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/park-wait-times", strings.NewReader(body))
	ParkWaitTimesRoute{}.PostApiParkWaitTimes(recorder, request)
	return recorder
}

// freshRoute swaps the package's one route for a fresh one for the length of
// the calling test, so a case that drives a request to completion does not
// leave a cached answer or a spent rate token for whatever runs next.
func freshRoute(t *testing.T) {
	t.Helper()
	held := served
	served = router.NewRoute(entry())
	t.Cleanup(func() { served = held })
}

// TestTST072_ThePatternAdmitsASupportedParkAndRejectsEveryOther reads
// SRS055<!-- The park-wait-times module declares the known-good constraint the park it is asked about must satisfy -->
// against the constraint itself, without a network: every slug in the
// module's supported set is admitted and resolves the entity id that set
// declares for it, and a slug outside it is rejected.
func TestTST072_ThePatternAdmitsASupportedParkAndRejectsEveryOther(t *testing.T) {
	for slug, want := range supported {
		t.Run("admits "+slug, func(t *testing.T) {
			got, err := validate(slug)
			if err != nil {
				t.Fatalf("validate(%q): unexpected rejection: %v", slug, err)
			}
			if got != want {
				t.Errorf("validate(%q) = %+v, want %+v", slug, got, want)
			}
		})
	}

	rejected := []string{"", "disney-world", "Magic-Kingdom", "magic-kingdom ", "hogsmeade"}
	for _, slug := range rejected {
		t.Run(fmt.Sprintf("rejects %q", slug), func(t *testing.T) {
			if _, err := validate(slug); err == nil {
				t.Fatalf("validate(%q): no error, want a rejection", slug)
			}
		})
	}

	// The rejection is judged before any upstream call: a request naming one
	// unsupported park among several supported ones is refused in full, with
	// no call issued for any of the parks it named.
	t.Run("a request naming one unsupported park among several is refused whole, with no upstream call", func(t *testing.T) {
		asked := stagedSource(t)
		freshRoute(t)

		recorder := serve(t, `{"parks":["magic-kingdom","hogsmeade","epcot"]}`)

		if calls := asked.Load(); calls != 0 {
			t.Errorf("a rejected request cost %d upstream calls, want none", calls)
		}
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
		}

		var rejection boundary.ClientRejection
		if err := json.Unmarshal(recorder.Body.Bytes(), &rejection); err != nil {
			t.Fatalf("reading the rejection %q: %v", recorder.Body, err)
		}
		if rejection.Message == "" {
			t.Error("the rejection carries no text to render")
		}
	})
}

// uuidShape is what themeparks.wiki's own entity ids are written as. It is a
// syntactic check only — no case here reaches the network — but it is what
// catches a hardcoded id mistyped or copied from the wrong row before it ships
// (the stale-UUID guard the #309 plan calls for).
var uuidShape = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// TestSupportedParksResolveWellFormedDistinctEntityIDs is the stale-UUID
// guard: every hardcoded park in the module's supported set names a
// themeparks.wiki entity id in the shape that source uses, and no two parks
// share one or a name — a copy-paste from the wrong row would otherwise ship
// silently, caught in production by every request for the park it broke
// rather than here.
func TestSupportedParksResolveWellFormedDistinctEntityIDs(t *testing.T) {
	if len(supported) == 0 {
		t.Fatal("the module declares no supported park")
	}

	seenIDs := make(map[string]string, len(supported))
	seenNames := make(map[string]string, len(supported))
	for slug, park := range supported {
		if !uuidShape.MatchString(park.entityID) {
			t.Errorf("%q's entity id %q is not shaped like a themeparks.wiki id", slug, park.entityID)
		}
		if park.name == "" {
			t.Errorf("%q carries no render name", slug)
		}
		if other, taken := seenIDs[park.entityID]; taken {
			t.Errorf("%q and %q share the entity id %q", slug, other, park.entityID)
		}
		seenIDs[park.entityID] = slug
		if other, taken := seenNames[park.name]; taken {
			t.Errorf("%q and %q share the render name %q", slug, other, park.name)
		}
		seenNames[park.name] = slug
	}
}

// TestTST073_ShapingBuildsTheParksRidesFromTheCapturedResponse reads
// SRS056<!-- The park-wait-times module puts each park's ride waits across the boundary -->
// against the captured live-data response, with no network: only the
// attraction rows are kept, in the source's own order, each carrying its name
// and its wait as the source reported it.
func TestTST073_ShapingBuildsTheParksRidesFromTheCapturedResponse(t *testing.T) {
	rides, err := shapeRides(liveResponseBytes(t))
	if err != nil {
		t.Fatalf("shapeRides: unexpected error: %v", err)
	}

	// The capture carries a park row, a show row and a restaurant row beside
	// its seven attractions; only the seven are kept.
	want := []boundary.ParkWaitTimesRide{
		{Name: "The Hall of Presidents", Wait: waitClosed},
		{Name: "Mad Tea Party", Wait: float64(10)},
		{Name: "Casey Jr. Splash 'N' Soak Station", Wait: waitClosed},
		{Name: "Seven Dwarfs Mine Train", Wait: float64(25)},
		{Name: "Walt Disney's Carousel of Progress", Wait: waitRefurbishment},
		{Name: "The Barnstormer", Wait: float64(5)},
		{Name: "Cinderella Castle", Wait: waitClosed},
	}
	if len(rides) != len(want) {
		t.Fatalf("shaped %d rides, want %d: %+v", len(rides), len(want), rides)
	}
	for index, ride := range rides {
		// A numeric wait round-trips through JSON as float64 on the boundary's
		// untyped slot; shapeWait itself returns an int, so the comparison
		// below reads it the same way a caller reading the JSON payload would.
		gotWait := ride.Wait
		if asInt, ok := gotWait.(int); ok {
			gotWait = float64(asInt)
		}
		if ride.Name != want[index].Name || gotWait != want[index].Wait {
			t.Errorf("ride %d = %+v (wait read as %v), want %+v", index, ride, gotWait, want[index])
		}
	}
}

// TestShapeRidesReadsTheBodyWithoutWritingToIt covers the framework's own
// condition on a shaping function: the body is the cached response every
// caller it is served to holds.
func TestShapeRidesReadsTheBodyWithoutWritingToIt(t *testing.T) {
	body := liveResponseBytes(t)
	held := string(body)

	if _, err := shapeRides(body); err != nil {
		t.Fatalf("shapeRides: unexpected error: %v", err)
	}
	if string(body) != held {
		t.Error("shapeRides wrote to the body it was given")
	}
}

// TestShapeRidesRefusesABodyThatIsNotJSON is shapeRides's own decode failure.
func TestShapeRidesRefusesABodyThatIsNotJSON(t *testing.T) {
	if _, err := shapeRides([]byte("not json")); err == nil {
		t.Error("shapeRides: no error for a body that is not JSON")
	}
}

// TestShapeWaitReadsEveryStatusTheSourceDeclares reads
// SRS061<!-- The park-wait-times module draws a wait as the time or the not-operating state it is handed -->
// against each of the source's four statuses directly, and against the two
// ways an OPERATING row can carry no wait a viewer could be shown, and a
// status the source's own enum does not carry.
func TestShapeWaitReadsEveryStatusTheSourceDeclares(t *testing.T) {
	minutes := 12
	operating := &queueBlock{Standby: &standbyBlock{WaitTime: &minutes}}

	cases := []struct {
		name    string
		status  string
		queue   *queueBlock
		want    any
		wantErr bool
	}{
		{"an operating ride with a reported wait", "OPERATING", operating, minutes, false},
		{"a down ride", "DOWN", nil, waitDown, false},
		{"a closed ride", "CLOSED", nil, waitClosed, false},
		{"a ride under refurbishment", "REFURBISHMENT", nil, waitRefurbishment, false},
		{"an operating ride with no queue block at all", "OPERATING", nil, nil, true},
		{"an operating ride whose queue carries no standby line", "OPERATING", &queueBlock{}, nil, true},
		{"an operating ride whose standby line carries no wait", "OPERATING", &queueBlock{Standby: &standbyBlock{}}, nil, true},
		{"a status outside the source's own enum", "BOARDING_GROUP", nil, nil, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := shapeWait(c.status, c.queue)
			if c.wantErr {
				if err == nil {
					t.Fatalf("shapeWait(%q): no error, want one", c.status)
				}
				return
			}
			if err != nil {
				t.Fatalf("shapeWait(%q): unexpected error: %v", c.status, err)
			}
			if got != c.want {
				t.Errorf("shapeWait(%q) = %v, want %v", c.status, got, c.want)
			}
		})
	}
}

// TestTST073_AResponseMissingAValueTheRideNeedsIsNotShaped is the other half
// of the shaping obligation: a response missing a value a kept row needs is
// an error rather than a payload carrying a zero nobody reported.
func TestTST073_AResponseMissingAValueTheRideNeedsIsNotShaped(t *testing.T) {
	cases := map[string]func(read map[string]any){
		"an attraction with no name": func(read map[string]any) {
			rows := read["liveData"].([]any)
			rows[1].(map[string]any)["name"] = nil
		},
		"an attraction with no status": func(read map[string]any) {
			rows := read["liveData"].([]any)
			rows[1].(map[string]any)["status"] = nil
		},
		"an attraction reporting a status this module does not recognise": func(read map[string]any) {
			rows := read["liveData"].([]any)
			rows[1].(map[string]any)["status"] = "BOARDING_GROUP"
		},
		"an operating attraction reporting no wait at all": func(read map[string]any) {
			rows := read["liveData"].([]any)
			row := rows[2].(map[string]any)
			row["status"] = "OPERATING"
			row["queue"] = map[string]any{}
		},
	}

	for name, break_ := range cases {
		t.Run(name, func(t *testing.T) {
			var read map[string]any
			if err := json.Unmarshal(liveResponseBytes(t), &read); err != nil {
				t.Fatalf("reading the captured response: %v", err)
			}
			break_(read)

			broken, err := json.Marshal(read)
			if err != nil {
				t.Fatalf("writing the broken response: %v", err)
			}

			rides, err := shapeRides(broken)
			if err == nil {
				t.Fatalf("shapeRides: shaped %+v, want an error", rides)
			}
			if err.Error() == "" {
				t.Error("the error says nothing about what could not be read")
			}
		})
	}
}

// TestTST073_ShapingBuildsTheParksHoursFromTheCapturedResponse reads the
// hours half of
// SRS056<!-- The park-wait-times module puts each park's ride waits across the boundary -->
// against the captured schedule response: the `OPERATING`-typed entry for the
// day named is what is read, not an early entry or a ticketed evening event
// on the same date.
func TestTST073_ShapingBuildsTheParksHoursFromTheCapturedResponse(t *testing.T) {
	// The capture's first OPERATING entry is 2026-09-13, 08:00-04:00 to
	// 18:00-04:00; "now" is read against its own offset, so any hour of that
	// same calendar day in -04:00 selects it.
	now := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)

	hours, err := shapeHours(scheduleResponseBytes(t), now)
	if err != nil {
		t.Fatalf("shapeHours: unexpected error: %v", err)
	}
	if hours == nil {
		t.Fatal("shapeHours: nil, want today's operating hours")
	}
	if hours.Open != "2026-09-13T08:00:00-04:00" {
		t.Errorf("Open = %q, want the day's OPERATING entry, not its early entry or its ticketed event", hours.Open)
	}
	if hours.Close != "2026-09-13T18:00:00-04:00" {
		t.Errorf("Close = %q, want the day's OPERATING entry", hours.Close)
	}
}

// TestShapeHoursReturnsNilForADayTheSourceReportsNoOperatingEntry is
// shapeHours's absence path: a day the source reports no OPERATING entry for
// is nil rather than an error, the park may simply be closed that day
// (boundary/openapi.yaml's ParkWaitTimesHours).
func TestShapeHoursReturnsNilForADayTheSourceReportsNoOperatingEntry(t *testing.T) {
	// A day one past the capture's last OPERATING entry.
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)

	hours, err := shapeHours(scheduleResponseBytes(t), now)
	if err != nil {
		t.Fatalf("shapeHours: unexpected error: %v", err)
	}
	if hours != nil {
		t.Errorf("shapeHours = %+v, want nil for a day the source reports no OPERATING entry for", hours)
	}
}

// TestShapeHoursRefusesAMalformedScheduleEntry covers shapeHours's own
// failure paths: a body that is not JSON, and an OPERATING entry missing a
// timestamp or carrying one this module cannot read.
func TestShapeHoursRefusesAMalformedScheduleEntry(t *testing.T) {
	if _, err := shapeHours([]byte("not json"), time.Now()); err == nil {
		t.Error("shapeHours: no error for a body that is not JSON")
	}

	cases := map[string]func(read map[string]any){
		"an operating entry with no opening time": func(read map[string]any) {
			entries := read["schedule"].([]any)
			entries[1].(map[string]any)["openingTime"] = nil
		},
		"an operating entry with no closing time": func(read map[string]any) {
			entries := read["schedule"].([]any)
			entries[1].(map[string]any)["closingTime"] = nil
		},
		"an operating entry whose opening time this module cannot read": func(read map[string]any) {
			entries := read["schedule"].([]any)
			entries[1].(map[string]any)["openingTime"] = "13/09/2026 08:00"
		},
		"an operating entry whose closing time this module cannot read": func(read map[string]any) {
			entries := read["schedule"].([]any)
			entries[1].(map[string]any)["closingTime"] = "13/09/2026 18:00"
		},
	}

	for name, break_ := range cases {
		t.Run(name, func(t *testing.T) {
			var read map[string]any
			if err := json.Unmarshal(scheduleResponseBytes(t), &read); err != nil {
				t.Fatalf("reading the captured response: %v", err)
			}
			break_(read)

			broken, err := json.Marshal(read)
			if err != nil {
				t.Fatalf("writing the broken response: %v", err)
			}

			now := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)
			hours, err := shapeHours(broken, now)
			if err == nil {
				t.Fatalf("shapeHours: shaped %+v, want an error", hours)
			}
		})
	}
}

// TestSameDay reads sameDay across the boundary it is built to draw: the same
// calendar day at two different moments, the moment either side of midnight,
// and two locations that disagree about what day the same instant is.
func TestSameDay(t *testing.T) {
	est := time.FixedZone("", -4*3600)

	cases := []struct {
		name string
		a, b time.Time
		want bool
	}{
		{
			"the same day, different times",
			time.Date(2026, 9, 13, 8, 0, 0, 0, est),
			time.Date(2026, 9, 13, 23, 59, 0, 0, est),
			true,
		},
		{
			"just before and just after midnight",
			time.Date(2026, 9, 13, 23, 59, 59, 0, est),
			time.Date(2026, 9, 14, 0, 0, 1, 0, est),
			false,
		},
		{
			"the same instant, read in two offsets that disagree about the date",
			time.Date(2026, 9, 14, 1, 0, 0, 0, time.UTC),
			time.Date(2026, 9, 13, 21, 0, 0, 0, est),
			false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := sameDay(c.a, c.b); got != c.want {
				t.Errorf("sameDay(%v, %v) = %v, want %v", c.a, c.b, got, c.want)
			}
		})
	}
}

// TestLiveAndScheduleURLsNameTheParksEntity is buildURL's park-wait-times
// counterpart: both upstream requests carry the entity id this module
// resolved for the park, and nothing this module was not handed
// (SRS065<!-- The park-wait-times module takes what it shows from one external wait-times source -->).
func TestLiveAndScheduleURLsNameTheParksEntity(t *testing.T) {
	park := supported[capturedSlug]

	live := liveURL(park.entityID)
	if !strings.Contains(live, park.entityID) || !strings.HasSuffix(live, "/live") {
		t.Errorf("liveURL(%q) = %q, want the entity id and the /live suffix", park.entityID, live)
	}
	if !strings.HasPrefix(live, "https://") {
		t.Errorf("liveURL(%q) = %q, want an https request", park.entityID, live)
	}

	schedule := scheduleURL(park.entityID)
	if !strings.Contains(schedule, park.entityID) || !strings.HasSuffix(schedule, "/schedule") {
		t.Errorf("scheduleURL(%q) = %q, want the entity id and the /schedule suffix", park.entityID, schedule)
	}
}

// TestTST079_ThePolicyHoldsAnAnswerNoLongerThanTheFreshnessBound is the unit
// half of TST079, reading this module's registered policy against
// SRS062<!-- The wait a viewer sees is no more than five minutes behind its source -->'s
// figure rather than against itself. The render half — that the display
// follows a changed answer on this cadence without being reloaded — is
// park_wait_times.spec.ts's.
func TestTST079_ThePolicyHoldsAnAnswerNoLongerThanTheFreshnessBound(t *testing.T) {
	policy := Config()

	const bound = 5 * time.Minute
	if policy.SuccessTTL > bound {
		t.Errorf("SuccessTTL = %s, want an answer held no longer than %s", policy.SuccessTTL, bound)
	}
}

// TestTST080_ThePolicyComesToOnceEveryFiveMinutesForAPark reads this module's
// half of
// SRS063<!-- The park-wait-times module asks an answering source at most once every five minutes for a park -->:
// the interval it registers, against what obliged it rather than against
// itself. What the framework then does with that interval — one upstream
// call per interval for one park's one endpoint, and never a second in flight
// while a first has not answered — is the router package's to read, against a
// fixture rather than these numbers; TestTST080_IntegrationParkKeysAreCachedIndependently
// below reads the module's own contribution: that a park's cache key is its
// own, distinct from every other park's.
func TestTST080_ThePolicyComesToOnceEveryFiveMinutesForAPark(t *testing.T) {
	policy := Config()

	const bound = 5 * time.Minute
	if policy.SuccessTTL > bound {
		t.Errorf("a %s cache interval asks for one park's live data oftener than once every %s, want no oftener than that",
			policy.SuccessTTL, bound)
	}
	if policy.RequestsPerMinute < 1 || policy.Burst < policy.RequestsPerMinute {
		t.Errorf("the bucket refills at %d a minute and holds %d, want a backstop that does not bind first",
			policy.RequestsPerMinute, policy.Burst)
	}
}

// TestTST081_ThePolicyComesToOnceEveryFiveMinutesForAFailingPark reads this
// module's half of
// SRS064<!-- The park-wait-times module asks a failing source no more often than once every five minutes -->:
// the interval it registers, against what obliged it. What the framework does
// with that interval belongs to the router package.
func TestTST081_ThePolicyComesToOnceEveryFiveMinutesForAFailingPark(t *testing.T) {
	policy := Config()

	const bound = 5 * time.Minute
	if policy.NegativeTTL > bound {
		t.Errorf("a %s failure interval asks for one park oftener than once every %s, want no oftener than that",
			policy.NegativeTTL, bound)
	}
}

// TestThePolicyIsComplete reads what an entry requires of any policy. Unlike
// the weather module's, this module's SuccessTTL and NegativeTTL are read
// from the same figure (Config's own doc comment), so there is no "failure
// retried sooner" relation to assert between them here.
func TestThePolicyIsComplete(t *testing.T) {
	policy := Config()

	if policy.SuccessTTL <= 0 || policy.NegativeTTL <= 0 || policy.RequestsPerMinute <= 0 ||
		policy.Burst <= 0 || policy.Timeout <= 0 || policy.MaxBytes <= 0 {
		t.Errorf("the policy leaves a value unset: %+v", policy)
	}
}

// successTransport answers every call as a success, from the body given for
// the URL it was asked, and counts every URL it was asked for.
type successTransport struct {
	calls   map[string]*atomic.Int64
	bodyFor func(url string) []byte
}

func (s successTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	url := r.URL.String()
	if counter, ok := s.calls[url]; ok {
		counter.Add(1)
	} else {
		fresh := &atomic.Int64{}
		fresh.Add(1)
		s.calls[url] = fresh
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(s.bodyFor(url))),
		Header:     make(http.Header),
	}, nil
}

// TestTST080_IntegrationParkKeysAreCachedIndependently reads the integration
// half of TST080<!-- an answering source is asked at most once every five
// minutes per park -->: fetchPark's two calls for one park are cached under
// that park's own keys, so calling it again for the same park inside the
// freshness window costs no further upstream call, and a second park's own
// fetch is unaffected by the first's cache — two parks are never held under
// one shared key. The five-minute bound itself is the policy assertion
// above; what this proves is this module's own per-park keying, which the
// framework's generic cache tests cannot, having no notion of "a park".
func TestTST080_IntegrationParkKeysAreCachedIndependently(t *testing.T) {
	live := liveResponseBytes(t)
	schedule := scheduleResponseBytes(t)

	transport := successTransport{
		calls: make(map[string]*atomic.Int64),
		bodyFor: func(url string) []byte {
			if strings.HasSuffix(url, "/live") {
				return live
			}
			return schedule
		},
	}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	magicKingdom := supported["magic-kingdom"]
	epcot := supported["epcot"]

	if _, err := fetchPark(ctx, "magic-kingdom", magicKingdom); err != nil {
		t.Fatalf("fetchPark(magic-kingdom) #1: unexpected error: %v", err)
	}
	if _, err := fetchPark(ctx, "magic-kingdom", magicKingdom); err != nil {
		t.Fatalf("fetchPark(magic-kingdom) #2: unexpected error: %v", err)
	}

	magicKingdomCalls := int64(0)
	for url, counter := range transport.calls {
		if strings.Contains(url, magicKingdom.entityID) {
			magicKingdomCalls += counter.Load()
		}
	}
	if magicKingdomCalls != 2 {
		t.Errorf("magic kingdom's own two endpoints cost %d upstream calls across two fetches, want 2 (one live, one schedule, the second fetch served from cache)", magicKingdomCalls)
	}

	if _, err := fetchPark(ctx, "epcot", epcot); err != nil {
		t.Fatalf("fetchPark(epcot): unexpected error: %v", err)
	}
	epcotCalls := int64(0)
	for url, counter := range transport.calls {
		if strings.Contains(url, epcot.entityID) {
			epcotCalls += counter.Load()
		}
	}
	if epcotCalls != 2 {
		t.Errorf("epcot's own two endpoints cost %d upstream calls, want 2 — a park's cache key must not be shared with another park's", epcotCalls)
	}
}

// failingTransport answers every call with a status this module's pipeline
// classifies as a failure, and counts the calls it received.
type failingTransport struct {
	calls atomic.Int64
}

func (f *failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	f.calls.Add(1)
	return &http.Response{
		StatusCode: http.StatusServiceUnavailable,
		Body:       io.NopCloser(bytes.NewReader(nil)),
		Header:     make(http.Header),
	}, nil
}

// TestTST081_IntegrationAFailingParkIsRetriedNoOftenerThanTheNegativeInterval
// is TST081<!-- a failing source is asked no more than once every five
// minutes per park -->'s integration half: a park whose own upstream calls
// fail is held under the negative cache the same as a success is, so calling
// fetchPark for it again inside the failure window costs no further upstream
// call.
func TestTST081_IntegrationAFailingParkIsRetriedNoOftenerThanTheNegativeInterval(t *testing.T) {
	transport := &failingTransport{}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park := supported["magic-kingdom"]

	first, err := fetchPark(ctx, "magic-kingdom", park)
	if err != nil {
		t.Fatalf("fetchPark #1: unexpected error: %v", err)
	}
	if first.Available {
		t.Fatalf("fetchPark #1: available = true against a failing source, want false")
	}

	second, err := fetchPark(ctx, "magic-kingdom", park)
	if err != nil {
		t.Fatalf("fetchPark #2: unexpected error: %v", err)
	}
	if second.Available {
		t.Fatalf("fetchPark #2: available = true against a failing source, want false")
	}

	// Called far oftener than the bound permits, and yet the failing source's
	// endpoint was reached once: the live fetch's own failure is held.
	if calls := transport.calls.Load(); calls != 1 {
		t.Errorf("a park failing twice in a row over its held interval cost %d upstream calls, want 1", calls)
	}
}

// TestPostApiParkWaitTimesFansOutOverEveryConfiguredPark reads
// SRS054<!-- The park-wait-times module reports on the parks its configuration names -->
// through the module's own handler: a request naming several parks answers
// with every one of them, each carrying the answer given for its own entity
// id, in the order the request named them.
func TestPostApiParkWaitTimesFansOutOverEveryConfiguredPark(t *testing.T) {
	live := liveResponseBytes(t)
	transport := successTransport{
		calls:   make(map[string]*atomic.Int64),
		bodyFor: func(string) []byte { return live },
	}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["epcot","magic-kingdom"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}

	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 2 {
		t.Fatalf("parks = %d, want 2: %+v", len(payload.Parks), payload.Parks)
	}
	if payload.Parks[0].Id != "epcot" || payload.Parks[1].Id != "magic-kingdom" {
		t.Errorf("parks = [%s, %s], want the request's own order [epcot, magic-kingdom]",
			payload.Parks[0].Id, payload.Parks[1].Id)
	}
	for _, park := range payload.Parks {
		if !park.Available {
			t.Errorf("park %s: available = false, want true against a serving source", park.Id)
		}
		if park.Rides == nil || len(*park.Rides) == 0 {
			t.Errorf("park %s: carries no rides", park.Id)
		}
	}
}

// TestAParksOwnFailureDoesNotFailTheWholeRequest reads the owner's ruling on
// per-park graceful degradation: a park whose own upstream calls fail carries
// `available: false` and a reason, and the parks a request named that did
// answer are unaffected.
func TestAParksOwnFailureDoesNotFailTheWholeRequest(t *testing.T) {
	live := liveResponseBytes(t)
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.String(), supported["magic-kingdom"].entityID) {
			return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["magic-kingdom","epcot"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s) — one park's failure must not fail the whole request", recorder.Code, http.StatusOK, recorder.Body)
	}

	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 2 {
		t.Fatalf("parks = %d, want 2: %+v", len(payload.Parks), payload.Parks)
	}

	magicKingdom, epcot := payload.Parks[0], payload.Parks[1]
	if magicKingdom.Available {
		t.Error("magic-kingdom: available = true against a failing source, want false")
	}
	if magicKingdom.Message == nil || *magicKingdom.Message == "" {
		t.Error("magic-kingdom: carries no message explaining its own failure")
	}
	if magicKingdom.Rides != nil {
		t.Error("magic-kingdom: carries rides despite being unavailable")
	}
	if !epcot.Available {
		t.Error("epcot: available = false, want true — the other park's failure must not reach it")
	}
	if epcot.Rides == nil || len(*epcot.Rides) == 0 {
		t.Error("epcot: carries no rides despite its own source serving")
	}
}

// TestAParkWhoseResponseCannotBeShapedIsUnavailable is fetchPark's other
// failure path: a live response the pipeline reads as a success but this
// module cannot shape is this park's own failure, distinct from an upstream
// call that failed outright.
func TestAParkWhoseResponseCannotBeShapedIsUnavailable(t *testing.T) {
	transport := roundTrip(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader([]byte("not json"))), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park, err := fetchPark(ctx, "magic-kingdom", supported["magic-kingdom"])
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if park.Available {
		t.Error("available = true for a response that could not be shaped, want false")
	}
	if park.Message == nil || *park.Message != errMalformedPayload.Error() {
		t.Errorf("Message = %v, want %q", park.Message, errMalformedPayload.Error())
	}
}

// TestAParkWithNoOperatingScheduleEntryStillAnswersWithItsRides is the
// quieter-content half of fetchPark: a schedule that could not be shaped
// costs this park its hours only, not its rides, which is what
// SRS056<!-- The park-wait-times module puts each park's ride waits across the boundary -->
// owes a viewer regardless of whether the source reports hours for today.
func TestAParkWithNoOperatingScheduleEntryStillAnswersWithItsRides(t *testing.T) {
	live := liveResponseBytes(t)
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/live") {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
		}
		// The schedule call fails outright, distinct from a schedule the
		// source answered with no OPERATING entry — both leave Hours nil.
		return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park, err := fetchPark(ctx, "magic-kingdom", supported["magic-kingdom"])
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if !park.Available {
		t.Fatalf("available = false, want true — the rides answered even though the schedule did not")
	}
	if park.Hours != nil {
		t.Errorf("Hours = %+v, want nil for a schedule call that failed", park.Hours)
	}
	if park.Rides == nil || len(*park.Rides) == 0 {
		t.Error("carries no rides despite its own live call serving")
	}
}

// TestPostApiParkWaitTimesAnswersShuttingDownWhenTheCallersContextEnds
// reads the one failure PostApiParkWaitTimes maps itself, rather than
// through a module's own failureMessage: the caller's own context ending —
// this client gone, or the server shutting down — fails the whole read the
// same 503 outcome router.Route.Serve answers it with, because a read that
// cannot finish is not a reading of the parks it reached so far.
func TestPostApiParkWaitTimesAnswersShuttingDownWhenTheCallersContextEnds(t *testing.T) {
	// A transport that never answers, so the flight this request joins never
	// completes and the only way this test's call to Fetch can return is the
	// already-cancelled context below.
	block := make(chan struct{})
	transport := roundTrip(func(*http.Request) (*http.Response, error) {
		<-block
		return nil, errors.New("unreachable: this test never lets the call finish")
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { close(block); http.DefaultTransport = held })
	freshRoute(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	request := httptest.NewRequest(
		http.MethodPost, "/api/park-wait-times", strings.NewReader(`{"parks":["magic-kingdom"]}`),
	).WithContext(ctx)
	recorder := httptest.NewRecorder()

	ParkWaitTimesRoute{}.PostApiParkWaitTimes(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusServiceUnavailable, recorder.Body)
	}
	var failure boundary.UpstreamFailure
	if err := json.Unmarshal(recorder.Body.Bytes(), &failure); err != nil {
		t.Fatalf("reading the failure body %q: %v", recorder.Body, err)
	}
	if failure.Cause != "shutting-down" {
		t.Errorf("Cause = %q, want %q", failure.Cause, "shutting-down")
	}
}

// TestDecodeRequestRejectsWhatItMustAndAdmitsTrailingBytes reads decodeRequest
// directly: a body naming an unknown field or none of the schema's own field
// is refused, an empty list is refused even though it decodes, and bytes
// trailing a complete JSON value are left unread rather than refused.
func TestDecodeRequestRejectsWhatItMustAndAdmitsTrailingBytes(t *testing.T) {
	rejected := []string{
		`{}`,
		`{"parks":[]}`,
		`{"parks":["epcot"],"region":"orlando"}`,
		`not json`,
		``,
		`[]`,
	}
	for _, body := range rejected {
		t.Run(fmt.Sprintf("rejects %q", body), func(t *testing.T) {
			if _, err := decodeRequest([]byte(body)); err == nil {
				t.Errorf("decodeRequest(%q): no error, want one", body)
			}
		})
	}

	admitted, err := decodeRequest([]byte(`{"parks":["epcot"]}trailing`))
	if err != nil {
		t.Fatalf("decodeRequest: unexpected error: %v", err)
	}
	if len(admitted.Parks) != 1 || admitted.Parks[0] != "epcot" {
		t.Errorf("decodeRequest = %+v, want one park named epcot", admitted)
	}
}

// errReadCloser is an io.ReadCloser whose Read always fails, the shape
// PostApiParkWaitTimes's io.ReadAll error path needs and a real request body
// cannot otherwise be made to produce.
type errReadCloser struct{}

func (errReadCloser) Read([]byte) (int, error) {
	return 0, errors.New("errReadCloser: synthetic read failure")
}

func (errReadCloser) Close() error { return nil }

func TestARequestBodyThatCannotBeReadIsRejected(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/park-wait-times", errReadCloser{})

	ParkWaitTimesRoute{}.PostApiParkWaitTimes(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
	}
}

// TestWriteJSONAnswersInternalServerErrorForAValueThatCannotBeEncoded is
// writeJSON's own failure path — reached only by a payload that cannot be
// marshalled, which nothing this module builds can produce, so it is driven
// directly rather than through the handler.
func TestWriteJSONAnswersInternalServerErrorForAValueThatCannotBeEncoded(t *testing.T) {
	recorder := httptest.NewRecorder()
	// A channel is the standard library's own example of a value json.Marshal
	// refuses.
	writeJSON(recorder, http.StatusOK, make(chan int))

	if recorder.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
}

// fuzzHangBudget is the per-input wall-clock deadline runWithin enforces.
const fuzzHangBudget = time.Second

// runWithin fails the test if fn has not returned within budget, naming the
// target that hung, or if fn returns a non-nil error. fn runs on its own
// goroutine and reports through its return value: FailNow must be called only
// from the goroutine running the test.
func runWithin(t *testing.T, budget time.Duration, name string, fn func() error) {
	t.Helper()

	done := make(chan error, 1)
	go func() {
		done <- fn()
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	case <-time.After(budget):
		t.Fatalf("%s did not return within %s", name, budget)
	}
}

// FuzzShapeRides drives shapeRides with bytes, seeded from the captured live
// response (`check-fuzz`, docs/CI.md § Backend fuzz), and asserts two calls on
// the same bytes are equal by their marshalled form.
func FuzzShapeRides(f *testing.F) {
	seed, err := os.ReadFile(filepath.FromSlash(capturedLive))
	if err != nil {
		f.Fatalf("reading the captured response: %v", err)
	}
	f.Add(seed)

	f.Fuzz(func(t *testing.T, body []byte) {
		runWithin(t, fuzzHangBudget, "FuzzShapeRides", func() error {
			first, firstErr := shapeRides(body)
			second, secondErr := shapeRides(body)
			if (firstErr == nil) != (secondErr == nil) {
				return fmt.Errorf("shapeRides is not deterministic: first = %v, second = %v", firstErr, secondErr)
			}
			if firstErr != nil {
				return nil
			}

			firstJSON, err := json.Marshal(first)
			if err != nil {
				return fmt.Errorf("a non-error result did not marshal: %v", err)
			}
			secondJSON, err := json.Marshal(second)
			if err != nil {
				return fmt.Errorf("a non-error result did not marshal: %v", err)
			}
			if string(firstJSON) != string(secondJSON) {
				return fmt.Errorf("shapeRides is not deterministic: %s vs %s", firstJSON, secondJSON)
			}
			return nil
		})
	})
}

// FuzzDecodeRequest drives decodeRequest with the bytes a request body
// carries (`check-fuzz`, docs/CI.md § Backend fuzz), seeded from the bodies
// TestDecodeRequestRejectsWhatItMustAndAdmitsTrailingBytes exercises.
func FuzzDecodeRequest(f *testing.F) {
	for _, body := range []string{
		`{}`, `{"parks":[]}`, `{"parks":["epcot"],"region":"orlando"}`,
		`not json`, ``, `[]`, `{"parks":["epcot"]}trailing`,
	} {
		f.Add([]byte(body))
	}

	f.Fuzz(func(t *testing.T, body []byte) {
		runWithin(t, fuzzHangBudget, "FuzzDecodeRequest", func() error {
			_, _ = decodeRequest(body)
			return nil
		})
	})
}

// FuzzValidateParks drives validate with a park slug (`check-fuzz`,
// docs/CI.md § Backend fuzz), seeded from the module's own supported set and
// from values outside it.
func FuzzValidateParks(f *testing.F) {
	for slug := range supported {
		f.Add(slug)
	}
	for _, slug := range []string{"", "disney-world", "Magic-Kingdom", "magic-kingdom "} {
		f.Add(slug)
	}

	f.Fuzz(func(t *testing.T, slug string) {
		runWithin(t, fuzzHangBudget, "FuzzValidateParks", func() error {
			_, _ = validate(slug)
			return nil
		})
	})
}

// TestFailureMessageNamesEachOutcomeThePipelineDistinguishes reads
// failureMessage against every Kind the upstream package declares, so a
// park's own failure always carries a reason a viewer can read — including
// the one outcome (Success) failureMessage is never reached for in
// production, which its default case still answers rather than panicking on.
func TestFailureMessageNamesEachOutcomeThePipelineDistinguishes(t *testing.T) {
	for _, kind := range []upstream.Kind{
		upstream.Unreachable,
		upstream.Timeout,
		upstream.UpstreamStatus,
		upstream.Oversize,
		upstream.RateLimited,
		upstream.Success,
	} {
		message := failureMessage(upstream.Result{Kind: kind})
		if message == "" {
			t.Errorf("failureMessage(%s): empty text, want a reason a viewer can read", kind)
		}
	}
}
