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
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// The two captured responses every shaping case runs against: one park's real
// live-data answer and its real schedule answer, both taken for Magic Kingdom.
// No case here reaches a network.
const (
	capturedLive     = "testdata/mk-live.json"
	capturedSchedule = "testdata/mk-schedule.json"
)

// epcotEntityID is Epcot's known themeparks.wiki entity id, one of the six in
// knownParks — a second known-good id besides magicKingdomEntityID, for tests
// distinguishing two parks' own cache keys and upstream calls. Derived through
// resolvePark rather than restated, so it cannot drift from knownParks.
var _, epcotEntityID, _ = resolvePark("Epcot")

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
	freshRouteWithConfig(t, Config())
}

// freshRouteWithConfig is freshRoute's own build, against a caller-supplied
// policy — the router package's own fake clock is package-private
// (router_test.go, rate_test.go), so a short real interval stands in here.
func freshRouteWithConfig(t *testing.T, cfg upstream.Config) {
	t.Helper()
	held := served
	served = router.NewRoute(router.Entry{
		Config: cfg,
		Source: Source,
		Shape:  func(body []byte) (any, error) { return shapeRides(body, noExclusion) },
	})
	t.Cleanup(func() { served = held })
}

// uuidShape is the shape of a themeparks.wiki entity id.
var uuidShape = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// liveURL and scheduleURL restate route.go's inline upstream-URL shape, test-local: a case that
// checks which URL a request was captured under needs the same string production actually built, to
// key against or compare against.
func liveURL(entityID string) string     { return entityBaseURL + entityID + "/live" }
func scheduleURL(entityID string) string { return entityBaseURL + entityID + "/schedule" }

// noExclusion admits every row — every shapeRides/fetchPark call below with nothing of its own to
// filter passes this.
func noExclusion(liveRow) bool { return false }

// intp is a pointer to an int literal — the shape waitMinutes takes on the
// boundary, a posted wait or nil.
func intp(n int) *int { return &n }

// sameWaitMinutes reports whether two waitMinutes values agree: both absent,
// or both present and equal.
func sameWaitMinutes(a, b *int) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// showWaitMinutes renders a waitMinutes value for a failure message.
func showWaitMinutes(p *int) string {
	if p == nil {
		return "null"
	}
	return fmt.Sprintf("%d", *p)
}

// TestTST073_ShapingBuildsTheParksRidesFromTheCapturedResponse reads
// SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->
// against the captured live-data response, with no network: only the
// attraction rows are kept, in the source's own order, each carrying its name,
// its operating state, and its posted wait as the source reported it.
func TestTST073_ShapingBuildsTheParksRidesFromTheCapturedResponse(t *testing.T) {
	rides, err := shapeRides(liveResponseBytes(t), noExclusion)
	if err != nil {
		t.Fatalf("shapeRides: unexpected error: %v", err)
	}

	// The capture carries a park row, a show row and a restaurant row beside
	// its seven attractions; only the seven are kept.
	want := []boundary.ParkWaitTimesRide{
		{Name: "The Hall of Presidents", State: boundary.Closed},
		{Name: "Mad Tea Party", State: boundary.Operating, WaitMinutes: intp(10)},
		{Name: "Casey Jr. Splash 'N' Soak Station", State: boundary.Closed},
		{Name: "Seven Dwarfs Mine Train", State: boundary.Operating, WaitMinutes: intp(25)},
		{Name: "Walt Disney's Carousel of Progress", State: boundary.Refurb},
		{Name: "The Barnstormer", State: boundary.Operating, WaitMinutes: intp(5)},
		{Name: "Cinderella Castle", State: boundary.Closed},
	}
	if len(rides) != len(want) {
		t.Fatalf("shaped %d rides, want %d: %+v", len(rides), len(want), rides)
	}
	for index, ride := range rides {
		w := want[index]
		if ride.Name != w.Name {
			t.Errorf("ride %d name = %q, want %q", index, ride.Name, w.Name)
			continue
		}
		if ride.State != w.State {
			t.Errorf("ride %d (%s) state = %q, want %q", index, ride.Name, ride.State, w.State)
		}
		if !sameWaitMinutes(ride.WaitMinutes, w.WaitMinutes) {
			t.Errorf("ride %d (%s) waitMinutes = %s, want %s",
				index, ride.Name, showWaitMinutes(ride.WaitMinutes), showWaitMinutes(w.WaitMinutes))
		}
	}
}

// TestShapeRidesReadsTheBodyWithoutWritingToIt covers the framework's own
// condition on a shaping function: the body is the cached response every
// caller it is served to holds.
func TestShapeRidesReadsTheBodyWithoutWritingToIt(t *testing.T) {
	body := liveResponseBytes(t)
	held := string(body)

	if _, err := shapeRides(body, noExclusion); err != nil {
		t.Fatalf("shapeRides: unexpected error: %v", err)
	}
	if string(body) != held {
		t.Error("shapeRides wrote to the body it was given")
	}
}

// TestShapeRidesRefusesABodyThatIsNotJSON is shapeRides's own decode failure.
func TestShapeRidesRefusesABodyThatIsNotJSON(t *testing.T) {
	if _, err := shapeRides([]byte("not json"), noExclusion); err == nil {
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
		name        string
		status      string
		queue       *queueBlock
		wantState   boundary.ParkWaitTimesState
		wantMinutes *int
		wantErr     bool
	}{
		{"an operating ride with a reported wait", "OPERATING", operating, boundary.Operating, intp(minutes), false},
		{"a down ride", "DOWN", nil, boundary.Down, nil, false},
		{"a closed ride", "CLOSED", nil, boundary.Closed, nil, false},
		{"a ride under refurbishment", "REFURBISHMENT", nil, boundary.Refurb, nil, false},
		{"an operating ride with no queue block at all", "OPERATING", nil, "", nil, true},
		{"an operating ride whose queue carries no standby line", "OPERATING", &queueBlock{}, "", nil, true},
		{"an operating ride whose standby line carries no wait", "OPERATING", &queueBlock{Standby: &standbyBlock{}}, "", nil, true},
		{"a status outside the source's own enum", "BOARDING_GROUP", nil, "", nil, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotState, gotMinutes, err := shapeWait(c.status, c.queue)
			if c.wantErr {
				if err == nil {
					t.Fatalf("shapeWait(%q): no error, want one", c.status)
				}
				return
			}
			if err != nil {
				t.Fatalf("shapeWait(%q): unexpected error: %v", c.status, err)
			}
			if gotState != c.wantState {
				t.Errorf("shapeWait(%q) state = %q, want %q", c.status, gotState, c.wantState)
			}
			if !sameWaitMinutes(gotMinutes, c.wantMinutes) {
				t.Errorf("shapeWait(%q) waitMinutes = %s, want %s",
					c.status, showWaitMinutes(gotMinutes), showWaitMinutes(c.wantMinutes))
			}
		})
	}
}

// TestTST073_AResponseMissingAValueTheRideNeedsIsNotShaped is the other half
// of the shaping obligation: a response missing a value a kept row needs is
// an error rather than a payload carrying a zero nobody reported. An
// OPERATING row reporting no wait is not among these —
// TestShapeRidesFiltersAnOperatingRowWithNoPostedWait covers that row.
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

			rides, err := shapeRides(broken, noExclusion)
			if err == nil {
				t.Fatalf("shapeRides: shaped %+v, want an error", rides)
			}
			if err.Error() == "" {
				t.Error("the error says nothing about what could not be read")
			}
		})
	}
}

// TestShapeRidesFiltersAnOperatingRowWithNoPostedWait reads
// SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->
// against the captured response with one attraction mutated to report
// OPERATING with no posted wait — the shape themeparks.wiki gives a
// walk-through landmark, typed ATTRACTION no differently from a queued
// ride: the row is left out of the rides list, every other row still
// shapes, and the call itself does not error.
func TestShapeRidesFiltersAnOperatingRowWithNoPostedWait(t *testing.T) {
	var read map[string]any
	if err := json.Unmarshal(liveResponseBytes(t), &read); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	rows := read["liveData"].([]any)
	landmark := rows[2].(map[string]any)
	landmarkName := landmark["name"].(string)
	landmark["status"] = "OPERATING"
	landmark["queue"] = map[string]any{}

	body, err := json.Marshal(read)
	if err != nil {
		t.Fatalf("writing the modified response: %v", err)
	}

	rides, err := shapeRides(body, noExclusion)
	if err != nil {
		t.Fatalf("shapeRides: unexpected error: %v", err)
	}
	for _, ride := range rides {
		if ride.Name == landmarkName {
			t.Errorf("rides carries %q, want it filtered out as not a ride", landmarkName)
		}
	}
	// The capture's seven attractions, minus the one turned into a
	// no-wait landmark above; the show, restaurant and park rows were
	// never carried to begin with.
	if len(rides) != 6 {
		t.Errorf("shaped %d rides, want 6 (the capture's 7 attractions minus the filtered landmark): %+v", len(rides), rides)
	}
}

