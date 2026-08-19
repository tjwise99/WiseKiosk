package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/secret"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// fakeClock is the clock the routes read, advanced by a test rather than waited
// on: no test here sleeps for a TTL.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// upstreamFake is the source the test entries point at. It counts the calls
// that reached it, which is how a test tells an answer that went upstream from
// one that did not, and keeps the last request's headers.
type upstreamFake struct {
	server *httptest.Server

	mu      sync.Mutex
	calls   int
	headers http.Header
	status  int
	body    string
}

func newUpstreamFake(t *testing.T) *upstreamFake {
	t.Helper()

	fake := &upstreamFake{status: http.StatusOK, body: `{"reading":42}`}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fake.mu.Lock()
		fake.calls++
		fake.headers = r.Header.Clone()
		status, body := fake.status, fake.body
		fake.mu.Unlock()

		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(fake.server.Close)
	return fake
}

func (u *upstreamFake) count() int {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.calls
}

func (u *upstreamFake) header(name string) string {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.headers.Get(name)
}

func (u *upstreamFake) answers(status int, body string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.status, u.body = status, body
}

// testConfig is the policy the test entries run under. Every value is set, as
// an entry's must be.
func testConfig() upstream.Config {
	return upstream.Config{
		SuccessTTL:        10 * time.Minute,
		NegativeTTL:       time.Minute,
		RequestsPerMinute: 60,
		Burst:             10,
		Timeout:           5 * time.Second,
		MaxBytes:          1 << 16,
	}
}

// testEntry is a fake module's registration: a request is valid when it names a
// station, the URL is the fake upstream's, and the payload is the upstream body
// read as an object.
func testEntry(fake *upstreamFake, source string) Entry {
	return Entry{
		Config: testConfig(),
		Source: source,
		Validate: func(params url.Values) error {
			if params.Get("station") == "" {
				return errors.New("a station is required")
			}
			return nil
		},
		BuildURL: func(params url.Values) (string, error) {
			return fake.server.URL + "/?station=" + url.QueryEscape(params.Get("station")), nil
		},
		Shape: func(body []byte) (any, error) {
			var payload map[string]any
			if err := json.Unmarshal(body, &payload); err != nil {
				return nil, err
			}
			return payload, nil
		},
	}
}

// ask runs one request against a handler.
func ask(handler http.Handler, method, target string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
	return recorder
}

// body reads a response as a JSON object, so a test asserts on the fields that
// are there rather than on the type it expected.
func body(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	if got := recorder.Header().Get("Content-Type"); got != contentTypeJSON {
		t.Errorf("Content-Type = %q, want %q", got, contentTypeJSON)
	}

	var decoded map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("reading the body %q: %v", recorder.Body.String(), err)
	}
	return decoded
}

// wantRejection asserts a client-rejection body: the cause, and the absence of
// the module field that would make it an upstream failure instead.
func wantRejection(t *testing.T, recorder *httptest.ResponseRecorder, status int, cause string) {
	t.Helper()

	if recorder.Code != status {
		t.Errorf("status = %d, want %d", recorder.Code, status)
	}

	decoded := body(t, recorder)
	if decoded["cause"] != cause {
		t.Errorf("cause = %v, want %q", decoded["cause"], cause)
	}
	if message, _ := decoded["message"].(string); message == "" {
		t.Error("the rejection carries no message to render")
	}
	if _, carried := decoded["module"]; carried {
		t.Errorf("the rejection carries a module field: %v", decoded)
	}
}

// wantFailure asserts an upstream-failure body: the module it is contained to,
// and the cause.
func wantFailure(t *testing.T, recorder *httptest.ResponseRecorder, status int, module, cause string) map[string]any {
	t.Helper()

	if recorder.Code != status {
		t.Errorf("status = %d, want %d", recorder.Code, status)
	}

	decoded := body(t, recorder)
	if decoded["module"] != module {
		t.Errorf("module = %v, want %q", decoded["module"], module)
	}
	if decoded["cause"] != cause {
		t.Errorf("cause = %v, want %q", decoded["cause"], cause)
	}
	if message, _ := decoded["message"].(string); message == "" {
		t.Error("the failure carries no message to render")
	}
	return decoded
}

