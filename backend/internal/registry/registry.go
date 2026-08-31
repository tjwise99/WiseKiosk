// Package registry holds the route registration list (ADR 0021 rev 2).
package registry

import (
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
//
// Each entry's Source is the last segment of the path the boundary schema
// declares for that module. Nothing compiles the two together — a module data
// route is excluded from the Go generation (ADR 0008 rev 4) — so the test beside
// this file reads the schema and compares them.
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