// TestTST073_ShapingBuildsTheParksHoursFromTheCapturedResponse reads the
// hours half of
// SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->
// against the captured schedule response: the `OPERATING`-typed entry for the
// day named is what is read, not an early entry or a ticketed evening event
// on the same date.
func TestTST073_ShapingBuildsTheParksHoursFromTheCapturedResponse(t *testing.T) {
	// The capture's first OPERATING entry is 2026-09-13, 08:00-04:00 to
	// 18:00-04:00; "now" is read against its own offset, so any hour of that
	// same calendar day in -04:00 selects it.
	now := time.Date(2026, 9, 13, 12, 0, 0, 0, time.UTC)

	_, hours, err := shapeSchedule(scheduleResponseBytes(t), now)
	if err != nil {
		t.Fatalf("shapeSchedule: unexpected error: %v", err)
	}
	if hours == nil {
		t.Fatal("shapeSchedule: nil hours, want today's operating hours")
	}
	if hours.Open != "2026-09-13T08:00:00-04:00" {
		t.Errorf("Open = %q, want the day's OPERATING entry, not its early entry or its ticketed event", hours.Open)
	}
	if hours.Close != "2026-09-13T18:00:00-04:00" {
		t.Errorf("Close = %q, want the day's OPERATING entry", hours.Close)
	}
}

// TestShapeScheduleReturnsNilForADayTheSourceReportsNoOperatingEntry is
// shapeSchedule's absence path: a day the source reports no OPERATING entry for
// is nil rather than an error, the park may simply be closed that day
// (boundary/openapi.yaml's ParkWaitTimesHours).
func TestShapeScheduleReturnsNilForADayTheSourceReportsNoOperatingEntry(t *testing.T) {
	// A day one past the capture's last OPERATING entry.
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)

	_, hours, err := shapeSchedule(scheduleResponseBytes(t), now)
	if err != nil {
		t.Fatalf("shapeSchedule: unexpected error: %v", err)
	}
	if hours != nil {
		t.Errorf("shapeSchedule = %+v, want nil hours for a day the source reports no OPERATING entry for", hours)
	}
}

// TestShapeScheduleRefusesAMalformedScheduleEntry covers shapeSchedule's own
// failure paths: a body that is not JSON, and an OPERATING entry missing a
// timestamp or carrying one this module cannot read.
func TestShapeScheduleRefusesAMalformedScheduleEntry(t *testing.T) {
	if _, _, err := shapeSchedule([]byte("not json"), time.Now()); err == nil {
		t.Error("shapeSchedule: no error for a body that is not JSON")
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
			_, hours, err := shapeSchedule(broken, now)
			if err == nil {
				t.Fatalf("shapeSchedule: shaped hours %+v, want an error", hours)
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

// TestShapeScheduleReturnsNilForADayWhoseOnlyEntriesAreTicketed is
// shapeSchedule's own day-selection read where a date carries schedule content
// but none of it OPERATING-typed — distinct from
// TestShapeScheduleReturnsNilForADayTheSourceReportsNoOperatingEntry (a date
// past the capture's last entry entirely), this is a date the source
// reports on, entirely as TICKETED_EVENT.
func TestShapeScheduleReturnsNilForADayWhoseOnlyEntriesAreTicketed(t *testing.T) {
	body := []byte(`{"schedule":[{"type":"TICKETED_EVENT","openingTime":"2026-09-20T09:00:00-04:00","closingTime":"2026-09-20T22:00:00-04:00"}]}`)
	now := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)

	_, hours, err := shapeSchedule(body, now)
	if err != nil {
		t.Fatalf("shapeSchedule: unexpected error: %v", err)
	}
	if hours != nil {
		t.Errorf("shapeSchedule = %+v, want nil hours for a day whose only entry is ticketed", hours)
	}
}

// TestShapeScheduleReturnsNilForAnEmptySchedule is shapeSchedule's own boundary at
// zero: a `schedule` array with nothing in it at all, distinct from every
// other absence case above which still carries entries to skip past.
func TestShapeScheduleReturnsNilForAnEmptySchedule(t *testing.T) {
	_, hours, err := shapeSchedule([]byte(`{"schedule":[]}`), time.Now())
	if err != nil {
		t.Fatalf("shapeSchedule: unexpected error: %v", err)
	}
	if hours != nil {
		t.Errorf("shapeSchedule = %+v, want nil hours for an empty schedule", hours)
	}
}

// TestShapeScheduleSelectsTheDayInTheOperatingEntrysOwnOffset reads
// shapeSchedule's day-selection (SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->)
// against an offset other than the captured fixture's own -04:00: "today" is
// judged in the OPERATING entry's own offset, never a fixed offset or the
// caller's. sameDay's own semantics are pinned by TestSameDay; this is
// shapeSchedule's wiring of it.
func TestShapeScheduleSelectsTheDayInTheOperatingEntrysOwnOffset(t *testing.T) {
	cases := []struct {
		name              string
		open, close       string
		now               time.Time
		wantHoursSelected bool
	}{
		{
			name:  "a UTC-day/local-day boundary crossing: now is still 09-13 in UTC but already 09-14 in the entry's own +09:00 offset, and the entry is dated 09-14",
			open:  "2026-09-14T00:30:00+09:00",
			close: "2026-09-14T22:00:00+09:00",
			// 2026-09-13T16:30:00Z is 2026-09-14T01:30:00+09:00.
			now:               time.Date(2026, 9, 13, 16, 30, 0, 0, time.UTC),
			wantHoursSelected: true,
		},
		{
			name:              "the same instant against an entry dated 09-13 (in its own +09:00 offset, that day has already passed) is correctly excluded",
			open:              "2026-09-13T00:30:00+09:00",
			close:             "2026-09-13T22:00:00+09:00",
			now:               time.Date(2026, 9, 13, 16, 30, 0, 0, time.UTC),
			wantHoursSelected: false,
		},
		{
			name:  "a non -04:00 offset (post-DST-fallback US Eastern, -05:00) still selects its own day",
			open:  "2026-11-02T09:00:00-05:00",
			close: "2026-11-02T21:00:00-05:00",
			// 2026-11-02T15:00:00Z is 2026-11-02T10:00:00-05:00, the same day.
			now:               time.Date(2026, 11, 2, 15, 0, 0, 0, time.UTC),
			wantHoursSelected: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			body := []byte(fmt.Sprintf(`{"schedule":[{"type":"OPERATING","openingTime":%q,"closingTime":%q}]}`, c.open, c.close))
			_, hours, err := shapeSchedule(body, c.now)
			if err != nil {
				t.Fatalf("shapeSchedule: unexpected error: %v", err)
			}
			if !c.wantHoursSelected {
				if hours != nil {
					t.Errorf("shapeSchedule = %+v, want nil — the entry's own day does not match now in its own offset", hours)
				}
				return
			}
			if hours == nil {
				t.Fatal("shapeSchedule = nil, want the entry selected in its own offset")
			}
			if hours.Open != c.open || hours.Close != c.close {
				t.Errorf("Open/Close = %q/%q, want %q/%q", hours.Open, hours.Close, c.open, c.close)
			}
		})
	}
}

// TestLiveAndScheduleURLsNameTheParksEntity reads the upstream requests a
// real fetch actually issues, not a URL-building helper in isolation: both
// are exactly the entity id's own live and schedule URLs, nothing this
// module was not handed
// (SRS065<!-- The park-wait-times module takes what it shows from one external wait-times source -->).
func TestLiveAndScheduleURLsNameTheParksEntity(t *testing.T) {
	entityID := magicKingdomEntityID
	transport := &capturingTransport{body: liveResponseBytes(t)}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}

	transport.mu.Lock()
	urls := append([]string(nil), transport.urls...)
	transport.mu.Unlock()

	// Exact equality, not a substring/suffix check: a loose check would still
	// pass a call that carried the right id and suffix at the wrong host.
	wantLive, wantSchedule := liveURL(entityID), scheduleURL(entityID)
	if !slices.Contains(urls, wantLive) {
		t.Errorf("no request for %q among %v", wantLive, urls)
	}
	if !slices.Contains(urls, wantSchedule) {
		t.Errorf("no request for %q among %v", wantSchedule, urls)
	}
	for _, u := range urls {
		if u != wantLive && u != wantSchedule {
			t.Errorf("upstream request %q, want only the resolved entity's own live/schedule URLs", u)
		}
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
// the interval it registers, against what obliged it. What the framework
// does with that interval belongs to the router package;
// TestTST080_IntegrationParkKeysAreCachedIndependently below reads this
// module's own contribution — that a park's cache key is its own.
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

	// The interval holds the rate on this path: the route answers from the
	// held failure until it lapses, so one park costs one upstream call per
	// interval — a too-short interval is the violation.
	const bound = 5 * time.Minute
	if policy.NegativeTTL < bound {
		t.Errorf("a %s failure interval asks for one park oftener than once every %s, want no oftener than that",
			policy.NegativeTTL, bound)
	}
}

// TestThePolicyIsComplete reads what an entry requires of any policy.
// SuccessTTL and NegativeTTL are read from the same figure (Config's own
// doc comment), so there is no "failure retried sooner" relation to assert
// between them.
func TestThePolicyIsComplete(t *testing.T) {
	policy := Config()

	if policy.SuccessTTL <= 0 || policy.NegativeTTL <= 0 || policy.RequestsPerMinute <= 0 ||
		policy.Burst <= 0 || policy.Timeout <= 0 || policy.MaxBytes <= 0 {
		t.Errorf("the policy leaves a value unset: %+v", policy)
	}
}

// successTransport answers every call as a success, from the body given for
// the URL asked, and counts every URL asked for. Its own map is guarded by
// a mutex — a plain map is not concurrency-safe, and this transport is
// called from more than one goroutine at once (route.go's fan-out).
type successTransport struct {
	mu      sync.Mutex
	calls   map[string]*atomic.Int64
	bodyFor func(url string) []byte
}

func (s *successTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	url := r.URL.String()
	s.mu.Lock()
	counter, ok := s.calls[url]
	if !ok {
		counter = &atomic.Int64{}
		s.calls[url] = counter
	}
	s.mu.Unlock()
	counter.Add(1)
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(s.bodyFor(url))),
		Header:     make(http.Header),
	}, nil
}