func TestAnIdenticalRequestIsServedFromCacheUntilTheTTLExpires(t *testing.T) {
	clock := newFakeClock()
	fake := newUpstreamFake(t)
	entry := testEntry(fake, "readings")
	handler := newRouter([]Entry{entry}, clock.now)

	first := ask(handler, http.MethodGet, "/api/readings?station=one")
	if first.Code != http.StatusOK {
		t.Fatalf("first request: status = %d, want %d (%s)", first.Code, http.StatusOK, first.Body)
	}

	second := ask(handler, http.MethodGet, "/api/readings?station=one")
	if second.Body.String() != first.Body.String() {
		t.Errorf("second body = %q, want the first's %q", second.Body, first.Body)
	}
	if calls := fake.count(); calls != 1 {
		t.Errorf("upstream calls within the TTL = %d, want 1", calls)
	}

	clock.advance(entry.SuccessTTL)
	third := ask(handler, http.MethodGet, "/api/readings?station=one")
	if third.Code != http.StatusOK {
		t.Errorf("after the TTL: status = %d, want %d", third.Code, http.StatusOK)
	}
	if calls := fake.count(); calls != 2 {
		t.Errorf("upstream calls after the TTL = %d, want 2", calls)
	}
}

func TestNonConformingParametersAreRejectedWithNoUpstreamCall(t *testing.T) {
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{testEntry(fake, "readings")}, newFakeClock().now)

	recorder := ask(handler, http.MethodGet, "/api/readings")

	wantRejection(t, recorder, http.StatusBadRequest, causeInvalidParameters)
	if calls := fake.count(); calls != 0 {
		t.Errorf("upstream calls = %d, want none", calls)
	}
}

const (
	// secretName is the logical name the keyed test entry declares.
	secretName = "WISEKIOSK_TEST_SOURCE_KEY"
	// secretHeader is where the keyed test entry places the value.
	secretHeader = "X-Test-Source-Key"
	// canary is the value planted through the delivery path and swept for.
	canary = "canary-3f8a-not-in-any-output"
)

// keyedEntry is a test entry needing secretName, placed as a header.
func keyedEntry(fake *upstreamFake, source string) Entry {
	entry := testEntry(fake, source)
	entry.Secret = secretName
	entry.InjectSecret = func(request *http.Request, secretValue string) {
		request.Header.Set(secretHeader, secretValue)
	}
	return entry
}

func TestAnUnresolvableSecretFailsOnlyItsOwnSource(t *testing.T) {
	cases := map[string]string{
		// Empty rather than absent: the variable is then unset for Resolve
		// however the ambient environment is set, and restored when the test
		// ends.
		"the path is unset":   "",
		"the file is missing": filepath.Join(t.TempDir(), "no-such-secret"),
	}

	for name, path := range cases {
		t.Run(name, func(t *testing.T) {
			t.Setenv(secretName+"_FILE", path)

			fake := newUpstreamFake(t)
			handler := newRouter([]Entry{keyedEntry(fake, "keyed"), testEntry(fake, "open")}, newFakeClock().now)

			failed := ask(handler, http.MethodGet, "/api/keyed?station=one")
			decoded := wantFailure(t, failed, http.StatusBadGateway, "keyed", causeSecretUnresolvable)
			if message, _ := decoded["message"].(string); !strings.Contains(message, secretName) {
				t.Errorf("message = %q, want the secret named", message)
			}
			if path != "" && strings.Contains(failed.Body.String(), path) {
				t.Errorf("the failure carries the path the secret was looked for at: %q", failed.Body)
			}
			if calls := fake.count(); calls != 0 {
				t.Errorf("upstream calls for the keyed source = %d, want none", calls)
			}

			served := ask(handler, http.MethodGet, "/api/open?station=one")
			if served.Code != http.StatusOK {
				t.Errorf("the source needing no secret: status = %d, want %d (%s)", served.Code, http.StatusOK, served.Body)
			}
			if reading := body(t, served)["reading"]; reading != float64(42) {
				t.Errorf("the source needing no secret: reading = %v, want the upstream's", reading)
			}
		})
	}
}

func TestAResolvedSecretReachesUpstreamAndNoResponse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source-key")
	if err := os.WriteFile(path, []byte(canary+"\n"), 0o600); err != nil {
		t.Fatalf("planting the secret: %v", err)
	}
	t.Setenv(secretName+"_FILE", path)

	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{keyedEntry(fake, "keyed")}, newFakeClock().now)

	recorder := ask(handler, http.MethodGet, "/api/keyed?station=one")
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", recorder.Code, http.StatusOK, recorder.Body)
	}

	// Without this the sweep below passes on a backend that never placed the
	// secret at all.
	if placed := fake.header(secretHeader); placed != canary {
		t.Errorf("upstream saw %s = %q, want the planted value", secretHeader, placed)
	}

	if strings.Contains(recorder.Body.String(), canary) {
		t.Errorf("the response body carries the secret value: %q", recorder.Body)
	}
	for name, values := range recorder.Header() {
		for _, value := range values {
			if strings.Contains(value, canary) {
				t.Errorf("response header %s carries the secret value: %q", name, value)
			}
		}
	}
}

