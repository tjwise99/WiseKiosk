// Package registry holds the route registration list, and the boundary
// schema's module data routes that reach it (ADR 0021 rev 2, ADR 0008 rev 4).
package registry

import (
	"net/http"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
)

// Entries is the static route registration list: one entry per upstream-backed
// module, declared here and nowhere else. A module is added by adding one
// element to this literal.
var Entries = []router.Entry{}

// Routes implements the boundary schema's module data routes. The schema is
// what registers each of them, so a path that moves or an operation that
// arrives is a compile error here rather than a route quietly answered from
// somewhere else; every method hands the request straight to the registered
// route for its source, so a module's path is the schema's and its behaviour is
// the framework's, with nothing decided twice between them.
//
// This is the other half of what a module costs the shared tree, beside its one
// element of Entries above — both in this file, which is the one place the
// module contract admits framework code naming a module.
type Routes struct {
	// api is the handler built over Entries.
	api http.Handler
}

// NewRoutes returns the schema's module data routes, delegating into api.
func NewRoutes(api http.Handler) Routes {
	return Routes{api: api}
}

// GetApiWeather serves the weather module's route. The parameters the generated
// wrapper read are not consulted: the entry's own validator is what judges them
// (SRS043<!-- The weather module declares the known-good pattern its location parameter must match -->),
// and the response cache is keyed on the whole query string rather than on the
// values the schema happens to name.
func (r Routes) GetApiWeather(w http.ResponseWriter, req *http.Request, _ boundary.GetApiWeatherParams) {
	r.api.ServeHTTP(w, req)
}