// TestTST080_IntegrationParkKeysAreCachedIndependently reads the integration
// half of TST080<!-- an answering source is asked at most once every five
// minutes per park -->: fetchPark's two calls for one park are cached under
// that park's own keys, so a second call for the same park costs no
// further upstream call, and a second park's own fetch is unaffected by the
// first's — two parks never share a cache key.
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
	http.DefaultTransport = &transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()

	if _, err := fetchPark(ctx, "Magic Kingdom", noExclusion); err != nil {
		t.Fatalf("fetchPark(Magic Kingdom) #1: unexpected error: %v", err)
	}
	if _, err := fetchPark(ctx, "Magic Kingdom", noExclusion); err != nil {
		t.Fatalf("fetchPark(Magic Kingdom) #2: unexpected error: %v", err)
	}

	magicKingdomCalls := int64(0)
	for url, counter := range transport.calls {
		if strings.Contains(url, magicKingdomEntityID) {
			magicKingdomCalls += counter.Load()
		}
	}
	if magicKingdomCalls != 2 {
		t.Errorf("magic kingdom's own two endpoints cost %d upstream calls across two fetches, want 2 (one live, one schedule, the second fetch served from cache)", magicKingdomCalls)
	}

	if _, err := fetchPark(ctx, "Epcot", noExclusion); err != nil {
		t.Fatalf("fetchPark(Epcot): unexpected error: %v", err)
	}
	epcotCalls := int64(0)
	for url, counter := range transport.calls {
		if strings.Contains(url, epcotEntityID) {
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
// fail is held under the negative cache the same as a success, so calling
// fetchPark for it again inside the failure window costs no further
// upstream call, and a call once the window has elapsed does retry.
func TestTST081_IntegrationAFailingParkIsRetriedNoOftenerThanTheNegativeInterval(t *testing.T) {
	transport := &failingTransport{}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })

	// A real, short interval stands in for the registered five minutes: the
	// router package's own fake clock is package-private (router_test.go,
	// rate_test.go).
	const shrunkBound = 100 * time.Millisecond
	cfg := Config()
	cfg.NegativeTTL = shrunkBound
	freshRouteWithConfig(t, cfg)

	ctx := context.Background()

	first, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark #1: unexpected error: %v", err)
	}
	if first.Available {
		t.Fatalf("fetchPark #1: available = true against a failing source, want false")
	}

	second, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark #2: unexpected error: %v", err)
	}
	if second.Available {
		t.Fatalf("fetchPark #2: available = true against a failing source, want false")
	}

	// Called again well inside the interval, and yet the failing source's
	// endpoint was reached once: the live fetch's own failure is held.
	if calls := transport.calls.Load(); calls != 1 {
		t.Errorf("a park failing twice in a row inside its held interval cost %d upstream calls, want 1", calls)
	}

	// The interval elapses, and a further ask does retry.
	time.Sleep(shrunkBound + 150*time.Millisecond)

	third, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark #3: unexpected error: %v", err)
	}
	if third.Available {
		t.Fatalf("fetchPark #3: available = true against a failing source, want false")
	}
	if calls := transport.calls.Load(); calls != 2 {
		t.Errorf("a park asked again once its held interval elapsed cost %d upstream calls, want 2", calls)
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
	http.DefaultTransport = &transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Epcot","Magic Kingdom"]}`)
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
	// Each park carries the pretty name it was resolved to, in the request's own order — the wire
	// carries no id to check the order against instead.
	if payload.Parks[0].Name != "Epcot" || payload.Parks[1].Name != "Magic Kingdom" {
		t.Errorf("parks = [%s, %s], want the request's own order [Epcot, Magic Kingdom]",
			payload.Parks[0].Name, payload.Parks[1].Name)
	}
	// Each was fetched from the upstream at the identity resolvePark gave it (TST086: "fetched at
	// the identity recorded") — derived from resolvePark rather than restated, so this cannot drift
	// from the resolution.
	_, wantFirst, _ := resolvePark("Epcot")
	_, wantSecond, _ := resolvePark("Magic Kingdom")
	transport.mu.Lock()
	_, sawFirst := transport.calls[liveURL(wantFirst)]
	_, sawSecond := transport.calls[liveURL(wantSecond)]
	transport.mu.Unlock()
	if !sawFirst || !sawSecond {
		t.Errorf("no /live call carried the resolved identity for both Epcot (%s) and Magic Kingdom (%s)", wantFirst, wantSecond)
	}
	for _, park := range payload.Parks {
		if !park.Available {
			t.Errorf("park %s: available = false, want true against a serving source", park.Name)
		}
		if park.Rides == nil || len(*park.Rides) == 0 {
			t.Errorf("park %s: carries no rides", park.Name)
		}
	}
}