func TestASecretDoesNotFollowARedirect(t *testing.T) {
	path := filepath.Join(t.TempDir(), "source-key")
	if err := os.WriteFile(path, []byte(canary+"\n"), 0o600); err != nil {
		t.Fatalf("planting the secret: %v", err)
	}
	t.Setenv(secretName+"_FILE", path)

	elsewhere := newUpstreamFake(t)
	redirecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.server.URL, http.StatusFound)
	}))
	t.Cleanup(redirecting.Close)

	entry := keyedEntry(elsewhere, "keyed")
	entry.BuildURL = func(url.Values) (string, error) { return redirecting.URL, nil }
	handler := newRouter([]Entry{entry}, newFakeClock().now)

	wantFailure(t, ask(handler, http.MethodGet, "/api/keyed?station=one"),
		http.StatusBadGateway, "keyed", causeUpstreamStatus)

	if calls := elsewhere.count(); calls != 0 {
		t.Errorf("the redirect target was called %d times, want none", calls)
	}
	if placed := elsewhere.header(secretHeader); placed != "" {
		t.Errorf("the redirect target saw %s = %q, want the secret to have stayed behind", secretHeader, placed)
	}
}

func TestARouteAnswersGetOnly(t *testing.T) {
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{testEntry(fake, "readings")}, newFakeClock().now)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		recorder := ask(handler, method, "/api/readings?station=one")

		wantRejection(t, recorder, http.StatusMethodNotAllowed, causeMethodNotAllowed)
		if allow := recorder.Header().Get("Allow"); allow != allowedMethods {
			t.Errorf("%s: Allow = %q, want %q", method, allow, allowedMethods)
		}
	}

	if calls := fake.count(); calls != 0 {
		t.Errorf("upstream calls = %d, want none", calls)
	}
}

func TestAPathNoEntryRegisteredIsUnknown(t *testing.T) {
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{testEntry(fake, "readings")}, newFakeClock().now)

	for _, target := range []string{"/api/unknown", "/api/", "/api/readings/extra"} {
		wantRejection(t, ask(handler, http.MethodGet, target), http.StatusNotFound, causeUnknownSource)
	}

	if calls := fake.count(); calls != 0 {
		t.Errorf("upstream calls = %d, want none", calls)
	}
}

func TestAnEmptyRegistrationListServesNoSource(t *testing.T) {
	handler := newRouter(nil, newFakeClock().now)

	wantRejection(t, ask(handler, http.MethodGet, "/api/readings"), http.StatusNotFound, causeUnknownSource)
}

func TestARequestOverTheRateLimitIsRejected(t *testing.T) {
	fake := newUpstreamFake(t)
	entry := testEntry(fake, "readings")
	entry.RequestsPerMinute, entry.Burst = 1, 1
	handler := newRouter([]Entry{entry}, newFakeClock().now)

	if served := ask(handler, http.MethodGet, "/api/readings?station=one"); served.Code != http.StatusOK {
		t.Fatalf("the first request: status = %d, want %d (%s)", served.Code, http.StatusOK, served.Body)
	}

	// A second station, so the answer is decided by the bucket rather than by
	// the cache.
	refused := ask(handler, http.MethodGet, "/api/readings?station=two")

	wantRejection(t, refused, http.StatusTooManyRequests, causeRateLimited)
	if calls := fake.count(); calls != 1 {
		t.Errorf("upstream calls = %d, want the one the bucket had a token for", calls)
	}
}

func TestAFailedExchangeIsThisModulesFailure(t *testing.T) {
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{testEntry(fake, "readings")}, newFakeClock().now)

	fake.answers(http.StatusServiceUnavailable, "upstream is down")
	decoded := wantFailure(t, ask(handler, http.MethodGet, "/api/readings?station=one"),
		http.StatusBadGateway, "readings", causeUpstreamStatus)
	if message, _ := decoded["message"].(string); !strings.Contains(message, "503") {
		t.Errorf("message = %q, want the upstream status named", message)
	}

	fake.answers(http.StatusOK, "this is not JSON")
	wantFailure(t, ask(handler, http.MethodGet, "/api/readings?station=two"),
		http.StatusBadGateway, "readings", causeMalformedPayload)
}

