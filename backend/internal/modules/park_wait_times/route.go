package park_wait_times

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// causeShuttingDown is the one Cause this route answers with; router.go's
// private constant of the same name, named here since it is unexported
// there.
const causeShuttingDown = "shutting-down"

// entry is the module's route registration (module contract part 5).
// Shape shapes one park's live-data response; Serve is never reached, but
// the field is required (router.Entry).
func entry() router.Entry {
	return router.Entry{
		Config: Config(),
		Source: Source,
		Shape:  func(body []byte) (any, error) { return shapeRides(body) },
		// themeparks.wiki is keyless.
	}
}

// served is the framework route this module's fetches run through, one per
// process. An entry the framework cannot serve panics here, before the
// process serves.
var served = router.NewRoute(entry())

// ParkWaitTimesRoute is this module's whole footprint in the shared tree:
// the registry embeds it; usable at its zero value, so registration needs
// no call.
type ParkWaitTimesRoute struct{}

// PostApiParkWaitTimes serves the schema's POST /api/park-wait-times. A
// request may name several parks
// (SRS054<!-- The park-wait-times module reports on the parks its
// configuration names -->), each fetched concurrently through its own pair
// of Route.Fetch calls rather than Route.Serve
// (SRS067<!-- The park-wait-times module confines a failure to the part of
// its own response the failure touches -->).
func (ParkWaitTimesRoute) PostApiParkWaitTimes(w http.ResponseWriter, r *http.Request) {
	router.BoundBody(w, r)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		router.Reject(w, router.InvalidParameters, errRequestNotDecodable.Error())
		return
	}
	request, err := decodeRequest(body)
	if err != nil {
		router.Reject(w, router.InvalidParameters, err.Error())
		return
	}
	named, err := validateParks(request.Parks)
	if err != nil {
		router.Reject(w, router.InvalidParameters, err.Error())
		return
	}

	excluded := newExclusion(blacklistToggle(request), blacklistNames(request))
	fetched := fetchParksConcurrently(r.Context(), request.Parks, named, excluded)

	payload := boundary.ParkWaitTimesPayload{Parks: make([]boundary.ParkWaitTimesPark, 0, len(fetched))}
	for _, result := range fetched {
		if result.err != nil {
			// Errors only where this caller's context ended → 503, same
			// outcome Route.Serve gives (ADR 0026 rev 2).
			writeJSON(w, http.StatusServiceUnavailable, boundary.UpstreamFailure{
				Module:  Source,
				Cause:   causeShuttingDown,
				Message: "this backend stopped serving before this source could answer",
			})
			return
		}
		payload.Parks = append(payload.Parks, result.park)
	}

	writeJSON(w, http.StatusOK, payload)
}

// fetchedPark is one park's fetchPark outcome, carried in request order.
type fetchedPark struct {
	park boundary.ParkWaitTimesPark
	err  error
}

// fetchParksConcurrently runs fetchPark per park concurrently, returns
// outcomes in request order; each goroutine writes its own pre-sized slice
// index (race-free, no mutex).
func fetchParksConcurrently(ctx context.Context, slugs []string, named map[string]supportedPark, excluded exclusion) []fetchedPark {
	results := make([]fetchedPark, len(slugs))
	var wg sync.WaitGroup
	for i, slug := range slugs {
		wg.Add(1)
		go func(i int, slug string) {
			defer wg.Done()
			park, err := fetchParkExcluding(ctx, slug, named[slug], excluded)
			results[i] = fetchedPark{park: park, err: err}
		}(i, slug)
	}
	wg.Wait()
	return results
}

// fetchPark reads rides (live endpoint) and hours (schedule endpoint),
// cached under distinct keys. See
// SRS067<!-- The park-wait-times module confines a failure to the part of
// its own response the failure touches --> for why hours failing costs
// this park only its hours, not its rides.
func fetchPark(ctx context.Context, slug string, info supportedPark) (boundary.ParkWaitTimesPark, error) {
	return fetchParkExcluding(ctx, slug, info, noExclusion)
}