// TestPostApiParkWaitTimesPayloadCarriesNoParkID proves a served park carries
// no `id` key on the wire, read off the raw JSON rather than the generated
// struct so this stays meaningful once the field is gone from
// boundary.ParkWaitTimesPark.
func TestPostApiParkWaitTimesPayloadCarriesNoParkID(t *testing.T) {
	live := liveResponseBytes(t)
	held := http.DefaultTransport
	http.DefaultTransport = liveTransport(live)
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}

	var raw struct {
		Parks []map[string]json.RawMessage `json:"parks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &raw); err != nil {
		t.Fatalf("reading the served payload as raw JSON: %v", err)
	}
	if len(raw.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(raw.Parks), raw.Parks)
	}
	if _, present := raw.Parks[0]["id"]; present {
		t.Errorf(`park carries an "id" key on the wire, want none: %s`, recorder.Body)
	}
}

// TestAParksOwnFailureDoesNotFailTheWholeRequest: a park whose own upstream
// calls fail carries `available: false` and a reason; the parks that did
// answer are unaffected.
func TestAParksOwnFailureDoesNotFailTheWholeRequest(t *testing.T) {
	live := liveResponseBytes(t)
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.String(), magicKingdomEntityID) {
			return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom","epcot"]}`)
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
		t.Error("Magic Kingdom: available = true against a failing source, want false")
	}
	if magicKingdom.Message == nil || *magicKingdom.Message == "" {
		t.Error("Magic Kingdom: carries no message explaining its own failure")
	}
	if magicKingdom.Rides != nil {
		t.Error("Magic Kingdom: carries rides despite being unavailable")
	}
	if !epcot.Available {
		t.Error("epcot: available = false, want true — the other park's failure must not reach it")
	}
	if epcot.Rides == nil || len(*epcot.Rides) == 0 {
		t.Error("epcot: carries no rides despite its own source serving")
	}
}

// barrierTransport proves concurrency rather than timing it: every call
// blocks until n calls have arrived at once, then releases all of them
// together with a failure. A sequential fan-out can never reach n, so the
// safety timeout fires and fails the test outright — deterministic, with no
// wall-clock margin to go flaky under CI load.
type barrierTransport struct {
	mu       sync.Mutex
	arrived  int
	n        int
	release  chan struct{}
	timedOut atomic.Bool
}

func newBarrierTransport(n int, safety time.Duration) *barrierTransport {
	bt := &barrierTransport{n: n, release: make(chan struct{})}
	time.AfterFunc(safety, func() {
		bt.mu.Lock()
		defer bt.mu.Unlock()
		select {
		case <-bt.release:
		default:
			bt.timedOut.Store(true)
			close(bt.release)
		}
	})
	return bt
}

func (bt *barrierTransport) RoundTrip(*http.Request) (*http.Response, error) {
	bt.mu.Lock()
	bt.arrived++
	if bt.arrived >= bt.n {
		select {
		case <-bt.release:
		default:
			close(bt.release)
		}
	}
	bt.mu.Unlock()

	<-bt.release
	return nil, errors.New("barrierTransport: simulated failure, released once every park's call was in flight at once")
}

// TestColdStartFetchesEveryParkConcurrentlyNotSequentially reads the
// fan-out end-to-end: with the cache cold, every configured park's own
// live-data call is genuinely in flight at once (barrierTransport's own
// proof, not a timing inference), and the whole request still answers with
// each park marked unavailable rather than failing outright.
func TestColdStartFetchesEveryParkConcurrentlyNotSequentially(t *testing.T) {
	parks := []string{"Magic Kingdom", "Epcot", "Hollywood Studios"}
	barrier := newBarrierTransport(len(parks), 2*time.Second)

	held := http.DefaultTransport
	http.DefaultTransport = barrier
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom","Epcot","Hollywood Studios"]}`)

	if barrier.timedOut.Load() {
		t.Fatal("fewer than three parks' own calls were ever in flight at once — parks were fetched one at a time, not concurrently")
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s) — every park's own failure is that park's, not the whole request's",
			recorder.Code, http.StatusOK, recorder.Body)
	}

	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != len(parks) {
		t.Fatalf("parks = %d, want %d: %+v", len(payload.Parks), len(parks), payload.Parks)
	}
	for _, park := range payload.Parks {
		if park.Available {
			t.Errorf("%s: available = true against a source that never answered, want false", park.Name)
		}
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
	park, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if park.Available {
		t.Error("available = true for a response that could not be shaped, want false")
	}
	if park.Message == nil || *park.Message != errMalformedPayload.Error() {
		t.Errorf("Message = %v, want %q", park.Message, errMalformedPayload.Error())
	}
	// A recognized park keeps its pretty name even where its reading failed.
	if park.Name != "Magic Kingdom" {
		t.Errorf("Name = %q, want the pretty name %q carried through the failure", park.Name, "Magic Kingdom")
	}
}

// TestAParkWithNoOperatingScheduleEntryStillAnswersWithItsRides is the
// quieter-content half of fetchPark: a schedule that could not be shaped
// costs this park its hours only, not its rides, which is what
// SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->
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
	park, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
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

// TestAParkWithANoWaitLandmarkStaysAvailable is fetchPark's own read of
// SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->:
// a park whose live response mixes a landmark reporting OPERATING with no
// posted wait among its real rides does not cascade to `available: false`
// over that one row — it answers with the landmark filtered and its real
// rides intact.
func TestAParkWithANoWaitLandmarkStaysAvailable(t *testing.T) {
	var read map[string]any
	if err := json.Unmarshal(liveResponseBytes(t), &read); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	rows := read["liveData"].([]any)
	landmark := rows[2].(map[string]any)
	landmarkName := landmark["name"].(string)
	landmark["status"] = "OPERATING"
	landmark["queue"] = map[string]any{}
	live, err := json.Marshal(read)
	if err != nil {
		t.Fatalf("writing the modified response: %v", err)
	}

	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/live") {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if !park.Available {
		t.Fatalf("available = false, want true — a no-wait landmark must not cascade the whole park to unavailable")
	}
	if park.Rides == nil {
		t.Fatal("carries no rides despite its own live call serving")
	}
	for _, ride := range *park.Rides {
		if ride.Name == landmarkName {
			t.Errorf("rides carries %q, want it filtered out as not a ride", landmarkName)
		}
	}
	if len(*park.Rides) != 6 {
		t.Errorf("shaped %d rides, want 6 (the capture's 7 attractions minus the filtered landmark): %+v", len(*park.Rides), *park.Rides)
	}
}

// TestFetchParkDeliversHoursForATodayOperatingEntry reads fetchPark's own
// call to time.Now() on its positive path: a schedule whose OPERATING entry
// is today's carries that day's hours into the park's payload
// (SRS056<!-- The park-wait-times module puts each park's identity, hours, and ride waits across the boundary -->).
// The schedule fixture's OPERATING entry is built from today's own UTC date
// at test time, spanning the whole UTC day so no day-boundary is crossed
// however long the test takes to run.
func TestFetchParkDeliversHoursForATodayOperatingEntry(t *testing.T) {
	today := time.Now().UTC()
	open := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).Format(time.RFC3339)
	closes := time.Date(today.Year(), today.Month(), today.Day(), 23, 59, 0, 0, time.UTC).Format(time.RFC3339)
	schedule := []byte(fmt.Sprintf(`{"schedule":[{"type":"OPERATING","openingTime":%q,"closingTime":%q}]}`, open, closes))
	live := liveResponseBytes(t)

	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/live") {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(schedule)), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if !park.Available {
		t.Fatalf("available = false, want true")
	}
	if park.Hours == nil {
		t.Fatal("Hours = nil, want today's OPERATING entry delivered through fetchPark's real clock")
	}
	if park.Hours.Open != open || park.Hours.Close != closes {
		t.Errorf("Hours = %+v, want Open=%q Close=%q", park.Hours, open, closes)
	}
}

// TestFetchParkAnswersWithNilHoursWhenTheScheduleAnswersButCannotBeShaped is
// fetchPark's own "quieter content" read: distinct from
// TestAParkWithNoOperatingScheduleEntryStillAnswersWithItsRides (the
// schedule call fails outright), this is a schedule call that answers 200
// with a body shapeSchedule cannot read — costing the park only its hours,
// never its availability or its rides.
func TestFetchParkAnswersWithNilHoursWhenTheScheduleAnswersButCannotBeShaped(t *testing.T) {
	live := liveResponseBytes(t)
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/live") {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
		}
		// The schedule call itself succeeds; its body is what cannot be shaped.
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader([]byte("not json"))), Header: make(http.Header)}, nil
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	ctx := context.Background()
	park, err := fetchPark(ctx, "Magic Kingdom", noExclusion)
	if err != nil {
		t.Fatalf("fetchPark: unexpected error: %v", err)
	}
	if !park.Available {
		t.Fatalf("available = false, want true — an unshapeable schedule body must not cascade to the whole park")
	}
	if park.Hours != nil {
		t.Errorf("Hours = %+v, want nil for a schedule body that answered but could not be shaped", park.Hours)
	}
	if park.Rides == nil || len(*park.Rides) == 0 {
		t.Error("carries no rides despite its own live call serving")
	}
}

