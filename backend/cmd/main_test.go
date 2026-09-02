package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

const indexBody = "<!doctype html><div id=\"app\"></div>"

// assembled returns a server over a temporary tree holding an index, with api
// at the /api/ seam.
func assembled(t *testing.T, api http.Handler) http.Handler {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexBody), 0o644); err != nil {
		t.Fatalf("writing the index: %v", err)
	}
	return newServer(staticserve.New(http.Dir(dir)), api)
}

// send runs one request against a handler.
func send(handler http.Handler, method, target string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
	return recorder
}

// get runs one GET against a handler, which is every served surface but a
// module data route.
func get(handler http.Handler, target string) *httptest.ResponseRecorder {
	return send(handler, http.MethodGet, target)
}

// healthPath is the path the boundary schema declares for liveness. It is
// asserted here rather than defined: newServer registers what the generated
// router registers, so a schema that moved the route fails this test.
const healthPath = "/healthz"

func TestRoutesHealth(t *testing.T) {
	recorder := get(assembled(t, nil), healthPath)

	if recorder.Code != http.StatusOK {
		t.Errorf("GET %s: status = %d, want %d", healthPath, recorder.Code, http.StatusOK)
	}
}

func TestRoutesTheServedTree(t *testing.T) {
	handler := assembled(t, nil)

	recorder := get(handler, "/")
	if recorder.Code != http.StatusOK || recorder.Body.String() != indexBody {
		t.Errorf("GET /: status = %d body = %q, want %d and the index", recorder.Code, recorder.Body.String(), http.StatusOK)
	}
	if recorder := get(handler, "/no-such-asset.js"); recorder.Code != http.StatusNotFound {
		t.Errorf("GET /no-such-asset.js: status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestApiIsNotFoundUntilARouterIsSupplied(t *testing.T) {
	handler := assembled(t, nil)

	for _, target := range []string{"/api/", "/api/anything", "/api/a/b/c"} {
		recorder := get(handler, target)
		if recorder.Code != http.StatusNotFound {
			t.Errorf("GET %s: status = %d, want %d", target, recorder.Code, http.StatusNotFound)
		}
		if strings.Contains(recorder.Body.String(), indexBody) {
			t.Errorf("GET %s: body = %q, want no fallback to the index", target, recorder.Body.String())
		}
	}
}

func TestApiSeamReceivesEveryApiPath(t *testing.T) {
	var reached string
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = r.URL.Path
		w.WriteHeader(http.StatusTeapot)
	})

	recorder := get(assembled(t, api), "/api/source")
	if recorder.Code != http.StatusTeapot {
		t.Errorf("status = %d, want the supplied handler's %d", recorder.Code, http.StatusTeapot)
	}
	if reached != "/api/source" {
		t.Errorf("the seam saw %q, want %q", reached, "/api/source")
	}
}
