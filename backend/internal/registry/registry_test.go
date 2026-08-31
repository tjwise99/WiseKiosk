package registry

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
)

// schemaRoutes carries this package's module data routes into the generated
// router, which registers the schema's whole set at once. GetHealthz stands in
// for the schema's infrastructure routes, which are another package's and are
// asked for by nothing here.
type schemaRoutes struct {
	Routes
}

func (schemaRoutes) GetHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// registered returns the generated router over routes delegating into seam,
// assembled the way the process assembles it.
func registered(seam http.Handler) http.Handler {
	mux := http.NewServeMux()
	boundary.HandlerWithOptions(schemaRoutes{Routes: NewRoutes(seam)}, boundary.StdHTTPServerOptions{
		BaseRouter:       mux,
		ErrorHandlerFunc: router.RejectParameters,
	})
	return mux
}

// TestAModuleDataRouteReachesTheRegisteredRouteUntouched reads the seam
// ADR 0008 rev 4 decides: the schema registers the path and hands the request
// on, so what the registered route receives is the request that arrived rather
// than one the generated wrapper rewrote. The query string matters in full —
// the response cache is keyed on it — so it is asserted whole.
func TestAModuleDataRouteReachesTheRegisteredRouteUntouched(t *testing.T) {
	var reached string
	seam := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = r.URL.RequestURI()
		w.WriteHeader(http.StatusTeapot)
	})

	const target = "/api/weather?lat=51.5&lon=-0.12"
	recorder := httptest.NewRecorder()
	registered(seam).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))

	if recorder.Code != http.StatusTeapot {
		t.Errorf("status = %d, want the registered route's %d", recorder.Code, http.StatusTeapot)
	}
	if reached != target {
		t.Errorf("the registered route saw %q, want %q", reached, target)
	}
}

// TestParametersTheSchemaCannotReadAreRejectedInTheBoundarysOwnBody covers what
// the generated wrapper answers before any route is reached. Left to its own
// default it writes net/http's plain text, which would put a body outside the
// schema on a path the schema declares.
func TestParametersTheSchemaCannotReadAreRejectedInTheBoundarysOwnBody(t *testing.T) {
	reached := 0
	seam := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached++ })
	handler := registered(seam)

	for _, target := range []string{
		"/api/weather",
		"/api/weather?lat=51.5",
		"/api/weather?lon=-0.12",
		"/api/weather?lat=here&lon=there",
	} {
		t.Run(target, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))

			if recorder.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}

			var rejection boundary.ClientRejection
			if err := json.Unmarshal(recorder.Body.Bytes(), &rejection); err != nil {
				t.Fatalf("reading the body %q as the schema's rejection: %v", recorder.Body, err)
			}
			if rejection.Cause == "" {
				t.Error("the rejection names no cause")
			}
			if rejection.Message == "" {
				t.Error("the rejection carries no message to render")
			}

			// An upstream failure carries one and a rejection does not, so this is
			// what tells the two bodies apart on the wire (ADR 0026 rev 2).
			var carried map[string]any
			if err := json.Unmarshal(recorder.Body.Bytes(), &carried); err != nil {
				t.Fatalf("reading the body %q: %v", recorder.Body, err)
			}
			if _, module := carried["module"]; module {
				t.Errorf("the rejection carries a module field: %v", carried)
			}
		})
	}

	if reached != 0 {
		t.Errorf("the registered route was reached %d times, want none", reached)
	}
}
