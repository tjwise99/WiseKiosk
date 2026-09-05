package headers

import (
	_ "embed"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/health"
	"github.com/tjwise99/WiseKiosk/backend/internal/registry"
	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

// wantCSP and wantPermissionsPolicy are read independently of headers.go's own
// embed, so a served value that drifted from the tracked file — rather than
// from this test's expectation of it — is what fails.
//
//go:embed csp.txt
var wantCSPFile string

//go:embed permissions-policy.txt
var wantPermissionsPolicyFile string

// schemaRoutes assembles the same schema surface backend/cmd wires into
// newServer, so this package's own test exercises the routes Wrap actually
// serves in the running process rather than a smaller stand-in.
type schemaRoutes struct {
	health.Route
	registry.Modules
}

var _ boundary.ServerInterface = schemaRoutes{}

// assembled serves a temporary tree holding an index and a configuration,
// wrapped the way newServer wraps it.
func assembled(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html><div id=\"app\"></div>"), 0o644); err != nil {
		t.Fatalf("writing the index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatalf("writing config.json: %v", err)
	}

	mux := http.NewServeMux()
	boundary.HandlerFromMux(schemaRoutes{}, mux)
	mux.Handle("/", staticserve.New(http.Dir(dir)))
	return Wrap(mux)
}

// rejectedWeatherBody names a point outside the module's declared constraint,
// which the module refuses before any upstream call — this test's route
// coverage is about the headers a served response carries, not a forecast.
const rejectedWeatherBody = `{"lat":999,"lon":0}`

func TestServesTheHeaderSetOnEveryRoute(t *testing.T) {
	wantCSP := strings.TrimSpace(wantCSPFile)
	wantPermissionsPolicy := strings.TrimSpace(wantPermissionsPolicyFile)
	handler := assembled(t)

	cases := []struct {
		name        string
		method      string
		target      string
		body        string
		contentType string
	}{
		{name: "the served tree", method: http.MethodGet, target: "/", contentType: "text/html; charset=utf-8"},
		{name: "the configuration", method: http.MethodGet, target: "/config.json", contentType: "application/json"},
		{name: "liveness", method: http.MethodGet, target: "/healthz", contentType: "text/plain; charset=utf-8"},
		{
			name:        "a rejected weather request",
			method:      http.MethodPost,
			target:      "/api/weather",
			body:        rejectedWeatherBody,
			contentType: "application/json",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var body io.Reader
			if c.body != "" {
				body = strings.NewReader(c.body)
			}
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(c.method, c.target, body))

			if got := recorder.Header().Get("Content-Security-Policy"); got != wantCSP {
				t.Errorf("Content-Security-Policy = %q, want %q", got, wantCSP)
			}
			if strings.Contains(recorder.Header().Get("Content-Security-Policy"), "\n") {
				t.Errorf("Content-Security-Policy carries a newline")
			}
			if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
			}
			if got := recorder.Header().Get("Permissions-Policy"); got != wantPermissionsPolicy {
				t.Errorf("Permissions-Policy = %q, want %q", got, wantPermissionsPolicy)
			}
			if got := recorder.Header().Get("Content-Type"); got != c.contentType {
				t.Errorf("Content-Type = %q, want %q", got, c.contentType)
			}
		})
	}
}

func TestPermissionsPolicyFileMatchesTheGeneration(t *testing.T) {
	generated := generatePermissionsPolicy(universe, allowlist)
	want := strings.TrimSpace(wantPermissionsPolicyFile)
	if generated != want {
		t.Errorf("permissions-policy.txt has drifted from the universe/allowlist generation:\ngenerated: %s\ntracked:   %s", generated, want)
	}
}