// fetchParkExcluding is fetchPark with a caller-supplied exclusion.
func fetchParkExcluding(ctx context.Context, slug string, info supportedPark, excluded exclusion) (boundary.ParkWaitTimesPark, error) {
	liveResult, err := served.Fetch(ctx, slug+":live", liveURL(info.entityID))
	if err != nil {
		return boundary.ParkWaitTimesPark{}, err
	}
	if liveResult.Kind != upstream.Success {
		return unavailable(slug, info.name, failureMessage(liveResult)), nil
	}
	rides, err := shapeRidesExcluding(liveResult.Body, excluded)
	if err != nil {
		return unavailable(slug, info.name, errMalformedPayload.Error()), nil
	}

	var hours *boundary.ParkWaitTimesHours
	scheduleResult, err := served.Fetch(ctx, slug+":schedule", scheduleURL(info.entityID))
	if err != nil {
		return boundary.ParkWaitTimesPark{}, err
	}
	if scheduleResult.Kind == upstream.Success {
		if shaped, err := shapeHours(scheduleResult.Body, time.Now()); err == nil {
			hours = shaped
		}
	}

	return boundary.ParkWaitTimesPark{
		Id:        slug,
		Name:      info.name,
		Available: true,
		Hours:     hours,
		Rides:     &rides,
	}, nil
}

// unavailable is a park's payload entry where its own upstream calls could
// not be read.
func unavailable(slug, name, message string) boundary.ParkWaitTimesPark {
	return boundary.ParkWaitTimesPark{Id: slug, Name: name, Available: false, Message: &message}
}

// errMalformedPayload is what a readable-but-unshapeable response renders
// as.
var errMalformedPayload = errors.New("the source's response could not be read as this module's payload")

// failureMessage is the plain-language reason per pipeline outcome. Status
// mapping: router.go.
func failureMessage(result upstream.Result) string {
	switch result.Kind {
	case upstream.Unreachable:
		return "the source could not be reached"
	case upstream.Timeout:
		return "the source did not answer in time"
	case upstream.UpstreamStatus:
		return fmt.Sprintf("the source answered with status %d", result.Status)
	case upstream.Oversize:
		return "the source's response was larger than this route accepts"
	case upstream.RateLimited:
		return "this source is being asked for more often than its limit allows"
	default:
		return "this park's wait times could not be read"
	}
}

// errRequestNotDecodable and errRequestNamesNoPark are decodeRequest's two
// sentinel failures, carrying the two 400 message texts the handler rejects
// with.
var (
	errRequestNotDecodable = errors.New("the request body could not be read as this source's parameters")
	errRequestNamesNoPark  = errors.New("the request must name at least one park")
)

// decodeRequest reads the parks a request names. It is pure — bytes in, the
// request or a sentinel error out.
func decodeRequest(body []byte) (boundary.ParkWaitTimesRequest, error) {
	var request boundary.ParkWaitTimesRequest
	decoder := json.NewDecoder(bytes.NewReader(body))
	// A body carrying anything beyond the one field the schema names is
	// refused rather than read past
	// (SRS012<!-- Request parameters validated against known-good per-source
	// constraints -->).
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return boundary.ParkWaitTimesRequest{}, errRequestNotDecodable
	}
	if len(request.Parks) == 0 {
		return boundary.ParkWaitTimesRequest{}, errRequestNamesNoPark
	}
	return request, nil
}

// blacklistToggle reads useDefaultBlacklist, default on.
func blacklistToggle(request boundary.ParkWaitTimesRequest) bool {
	return request.UseDefaultBlacklist == nil || *request.UseDefaultBlacklist
}

// blacklistNames reads a request's own blacklist, defaulting to none where
// the request omits it.
func blacklistNames(request boundary.ParkWaitTimesRequest) []string {
	if request.Blacklist == nil {
		return nil
	}
	return *request.Blacklist
}

// validateParks judges every park a request names against the constraint
// this module declares (SRS055<!-- The park-wait-times module declares the
// known-good constraint the park it is asked about must satisfy -->),
// admitted or refused as a whole: a request naming one park outside the
// supported set is rejected in full, nothing sent upstream for any of the
// parks it named.
func validateParks(slugs []string) (map[string]supportedPark, error) {
	named := make(map[string]supportedPark, len(slugs))
	for _, slug := range slugs {
		park, err := validate(slug)
		if err != nil {
			return nil, err
		}
		named[slug] = park
	}
	return named, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(encoded)
}
