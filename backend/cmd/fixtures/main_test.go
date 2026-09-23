package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

const indexBody = "<!doctype html><div id=\"app\"></div>"

// parkWaitTimesPath is the path the boundary schema declares for the module
// route. It is asserted here rather than defined: newServer registers what the
// generated router registers, so a schema that moved the route fails this test.
const parkWaitTimesPath = "/api/park-wait-times"

// assembled returns the diagnostic's server over a temporary tree holding an
// index.
func assembled(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexBody), 0o644); err != nil {
		t.Fatalf("writing the index: %v", err)
	}
	return newServer(staticserve.New(http.Dir(dir)), nil)
}

// post runs one park-wait-times request against a handler.
func post(handler http.Handler, body string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, parkWaitTimesPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(recorder, request)
	return recorder
}

// decoded reads a park-wait-times payload out of a recorder.
func decoded(t *testing.T, recorder *httptest.ResponseRecorder) boundary.ParkWaitTimesPayload {
	t.Helper()
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decoding the payload: %v (body %s)", err, recorder.Body)
	}
	return payload
}

// TestServesTheFixtureRatherThanReachingAnUpstream is the diagnostic's whole
// point: the route answers with the embedded roster, and it does so without a
// transport, so a run on the board draws the same payload every time. The
// default transport is left in place deliberately — a fixture answer that
// reached out would fail the host lookup rather than pass quietly.
func TestServesTheFixtureRatherThanReachingAnUpstream(t *testing.T) {
	recorder := post(assembled(t), `{"parks":["Magic Kingdom"]}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}
	payload := decoded(t, recorder)
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1", len(payload.Parks))
	}
	park := payload.Parks[0]
	if park.Name != "Magic Kingdom" {
		t.Errorf("name = %q, want %q", park.Name, "Magic Kingdom")
	}
	if !park.Available {
		t.Error("available = false, want true — the fixture reads open")
	}
	if park.Rides == nil || len(*park.Rides) == 0 {
		t.Fatal("the served park carries no rides")
	}
	// The roster is the embedded one, not something assembled per request.
	if (*park.Rides)[0].Name != (*fixtureParks[0].Rides)[0].Name {
		t.Errorf("first ride = %q, want the fixture's %q", (*park.Rides)[0].Name, (*fixtureParks[0].Rides)[0].Name)
	}
}

// TestEveryRequestDrawsTheSameRoster pins the property a profiling run rests
// on: two identical requests answer identically.
func TestEveryRequestDrawsTheSameRoster(t *testing.T) {
	handler := assembled(t)
	const body = `{"parks":["Epcot","Magic Kingdom"]}`

	first := post(handler, body)
	second := post(handler, body)

	if first.Body.String() != second.Body.String() {
		t.Errorf("two identical requests answered differently:\n%s\n%s", first.Body, second.Body)
	}
}

func TestAnswersEveryParkNamedInTheOrderNamed(t *testing.T) {
	recorder := post(assembled(t), `{"parks":["Epcot","Magic Kingdom"]}`)

	payload := decoded(t, recorder)
	if len(payload.Parks) != 2 {
		t.Fatalf("parks = %d, want 2", len(payload.Parks))
	}
	if payload.Parks[0].Name != "Epcot" || payload.Parks[1].Name != "Magic Kingdom" {
		t.Errorf("names = %q, %q, want Epcot then Magic Kingdom", payload.Parks[0].Name, payload.Parks[1].Name)
	}
}

// TestAParkTheFixtureDoesNotCarryStillReadsOpen covers the substitution branch:
// nothing a request names reads closed, which is what makes the diagnostic
// usable against any configured roster.
func TestAParkTheFixtureDoesNotCarryStillReadsOpen(t *testing.T) {
	recorder := post(assembled(t), `{"parks":["  A Park No Fixture Carries  "]}`)

	payload := decoded(t, recorder)
	if len(payload.Parks) != 1 {
		t.Fatalf("parks = %d, want 1", len(payload.Parks))
	}
	park := payload.Parks[0]
	if park.Name != "A Park No Fixture Carries" {
		t.Errorf("name = %q, want the requested name trimmed", park.Name)
	}
	if !park.Available {
		t.Error("available = false, want true")
	}
	if park.Rides == nil || len(*park.Rides) == 0 {
		t.Error("an unknown park carries no rides, want the first entry's roster")
	}
}

func TestRejectsABodyThatIsNotAParkWaitTimesRequest(t *testing.T) {
	recorder := post(assembled(t), `not json`)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
	}
}

// TestRejectsABodyThatCannotBeRead covers the read failure apart from the
// decode failure: a connection that dies mid-body is rejected rather than
// answered with a fixture over a body nobody received.
func TestRejectsABodyThatCannotBeRead(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, parkWaitTimesPath, iotest.ErrReader(errors.New("connection lost")))
	request.Header.Set("Content-Type", "application/json")
	assembled(t).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
	}
}

// TestRoutesHealth reads that the embedded fields carry the schema's other
// routes unchanged — only the park-wait-times method is this package's own.
func TestRoutesHealth(t *testing.T) {
	recorder := httptest.NewRecorder()
	assembled(t).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if recorder.Code != http.StatusOK {
		t.Errorf("GET /healthz: status = %d, want %d", recorder.Code, http.StatusOK)
	}
}

func TestRoutesTheServedTree(t *testing.T) {
	recorder := httptest.NewRecorder()
	assembled(t).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	if recorder.Code != http.StatusOK || recorder.Body.String() != indexBody {
		t.Errorf("GET /: status = %d body = %q, want %d and the index", recorder.Code, recorder.Body.String(), http.StatusOK)
	}
}

// TestRunReportsAServeFailure drives run through the serve seam rather than
// binding a port.
func TestRunReportsAServeFailure(t *testing.T) {
	held := serve
	t.Cleanup(func() { serve = held })
	var gotAddr string
	serve = func(addr string, _ http.Handler) error {
		gotAddr = addr
		return errors.New("serve stopped")
	}

	var stderr bytes.Buffer
	if code := run([]string{"-static-root", t.TempDir()}, &stderr); code != 1 {
		t.Errorf("exit code = %d, want 1", code)
	}
	if gotAddr != defaultAddr {
		t.Errorf("addr = %q, want the product's own %q", gotAddr, defaultAddr)
	}
	if !strings.Contains(stderr.String(), "serve stopped") {
		t.Errorf("stderr = %q, want the serve error reported", stderr.String())
	}
}

func TestRunHonoursTheAddrFlag(t *testing.T) {
	held := serve
	t.Cleanup(func() { serve = held })
	var gotAddr string
	serve = func(addr string, _ http.Handler) error {
		gotAddr = addr
		return errors.New("serve stopped")
	}

	var stderr bytes.Buffer
	run([]string{"-addr", ":9099", "-static-root", t.TempDir()}, &stderr)

	if gotAddr != ":9099" {
		t.Errorf("addr = %q, want :9099", gotAddr)
	}
}

func TestRunRejectsAnUnknownFlag(t *testing.T) {
	var stderr bytes.Buffer
	if code := run([]string{"-nonesuch"}, &stderr); code != 2 {
		t.Errorf("exit code = %d, want 2", code)
	}
}
