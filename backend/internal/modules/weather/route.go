package weather

import (
	"encoding/json"
	"net/http"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
)

// entry is this module's route registration: the module contract's part 5,
// assembled from the shaping library beside it rather than restated anywhere
// shared, so the figures a requirement settled have one home.
func entry() router.Entry {
	return router.Entry{
		Config: Config(),
		Source: Source,
		// The module shapes into the generated payload type, which the framework
		// takes as the JSON-encodable value any module may return.
		Shape: func(body []byte) (any, error) { return Shape(body) },
		// Open-Meteo is keyless, so there is nothing to name and nothing to place.
	}
}

// served is the framework route built from that entry, one per process. An entry
// the framework cannot serve panics here, before the process serves.
var served = router.NewRoute(entry())

// WeatherRoute is this module's whole footprint in the shared tree: the registry
// embeds it, and the generated server interface is what obliges the method below
// to exist. It is usable at its zero value, so registering the module needs no
// call and names it once.
type WeatherRoute struct{}

// PostApiWeather serves the schema's POST /api/weather. What a request carries
// is the generated request body, so the two names in it are the schema's and are
// spelled nowhere in this package; what this module judges is the point they
// stand for
// (SRS043<!-- The weather module declares the known-good constraint the location it is asked about must satisfy -->).
func (WeatherRoute) PostApiWeather(w http.ResponseWriter, r *http.Request) {
	router.BoundBody(w, r)

	var request boundary.WeatherRequest
	decoder := json.NewDecoder(r.Body)
	// A body carrying anything beyond the two the schema names is refused rather
	// than read past: the answer is held under the point alone, so a request
	// carrying more would buy a second rate budget for the same place
	// (SRS012<!-- Request parameters validated against known-good per-source constraints -->).
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		router.Reject(w, router.InvalidParameters, "the request body could not be read as this source's parameters")
		return
	}
	if err := validate(request); err != nil {
		router.Reject(w, router.InvalidParameters, err.Error())
		return
	}
	served.Serve(w, r, key(request), buildURL(request))
}

// key names what an answer is about. It is the decoded point written this
// module's one way, so two spellings of one place are one cache entry and one
// rate budget rather than two
// (SRS047<!-- The weather module asks an answering source at most four times an hour for a location -->).
func key(request boundary.WeatherRequest) string {
	return degrees(request.Lat) + "," + degrees(request.Lon)
}