func TestASourceThatCannotBeReachedIsThisModulesFailure(t *testing.T) {
	fake := newUpstreamFake(t)
	handler := newRouter([]Entry{testEntry(fake, "readings")}, newFakeClock().now)
	fake.server.Close()

	wantFailure(t, ask(handler, http.MethodGet, "/api/readings?station=one"),
		http.StatusBadGateway, "readings", causeUnreachable)
}

func TestEveryOutcomeCarriesItsOwnStatusAndCause(t *testing.T) {
	// The path the secret was looked for at, which the wire message must not
	// carry.
	const lookedFor = "/run/secrets/source-key"

	rt := &route{entry: keyedEntry(newUpstreamFake(t), "keyed")}
	cases := []struct {
		name   string
		result upstream.Result
		status int
		cause  string
	}{
		{"unreachable", upstream.Result{Kind: upstream.Unreachable, Err: errors.New("dial: connection refused")},
			http.StatusBadGateway, causeUnreachable},
		{"timeout", upstream.Result{Kind: upstream.Timeout, Err: context.DeadlineExceeded},
			http.StatusGatewayTimeout, causeTimeout},
		{"upstream status", upstream.Result{Kind: upstream.UpstreamStatus, Status: http.StatusServiceUnavailable},
			http.StatusBadGateway, causeUpstreamStatus},
		{"oversize", upstream.Result{Kind: upstream.Oversize, Err: errors.New("over the size bound")},
			http.StatusBadGateway, causeOversize},
		{"unresolvable secret", upstream.Result{Kind: upstream.Unreachable, Err: &secret.UnresolvableError{
			Name: secretName, Path: lookedFor, Cause: secret.ErrFileMissing}},
			http.StatusBadGateway, causeSecretUnresolvable},
	}

	seen := make(map[string]string, len(cases))
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, cause, message := rt.failure(c.result)

			if status != c.status {
				t.Errorf("status = %d, want %d", status, c.status)
			}
			if cause != c.cause {
				t.Errorf("cause = %q, want %q", cause, c.cause)
			}
			if message == "" {
				t.Error("the failure carries no message to render")
			}
			if strings.Contains(message, lookedFor) {
				t.Errorf("message = %q, want no path in it", message)
			}
			if c.cause == causeSecretUnresolvable && !strings.Contains(message, secretName) {
				t.Errorf("message = %q, want the secret named", message)
			}
			if first, taken := seen[cause]; taken {
				t.Errorf("cause %q is already %s's, so the two are not told apart", cause, first)
			}
			seen[cause] = c.name
		})
	}
}

func TestAnOutcomeNoCaseNamesIsStillRenderable(t *testing.T) {
	var logged bytes.Buffer
	log.SetOutput(&logged)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })

	rt := &route{entry: testEntry(newUpstreamFake(t), "readings")}

	// Beyond the pipeline's own set, which is where a kind added to it later
	// arrives here.
	status, cause, message := rt.failure(upstream.Result{Kind: upstream.Kind(99)})

	if status != http.StatusBadGateway {
		t.Errorf("status = %d, want %d", status, http.StatusBadGateway)
	}
	if cause != causeUpstreamFailure {
		t.Errorf("cause = %q, want %q", cause, causeUpstreamFailure)
	}
	if message == "" {
		t.Error("the failure carries no message to render")
	}
	if !strings.Contains(logged.String(), "readings") {
		t.Errorf("logged %q, want the source named", logged.String())
	}
}

func TestAnEntryTheFrameworkCannotServePanicsAtConstruction(t *testing.T) {
	fake := newUpstreamFake(t)

	cases := map[string]func(Entry) Entry{
		"no validator": func(entry Entry) Entry { entry.Validate = nil; return entry },
		"no URL builder": func(entry Entry) Entry {
			entry.BuildURL = nil
			return entry
		},
		"a secret it does not place": func(entry Entry) Entry { entry.Secret = secretName; return entry },
		"a placement for a secret it does not name": func(entry Entry) Entry {
			entry.InjectSecret = func(*http.Request, string) {}
			return entry
		},
	}

	for name, break_ := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recovered := recover(); recovered == nil {
					t.Error("construction returned, want a panic")
				}
			}()
			newRouter([]Entry{break_(testEntry(fake, "readings"))}, newFakeClock().now)
		})
	}
}

func TestTwoEntriesCannotRegisterOneSource(t *testing.T) {
	fake := newUpstreamFake(t)

	defer func() {
		if recovered := recover(); recovered == nil {
			t.Error("construction returned, want a panic")
		}
	}()
	newRouter([]Entry{testEntry(fake, "readings"), testEntry(fake, "readings")}, newFakeClock().now)
}
