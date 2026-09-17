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
	excluded := newExclusion(blacklistToggle(request), blacklistNames(request))
	fetched := fetchParksConcurrently(r.Context(), request.Parks, excluded)

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
func fetchParksConcurrently(ctx context.Context, slugs []string, excluded exclusion) []fetchedPark {
	results := make([]fetchedPark, len(slugs))
	var wg sync.WaitGroup
	for i, slug := range slugs {
		wg.Add(1)
		go func(i int, slug string) {
			defer wg.Done()
			park, err := fetchParkExcluding(ctx, slug, excluded)
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
func fetchPark(ctx context.Context, configured string) (boundary.ParkWaitTimesPark, error) {
	return fetchParkExcluding(ctx, configured, noExclusion)
}

// fetchParkExcluding is fetchPark with a caller-supplied exclusion. It resolves
// the configured park to what its card shows and what its requests fetch
// (resolvePark): a recognized park keeps its pretty name throughout; an
// unrecognized one is fetched as configured and named from the schedule
// answer's own park name, falling back to the configured string until that
// answer arrives. A 404 against the fetched identifier is this park's own
// unsupported outcome — permanent, distinct from every other failure, which
// stays transient/retryable (#309 build spec decisions 1-2).
func fetchParkExcluding(ctx context.Context, configured string, excluded exclusion) (boundary.ParkWaitTimesPark, error) {
	name, entityID, known := resolvePark(configured)
	// label is the name shown until the schedule answer can better it: a known
	// park's pretty name, or the configured string for a pass-through park.
	label := name
	if label == "" {
		label = configured
	}

	liveResult, err := served.Fetch(ctx, entityID+":live", liveURL(entityID))
	if err != nil {
		return boundary.ParkWaitTimesPark{}, err
	}
	if liveResult.Kind == upstream.UpstreamStatus && liveResult.Status == http.StatusNotFound {
		return unavailable(entityID, label, errUnsupportedPark.Error()), nil
	}
	if liveResult.Kind != upstream.Success {
		return unavailable(entityID, label, failureMessage(liveResult)), nil
	}
	rides, err := shapeRidesExcluding(liveResult.Body, excluded)
	if err != nil {
		return unavailable(entityID, label, errMalformedPayload.Error()), nil
	}

	var hours *boundary.ParkWaitTimesHours
	scheduleResult, err := served.Fetch(ctx, entityID+":schedule", scheduleURL(entityID))
	if err != nil {
		return boundary.ParkWaitTimesPark{}, err
	}
	if scheduleResult.Kind == upstream.Success {
		if shaped, err := shapeHours(scheduleResult.Body, time.Now()); err == nil {
			hours = shaped
		}
		// A pass-through park draws its name from the source's own; a
		// recognized one keeps the pretty name resolvePark gave it.
		if !known {
			if upstreamName := shapeScheduleName(scheduleResult.Body); upstreamName != "" {
				label = upstreamName
			}
		}
	}

	return boundary.ParkWaitTimesPark{
		Id:        entityID,
		Name:      label,
		Available: true,
		Hours:     hours,
		Rides:     &rides,
	}, nil
}

// unavailable is a park's payload entry where its own upstream calls could
// not be read. Id carries the resolved fetch identifier (resolvePark's output —
// a known park's entity id, or a passed-through string), the same as an
// available park, so the frontend keys its icon on it uniformly. name is the
// best identity in hand: a known park's pretty name, or the configured string
// for a park whose own name the source never got to supply.
func unavailable(entityID, name, message string) boundary.ParkWaitTimesPark {
	return boundary.ParkWaitTimesPark{Id: entityID, Name: name, Available: false, Message: &message}
}

// errMalformedPayload is what a readable-but-unshapeable response renders
// as.
var errMalformedPayload = errors.New("the source's response could not be read as this module's payload")

// errUnsupportedPark is a resolved-or-passed-through identifier the source
// itself does not recognise (a 404) — this park's own permanent failure,
// distinct from a transient one (#309 build spec decisions 1-2).
var errUnsupportedPark = errors.New("the source has no such park")

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
