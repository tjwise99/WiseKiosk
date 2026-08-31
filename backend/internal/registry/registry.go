// Package registry holds the route registration list, and the boundary
// schema's module data routes that reach it (ADR 0021 rev 2, ADR 0008 rev 4).
package registry

import (
	"net/http"

	"github.com/tjwise99/WiseKiosk/backend/internal/modules/weather"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
)

// Entries is the static route registration list: one entry per upstream-backed
// module, declared here and nowhere else. A module is added by adding one
// element to this literal.
//
// Every policy an entry carries is the module's own, assembled from its shaping
// library rather than restated here, so the figures a requirement settled have
// one home and a test reads the same ones the route runs.
var Entries = []router.Entry{
	{
		Config:   weather.Config(),
		Source:   weather.Source,
		Validate: weather.Validate,
		BuildURL: weather.BuildURL,
		// The module shapes into the generated payload type, which the framework
		// takes as the JSON-encodable value any module may return.
		Shape: func(body []byte) (any, error) { return weather.Shape(body) },
		// Open-Meteo is keyless, so there is nothing to name and nothing to place.
	},
}

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

// GetApiWeather serves the weather module's route. It takes no parameters
// because the generated wrapper binds none: this side of the schema is read
// without them (ADR 0008 rev 4), so what judges the request is the entry's own
// validator (SRS043) reading the query the response cache is keyed on.
func (r Routes) GetApiWeather(w http.ResponseWriter, req *http.Request) {
	r.api.ServeHTTP(w, req)
}
