package registry

import (
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
	boundary.HandlerFromMux(schemaRoutes{Routes: NewRoutes(seam)}, mux)
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

// TestEverySchemaModuleRouteIsOneTheRegistrationListServes compares the two
// spellings of a module's route that no compiler compares: the path the boundary
// schema declares, and the source the entry beside it names. The generated
// interface forces a method per schema route, but what that method delegates to
// is a handler built from Source, so the two can disagree and the route answer
// 404. A request the entry's own validator refuses tells a registered source
// from an unregistered one, with no outbound call either way.
//
// Building the router is also the construction check: an entry the framework
// cannot serve panics here rather than at the first request it would fail.
func TestEverySchemaModuleRouteIsOneTheRegistrationListServes(t *testing.T) {
	handler := registered(router.NewRouter(Entries))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/weather?lat=999&lon=999", nil))

	if recorder.Code == http.StatusNotFound {
		t.Fatalf("GET /api/weather is a path the schema declares and no entry serves (%s)", recorder.Body)
	}
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want the entry's own rejection %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
	}
}