// TestPostApiParkWaitTimesAnswersShuttingDownWhenTheCallersContextEnds
// reads the one failure PostApiParkWaitTimes maps itself, rather than
// through a module's own failureMessage: the caller's own context ending —
// this client gone, or the server shutting down — fails the whole read, the
// same 503 outcome router.Route.Serve answers it with.
func TestPostApiParkWaitTimesAnswersShuttingDownWhenTheCallersContextEnds(t *testing.T) {
	// A transport that never answers, so the flight this request joins never
	// completes and the only way this test's call to Fetch can return is the
	// already-cancelled context below. upstream.Proxy.Do runs the fetch
	// against context.Background(), not the caller's ctx (proxy.go), so this
	// flight keeps running in its own goroutine after PostApiParkWaitTimes
	// has already answered — cleanup waits for it to actually finish before
	// handing http.DefaultTransport back, or that goroutine's read of the
	// global races the next test's write to it.
	block := make(chan struct{})
	released := make(chan struct{})
	transport := roundTrip(func(*http.Request) (*http.Response, error) {
		defer close(released)
		<-block
		return nil, errors.New("unreachable: this test never lets the call finish")
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() {
		close(block)
		select {
		case <-released:
		case <-time.After(5 * time.Second):
			t.Error("the flight this test released never returned")
		}
		http.DefaultTransport = held
	})
	freshRoute(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	request := httptest.NewRequest(
		http.MethodPost, "/api/park-wait-times", strings.NewReader(`{"parks":["Magic Kingdom"]}`),
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
	// Checked against the framework's own exported constant, not this package's identically-valued
	// private one.
	if failure.Cause != router.CauseShuttingDown {
		t.Errorf("Cause = %q, want router.CauseShuttingDown (%q)", failure.Cause, router.CauseShuttingDown)
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
			first, firstErr := shapeRides(body, noExclusion)
			second, secondErr := shapeRides(body, noExclusion)
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

// FuzzResolvePark drives resolvePark with a config-named park
// (`check-fuzz`, docs/CI.md § Backend fuzz) — the pretty-name/entity-id/pass-
// through resolution (#309 build spec decisions 3-4) — seeded from the module's
// own known parks (both a pretty name and an entity id) and from values outside
// it.
func FuzzResolvePark(f *testing.F) {
	for _, p := range knownParks {
		f.Add(p.name)
		f.Add(p.id)
	}
	for _, name := range []string{"", "disney-world", "Magic-Kingdom", "magic-kingdom "} {
		f.Add(name)
	}

	f.Fuzz(func(t *testing.T, name string) {
		runWithin(t, fuzzHangBudget, "FuzzResolvePark", func() error {
			_, _, _ = resolvePark(name)
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

// TestFailureMessageNamesTheUpstreamsOwnStatus pins the one outcome
// TestFailureMessageNamesEachOutcomeThePipelineDistinguishes leaves
// unasserted beyond non-empty text: UpstreamStatus's message names the
// specific status the source answered with, not a generic "answered badly".
func TestFailureMessageNamesTheUpstreamsOwnStatus(t *testing.T) {
	message := failureMessage(upstream.Result{Kind: upstream.UpstreamStatus, Status: http.StatusServiceUnavailable})
	if !strings.Contains(message, fmt.Sprintf("%d", http.StatusServiceUnavailable)) {
		t.Errorf("failureMessage = %q, want it to name the upstream's own status %d", message, http.StatusServiceUnavailable)
	}
}

// --- The blacklist exclusion mechanism ---
//
// A central pre-filter removes an excluded entity from a park's live-data
// list before the ATTRACTION filter and the nil-name guard, and coexists
// with errNoPostedWait rather than subsuming it: the module's own prebuilt
// id list (active unless turned off) unioned with the request's own
// blacklist names, matched trim + case-fold + curly-quote fold, then
// whole-name equality.
//
// Every case below drives the module's own HTTP handler (serve) rather
// than shapeRides or fetchPark directly, since useDefaultBlacklist and
// blacklist are read off boundary.ParkWaitTimesRequest.

// rideNames is the set of names a park's own answer carries, letting a
// blacklist case read for a name's absence without caring about its wait or
// position.
func rideNames(park boundary.ParkWaitTimesPark) map[string]bool {
	names := make(map[string]bool)
	if park.Rides == nil {
		return names
	}
	for _, ride := range *park.Rides {
		names[ride.Name] = true
	}
	return names
}

// blacklistFixture copies the captured live response and appends the rows
// given, for cases the real capture cannot exercise on its own (a status the
// pre-filter must still drop under, a name carrying a curly apostrophe).
func blacklistFixture(t *testing.T, extra ...map[string]any) []byte {
	t.Helper()

	var read map[string]any
	if err := json.Unmarshal(liveResponseBytes(t), &read); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	rows := read["liveData"].([]any)
	for _, row := range extra {
		rows = append(rows, row)
	}
	read["liveData"] = rows

	body, err := json.Marshal(read)
	if err != nil {
		t.Fatalf("writing the modified response: %v", err)
	}
	return body
}

// operatingRowWithWait, rowWithStatus and nilNameRow are minimal synthetic
// liveData rows this suite adds beside the captured ones, each carrying
// only what shapeRides and the blacklist filter read.
func operatingRowWithWait(id, name string, minutes int) map[string]any {
	return map[string]any{
		"id": id, "name": name, "entityType": "ATTRACTION", "status": "OPERATING",
		"queue": map[string]any{"STANDBY": map[string]any{"waitTime": minutes}},
	}
}

func rowWithStatus(id, name, status string) map[string]any {
	return map[string]any{"id": id, "name": name, "entityType": "ATTRACTION", "status": status}
}

func nilNameRow(id, status string) map[string]any {
	return map[string]any{"id": id, "name": nil, "entityType": "ATTRACTION", "status": status}
}

// liveTransport answers a park's /live call with body and its /schedule call
// with a failure, which every blacklist case below is indifferent to.
func liveTransport(body []byte) http.RoundTripper {
	return roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/live") {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
	})
}

// TestSupportedParksResolveWellFormedDistinctEntityIDs is
// TestDefaultBlacklistIDsAreCuratedAndWellFormed's counterpart for the
// module's own curated roster: every knownParks entry names a themeparks.wiki
// entity in the shape that source uses, with no id and no pretty name
// repeated.
func TestSupportedParksResolveWellFormedDistinctEntityIDs(t *testing.T) {
	if len(knownParks) == 0 {
		t.Fatal("knownParks is empty, want the module's curated park roster")
	}
	seenIDs := make(map[string]bool, len(knownParks))
	seenNames := make(map[string]bool, len(knownParks))
	for _, p := range knownParks {
		if !uuidShape.MatchString(p.id) {
			t.Errorf("%q: id %q is not shaped like a themeparks.wiki entity id", p.name, p.id)
		}
		if seenIDs[p.id] {
			t.Errorf("%q: id %q appears more than once in knownParks", p.name, p.id)
		}
		seenIDs[p.id] = true
		if seenNames[p.name] {
			t.Errorf("%q appears more than once in knownParks", p.name)
		}
		seenNames[p.name] = true
	}
}

// TestDefaultBlacklistIDsAreCuratedAndWellFormed is
// TestSupportedParksResolveWellFormedDistinctEntityIDs's counterpart for the
// module's own prebuilt exclusion list: an empty list is itself a defect,
// and every entry names a themeparks.wiki entity in the shape that source
// uses, with no id repeated.
func TestDefaultBlacklistIDsAreCuratedAndWellFormed(t *testing.T) {
	if len(defaultBlacklistIDs) == 0 {
		t.Fatal("defaultBlacklistIDs is empty, want the module's curated junk-entity ids")
	}
	seen := make(map[string]bool, len(defaultBlacklistIDs))
	for _, id := range defaultBlacklistIDs {
		if !uuidShape.MatchString(id) {
			t.Errorf("%q is not shaped like a themeparks.wiki entity id", id)
		}
		if seen[id] {
			t.Errorf("%q appears more than once in defaultBlacklistIDs", id)
		}
		seen[id] = true
	}
}

// TestBlacklistPreFilterDropsAPrebuiltIDAcrossEveryStatus reads the central
// pre-filter's own ordering: an entity whose id is on the module's prebuilt
// list is left out of a park's rides regardless of what status it reports —
// DOWN, CLOSED, REFURBISHMENT and an OPERATING row with a posted wait — and
// even where the row carries no name at all, which the nil-name guard would
// otherwise fail the whole park's shaping over. An OPERATING row with no
// posted wait is deliberately not a case here: errNoPostedWait already
// drops that row regardless of the blacklist, so it cannot tell a
// pre-filter's presence from its absence.
func TestBlacklistPreFilterDropsAPrebuiltIDAcrossEveryStatus(t *testing.T) {
	junkID := defaultBlacklistIDs[0]

	cases := []struct {
		name string
		row  map[string]any
	}{
		{"an OPERATING row with a posted wait", operatingRowWithWait(junkID, "Junk (operating)", 15)},
		{"a DOWN row", rowWithStatus(junkID, "Junk (down)", "DOWN")},
		{"a CLOSED row", rowWithStatus(junkID, "Junk (closed)", "CLOSED")},
		{"a REFURBISHMENT row", rowWithStatus(junkID, "Junk (refurb)", "REFURBISHMENT")},
		{"a row carrying no name at all", nilNameRow(junkID, "OPERATING")},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			held := http.DefaultTransport
			http.DefaultTransport = liveTransport(blacklistFixture(t, c.row))
			t.Cleanup(func() { http.DefaultTransport = held })
			freshRoute(t)

			recorder := serve(t, `{"parks":["Magic Kingdom"]}`)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (%s) — a blacklisted entity must not fail the park's shaping", recorder.Code, http.StatusOK, recorder.Body)
			}

			var payload boundary.ParkWaitTimesPayload
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("reading the served payload: %v", err)
			}
			park := payload.Parks[0]
			if !park.Available {
				t.Fatalf("available = false, want true — a blacklisted entity must not cascade the whole park to unavailable")
			}
			if park.Rides == nil {
				t.Fatal("carries no rides")
			}
			for _, ride := range *park.Rides {
				if strings.HasPrefix(ride.Name, "Junk") {
					t.Errorf("rides carries %q, want the blacklisted entity filtered out", ride.Name)
				}
			}
			// Mad Tea Party, Seven Dwarfs Mine Train and The Barnstormer: the
			// capture's own seven attractions, minus the four the prebuilt list
			// already excludes by default (The Hall of Presidents, Casey Jr.
			// Splash 'N' Soak Station, Walt Disney's Carousel of Progress,
			// Cinderella Castle) and the synthetic junk row appended above.
			if len(*park.Rides) != 3 {
				t.Errorf("shaped %d rides, want 3: %+v", len(*park.Rides), *park.Rides)
			}
		})
	}
}

// TestUseDefaultBlacklistFalseIgnoresThePrebuiltList reads the toggle's off
// half: turning it off admits an entity the prebuilt list would otherwise
// drop, while a name on the request's own list is still dropped regardless
// — the toggle governs the prebuilt list only, not the central filter as a
// whole.
func TestUseDefaultBlacklistFalseIgnoresThePrebuiltList(t *testing.T) {
	junkID := defaultBlacklistIDs[0]
	live := blacklistFixture(t,
		operatingRowWithWait(junkID, "Prebuilt Junk Ride", 3),
		operatingRowWithWait("11111111-1111-1111-1111-111111111111", "User Blacklisted Ride", 4),
	)

	held := http.DefaultTransport
	http.DefaultTransport = liveTransport(live)
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom"],"useDefaultBlacklist":false,"blacklist":["User Blacklisted Ride"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}

	names := rideNames(payload.Parks[0])
	if !names["Prebuilt Junk Ride"] {
		t.Error(`rides omits "Prebuilt Junk Ride", want it admitted — useDefaultBlacklist:false must ignore the prebuilt list`)
	}
	if names["User Blacklisted Ride"] {
		t.Error(`rides carries "User Blacklisted Ride", want it dropped — the user list applies regardless of the toggle`)
	}
}

// TestBlacklistIsTheAdditiveUnionOfThePrebuiltAndUserLists reads the
// toggle's default-on half together with the union the two lists form: a
// request naming no blacklist fields at all still runs the prebuilt list, a
// name on the request's own list excludes besides it rather than instead of
// it, and a ride neither list names is left untouched.
func TestBlacklistIsTheAdditiveUnionOfThePrebuiltAndUserLists(t *testing.T) {
	junkID := defaultBlacklistIDs[0]
	live := blacklistFixture(t, operatingRowWithWait(junkID, "Prebuilt Junk Ride", 3))

	held := http.DefaultTransport
	http.DefaultTransport = liveTransport(live)
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	// Names the park's real "Mad Tea Party" on the user list, alongside the
	// prebuilt id above, and asks nothing of the toggle.
	recorder := serve(t, `{"parks":["Magic Kingdom"],"blacklist":["Mad Tea Party"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}

	names := rideNames(payload.Parks[0])
	if names["Prebuilt Junk Ride"] {
		t.Error(`rides carries "Prebuilt Junk Ride", want it dropped — the prebuilt list is active by default`)
	}
	if names["Mad Tea Party"] {
		t.Error(`rides carries "Mad Tea Party", want it dropped — the user list adds to the prebuilt list rather than replacing it`)
	}
	if !names["Seven Dwarfs Mine Train"] {
		t.Error(`rides omits "Seven Dwarfs Mine Train", want a ride neither list names left untouched`)
	}
}

// TestUserBlacklistNameMatchIsNormalizedExact reads the request's own list's
// match rule directly: a name on it matches a ride's name after trimming,
// Unicode case-folding and a fold of the curly quotes/apostrophes stdlib
// case-folding does not itself touch (U+2018/2019/201C/201D to ASCII) — and,
// once folded, the two must match WHOLE, not merely share a substring. No
// fullwidth-form/NFKC case: NFKC needs golang.org/x/text, a runtime
// dependency this backend does not carry (ADR 0008 rev 6).
func TestUserBlacklistNameMatchIsNormalizedExact(t *testing.T) {
	cases := []struct {
		name        string
		blacklist   string
		rideName    string
		wantDropped bool
	}{
		{"an exact match", "Test Blacklist Ride", "Test Blacklist Ride", true},
		{"case differs", "TEST BLACKLIST RIDE", "Test Blacklist Ride", true},
		{"surrounding whitespace on the list entry", "  Test Blacklist Ride  ", "Test Blacklist Ride", true},
		{
			"a curly apostrophe on the ride against a straight one on the list",
			"Peter Pan's Flight", "Peter Pan’s Flight", true,
		},
		{
			"curly double quotes on the ride against straight ones on the list",
			`the "Wishes" fireworks stage`, "the “Wishes” fireworks stage", true,
		},
		{"a substring of the ride's name is not a whole-name match", "Blacklist Ride", "Test Blacklist Ride", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			live := blacklistFixture(t, operatingRowWithWait("22222222-2222-2222-2222-222222222222", c.rideName, 6))

			held := http.DefaultTransport
			http.DefaultTransport = liveTransport(live)
			t.Cleanup(func() { http.DefaultTransport = held })
			freshRoute(t)

			body, err := json.Marshal(map[string]any{
				"parks":     []string{"Magic Kingdom"},
				"blacklist": []string{c.blacklist},
			})
			if err != nil {
				t.Fatalf("writing the request body: %v", err)
			}
			recorder := serve(t, string(body))
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
			}
			var payload boundary.ParkWaitTimesPayload
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("reading the served payload: %v", err)
			}

			dropped := !rideNames(payload.Parks[0])[c.rideName]
			if dropped != c.wantDropped {
				t.Errorf("dropped = %v, want %v (blacklist %q against ride %q)", dropped, c.wantDropped, c.blacklist, c.rideName)
			}
		})
	}
}

// --- The #309 parks-roster removal: pretty-name resolution, pass-through, 404-vs-transient ---
//
// There is no roster gatekeeping: a configured park resolves through knownParks
// — a normalized pretty-name or entity-id hit takes that park's own pretty name
// and entity id; a miss passes the config string through to the upstream as-is
// and takes the source's own name; an upstream 404 is this park's own
// unsupported outcome, distinct from a transient failure. No tier rejects the
// whole request (SRS067<!-- The park-wait-times module confines a failure to
// the part of its own response the failure touches -->). Every case below
// drives the module's own HTTP handler, not resolvePark directly, so it says
// nothing about the resolution's internal shape.
//
// magicKingdomEntityID is Magic Kingdom's entry in knownParks, named here for
// the cases that assert which identifier a resolved park's own upstream call
// carried. Derived through resolvePark rather than restated, so it cannot
// drift from knownParks.
var _, magicKingdomEntityID, _ = resolvePark("Magic Kingdom")

// capturingTransport answers a park's /live call with body and its /schedule
// call with a failure (mirroring liveTransport), while recording every
// request URL it saw — this suite's way of reading which identifier a
// resolved park's own upstream call actually carried.
type capturingTransport struct {
	mu   sync.Mutex
	body []byte
	urls []string
}

func (c *capturingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	c.mu.Lock()
	c.urls = append(c.urls, r.URL.String())
	c.mu.Unlock()
	if strings.HasSuffix(r.URL.Path, "/live") {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(c.body)), Header: make(http.Header)}, nil
	}
	return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
}

func (c *capturingTransport) sawURLContaining(substr string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, u := range c.urls {
		if strings.Contains(u, substr) {
			return true
		}
	}
	return false
}

// TestPrettyNameResolvesToItsUUID reads decisions 3-4 of the #309 build spec:
// a config entry naming a park by its known pretty name resolves to that
// park's upstream entity id, and the upstream call this park's own fetch
// makes carries that id — not the pretty name itself (TST086: fetched at the
// identity recorded). The id itself never crosses the boundary, so this is
// read off the upstream call the transport captured, not a wire field.
func TestPrettyNameResolvesToItsUUID(t *testing.T) {
	transport := &capturingTransport{body: liveResponseBytes(t)}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s) — a pretty name must resolve, not be rejected", recorder.Code, http.StatusOK, recorder.Body)
	}

	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
	}
	park := payload.Parks[0]
	if !park.Available {
		t.Errorf("available = false, want true — the pretty name should have resolved to a fetchable park: %+v", park)
	}
	if !transport.sawURLContaining(magicKingdomEntityID) {
		t.Errorf("no upstream call carried the pretty name's own entity id %q — want its /live and /schedule calls to use the id, not the pretty name", magicKingdomEntityID)
	}
}

// TestPrettyNameMatchIsNormalized reads decision 3's normalization: a pretty
// name given with different case or surrounding whitespace still matches,
// the same convention as the user-blacklist name match (trim + case-fold).
// None of the module's six known pretty names carries an apostrophe, so this
// case cannot exercise the curly-quote fold half of that convention against
// real data; that half is already covered where it is exercisable, against
// ride names (TestUserBlacklistNameMatchIsNormalizedExact above).
func TestPrettyNameMatchIsNormalized(t *testing.T) {
	variants := []string{
		"magic kingdom",
		"MAGIC KINGDOM",
		"  Magic Kingdom  ",
	}
	for _, name := range variants {
		t.Run(fmt.Sprintf("%q", name), func(t *testing.T) {
			transport := &capturingTransport{body: liveResponseBytes(t)}
			held := http.DefaultTransport
			http.DefaultTransport = transport
			t.Cleanup(func() { http.DefaultTransport = held })
			freshRoute(t)

			body, err := json.Marshal(boundary.ParkWaitTimesRequest{Parks: []string{name}})
			if err != nil {
				t.Fatalf("encoding the request: %v", err)
			}
			recorder := serve(t, string(body))
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (%s) — %q should still match the pretty name despite its case/whitespace", recorder.Code, http.StatusOK, recorder.Body, name)
			}
			var payload boundary.ParkWaitTimesPayload
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("reading the served payload: %v", err)
			}
			if len(payload.Parks) != 1 || !payload.Parks[0].Available {
				t.Fatalf("parks = %+v, want one available park", payload.Parks)
			}
			if !transport.sawURLContaining(magicKingdomEntityID) {
				t.Errorf("%q did not resolve to the pretty name's own entity id %q", name, magicKingdomEntityID)
			}
		})
	}
}

// TestUnrecognizedConfigStringPassesThroughAsIs reads decision 4's second
// tier: a config string that matches no pretty name is fetched from the
// upstream as-is, treated as the identifier, rather than being rejected.
func TestUnrecognizedConfigStringPassesThroughAsIs(t *testing.T) {
	const raw = "not-a-known-pretty-name"

	transport := &capturingTransport{body: liveResponseBytes(t)}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["`+raw+`"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s) — an unrecognized park must not fail the request", recorder.Code, http.StatusOK, recorder.Body)
	}
	if !transport.sawURLContaining(raw) {
		t.Errorf("no upstream call carried %q verbatim — want a config string matching no pretty name fetched as the identifier as-is", raw)
	}
}

// TestUpstream404IsUnsupportedDistinctFromATransientFailure reads decisions
// 1-2 of the #309 build spec: a park whose upstream call answers 404 is
// reported available:false with the locked wording "the source has no such
// park" — not the generic per-status text a transient (non-404) failure
// still carries — and neither park's own failure fails the whole request
// (SRS067<!-- The park-wait-times module confines a failure to the part of
// its own response the failure touches -->).
func TestUpstream404IsUnsupportedDistinctFromATransientFailure(t *testing.T) {
	const notFoundBody = `{"success":false,"error":{"message":"entity not found","code":404}}`

	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		switch {
		case strings.Contains(r.URL.String(), "unsupported-park"):
			return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader(notFoundBody)), Header: make(http.Header)}, nil
		case strings.Contains(r.URL.String(), "transient-park"):
			return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
		default:
			t.Fatalf("unexpected upstream call: %s", r.URL)
			return nil, nil
		}
	})
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["unsupported-park","transient-park"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s) — neither park's own failure may fail the whole request", recorder.Code, http.StatusOK, recorder.Body)
	}

	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 2 {
		t.Fatalf("parks = %d, want 2: %+v", len(payload.Parks), payload.Parks)
	}
	unsupported, transientPark := payload.Parks[0], payload.Parks[1]

	if unsupported.Available {
		t.Error("unsupported-park: available = true against a 404, want false")
	}
	if transientPark.Available {
		t.Error("transient-park: available = true against a 503, want false")
	}
	if unsupported.Message == nil || *unsupported.Message == "" {
		t.Fatal("unsupported-park: carries no message")
	}
	if transientPark.Message == nil || *transientPark.Message == "" {
		t.Fatal("transient-park: carries no message")
	}

	// wantUnsupportedMessage is the locked unsupported-park wording (#309
	// build spec decision 1, owner-decided) — deliberately not the generic
	// per-status text every other UpstreamStatus outcome gets, so a GREEN
	// that leaves 404 falling through to the existing status-passthrough
	// cannot pass this by accident.
	const wantUnsupportedMessage = "the source has no such park"
	if *unsupported.Message != wantUnsupportedMessage {
		t.Errorf("unsupported-park's message = %q, want the locked unsupported wording %q", *unsupported.Message, wantUnsupportedMessage)
	}
	// The literal text below is the existing transient wording a viewer already
	// sees for any non-404 upstream status (route.go's failureMessage,
	// UpstreamStatus case) — asserted as the observable message text itself,
	// not through calling that helper, so this stays a behavioral check of
	// what the response says rather than a coupling to how it is produced.
	wantTransientMessage := fmt.Sprintf("the source answered with status %d", http.StatusServiceUnavailable)
	if *transientPark.Message != wantTransientMessage {
		t.Errorf("transient-park's message = %q, want the existing transient wording %q unchanged", *transientPark.Message, wantTransientMessage)
	}
	if *unsupported.Message == *transientPark.Message {
		t.Error("the 404 (unsupported) and the 503 (transient) park share the same message, want them distinct")
	}
}

// TestAKnownParkShowsItsPrettyNameNotTheUpstreams: a recognized park's card
// shows this module's own pretty name, never a name the source carries — the
// reason the offline set holds a name at all. The pretty name must beat both
// places a source name could come from: the live response's own PARK row
// ("Magic Kingdom Park" in the capture) and a succeeding schedule answer whose
// top-level name is a distinct sentinel. Serving a succeeding, differently-named
// schedule is what pins the !known guard — a known park must ignore it.
func TestAKnownParkShowsItsPrettyNameNotTheUpstreams(t *testing.T) {
	live := liveResponseBytes(t)
	var read map[string]any
	if err := json.Unmarshal(live, &read); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	parkRow := read["liveData"].([]any)[0].(map[string]any)
	if parkRow["entityType"] != "PARK" {
		t.Fatalf("fixture's first row is entityType %v, want PARK — this test reads the capture's own upstream park name", parkRow["entityType"])
	}
	upstreamName, ok := parkRow["name"].(string)
	if !ok || upstreamName == "" {
		t.Fatal("the fixture's PARK row carries no upstream name to contrast against")
	}
	const prettyName = "Magic Kingdom"
	const scheduleName = "Schedule Sentinel Name"
	if upstreamName == prettyName {
		t.Fatalf("fixture's upstream name %q equals the pretty name — the test needs them to differ", upstreamName)
	}

	schedule := []byte(`{"name":"` + scheduleName + `","schedule":[]}`)
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
	http.DefaultTransport = &transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Magic Kingdom"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
	}
	if payload.Parks[0].Name != prettyName {
		t.Errorf("Name = %q, want the module's own pretty name %q, not the upstream's %q", payload.Parks[0].Name, prettyName, upstreamName)
	}
}

// TestAKnownParkStaysAvailableWhenTheLiveResponseHasNoParkRow: the Universal
// parks' live response carries no PARK-identity row. A recognized park takes
// its name from the offline set rather than the live response, so a missing
// PARK row costs it nothing — it stays available and reads under its own pretty
// name. The fixture is a real Universal Studios capture; the guard below fails
// if it ever gains a PARK row, since then it would not stand for the case.
func TestAKnownParkStaysAvailableWhenTheLiveResponseHasNoParkRow(t *testing.T) {
	live, err := os.ReadFile(filepath.FromSlash("testdata/us-live.json"))
	if err != nil {
		t.Fatalf("reading the Universal live fixture: %v", err)
	}
	var read struct {
		LiveData []struct {
			EntityType string `json:"entityType"`
		} `json:"liveData"`
	}
	if err := json.Unmarshal(live, &read); err != nil {
		t.Fatalf("reading the fixture: %v", err)
	}
	for _, row := range read.LiveData {
		if row.EntityType == "PARK" {
			t.Fatal("the Universal fixture carries a PARK row — it must not, to stand for the parks whose live response omits one")
		}
	}

	held := http.DefaultTransport
	http.DefaultTransport = liveTransport(live)
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["Universal Studios"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
	}
	park := payload.Parks[0]
	if !park.Available {
		t.Errorf("available = false for a recognized park whose live response has no PARK row, want true (message %v)", park.Message)
	}
	if park.Name != "Universal Studios" {
		t.Errorf("Name = %q, want the pretty name %q", park.Name, "Universal Studios")
	}
	if park.Rides == nil || len(*park.Rides) == 0 {
		t.Error("rides empty, want the fixture's attractions carried")
	}
}

// TestAPassThroughParkRecognizedByItsEntityIDShowsThePrettyName covers the
// second row of the resolution table: a configured string that is a known
// park's entity id — not its pretty name — still resolves to that park's own
// pretty name, not the fuller name the source carries, and is fetched at that
// same id (TST086: fetched at the identity recorded — the id itself never
// crosses the boundary). Configuring by the id is the case FuzzResolvePark
// only line-covers; here it is asserted end to end.
func TestAPassThroughParkRecognizedByItsEntityIDShowsThePrettyName(t *testing.T) {
	transport := &capturingTransport{body: liveResponseBytes(t)}
	held := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	// Magic Kingdom named by its raw entity id, the value an operator lifting a
	// UUID out of the source would configure.
	recorder := serve(t, `{"parks":["`+magicKingdomEntityID+`"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
	}
	park := payload.Parks[0]
	if park.Name != "Magic Kingdom" {
		t.Errorf("Name = %q, want the pretty name %q for a park configured by its own entity id", park.Name, "Magic Kingdom")
	}
	if !transport.sawURLContaining(magicKingdomEntityID) {
		t.Errorf("no upstream call carried the entity id %q the park was configured by", magicKingdomEntityID)
	}
}

// TestAPassThroughParkIsNamedFromTheSchedule reads the pass-through half of the
// resolution: a park this module does not recognize takes its shown name from
// the source's own schedule answer — the one name every park carries, the live
// park-identity row being absent for some. The live fixture is a real Universal
// capture with no PARK row at all, so the name can only come from the schedule;
// the schedule's top-level name is a sentinel present in no live row, so a
// name drawn from the live response instead could not produce it.
func TestAPassThroughParkIsNamedFromTheSchedule(t *testing.T) {
	const configured = "some-unknown-entity-id"
	const scheduleName = "Sentinel Park Name"
	live, err := os.ReadFile(filepath.FromSlash("testdata/us-live.json"))
	if err != nil {
		t.Fatalf("reading the Universal live fixture: %v", err)
	}
	schedule := []byte(`{"name":"` + scheduleName + `","schedule":[]}`)
	if bytes.Contains(live, []byte(scheduleName)) {
		t.Fatalf("the sentinel schedule name %q appears in the live fixture — it must not, or the test could not tell the schedule from the live response", scheduleName)
	}

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
	http.DefaultTransport = &transport
	t.Cleanup(func() { http.DefaultTransport = held })
	freshRoute(t)

	recorder := serve(t, `{"parks":["`+configured+`"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("reading the served payload: %v", err)
	}
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
	}
	if payload.Parks[0].Name != scheduleName {
		t.Errorf("Name = %q, want the source's own schedule name %q for a pass-through park", payload.Parks[0].Name, scheduleName)
	}
	// Fetched through as configured (TST086), not carried as a wire field.
	transport.mu.Lock()
	_, sawConfigured := transport.calls[liveURL(configured)]
	transport.mu.Unlock()
	if !sawConfigured {
		t.Errorf("no /live call carried the configured string %q fetched through unchanged", configured)
	}
}

// TestAPassThroughParkFallsBackToTheConfiguredNameWhenTheSourceSuppliesNone is
// the last row's fallback: a pass-through park whose schedule answer gives no
// name is shown under the configured string itself, rather than left nameless.
// Both ways the source can withhold a name are covered — the schedule call
// failing, and answering with no top-level name.
func TestAPassThroughParkFallsBackToTheConfiguredNameWhenTheSourceSuppliesNone(t *testing.T) {
	const configured = "another-unknown-entity-id"
	live, err := os.ReadFile(filepath.FromSlash("testdata/us-live.json"))
	if err != nil {
		t.Fatalf("reading the Universal live fixture: %v", err)
	}
	cases := map[string]http.RoundTripper{
		"the schedule call fails": roundTrip(func(r *http.Request) (*http.Response, error) {
			if strings.HasSuffix(r.URL.Path, "/live") {
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(live)), Header: make(http.Header)}, nil
			}
			return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
		}),
		"the schedule carries no name": roundTrip(func(r *http.Request) (*http.Response, error) {
			body := live
			if strings.HasSuffix(r.URL.Path, "/schedule") {
				body = []byte(`{"schedule":[]}`)
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header)}, nil
		}),
		"the schedule answers with nothing readable": roundTrip(func(r *http.Request) (*http.Response, error) {
			body := live
			if strings.HasSuffix(r.URL.Path, "/schedule") {
				body = []byte("not json")
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header)}, nil
		}),
	}
	for name, transport := range cases {
		t.Run(name, func(t *testing.T) {
			held := http.DefaultTransport
			http.DefaultTransport = transport
			t.Cleanup(func() { http.DefaultTransport = held })
			freshRoute(t)

			recorder := serve(t, `{"parks":["`+configured+`"]}`)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
			}
			var payload boundary.ParkWaitTimesPayload
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("reading the served payload: %v", err)
			}
			if len(payload.Parks) != 1 {
				t.Fatalf("parks = %d, want 1: %+v", len(payload.Parks), payload.Parks)
			}
			if payload.Parks[0].Name != configured {
				t.Errorf("Name = %q, want the configured string %q when the source supplies no name", payload.Parks[0].Name, configured)
			}
		})
	}
}
