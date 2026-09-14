package park_wait_times

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// entry is this module's route registration: the module contract's part 5,
// assembled from the shaping library beside it rather than restated
// anywhere shared, so the figures a requirement settled have one home.
//
// Shape here shapes one park's live-data response into its ride list — the
// same function PostApiParkWaitTimes calls directly below, since this
// module answers a request naming several parks with several fetches
// rather than the one-target-per-request shape Route.Serve assumes (the
// owner's ruling on the multi-park fan-out). Serve is never reached for
// this route; the field is required of every entry regardless
// (router.Entry).
func entry() router.Entry {
	return router.Entry{
		Config: Config(),
		Source: Source,
		Shape:  func(body []byte) (any, error) { return shapeRides(body) },
		// themeparks.wiki is keyless, so there is nothing to name and nothing to place.
	}
}

// served is the framework route this module's fetches run through, one per
// process. An entry the framework cannot serve panics here, before the
// process serves.
var served = router.NewRoute(entry())

// ParkWaitTimesRoute is this module's whole footprint in the shared tree:
// the registry embeds it, and the generated server interface is what
// obliges the method below to exist. It is usable at its zero value, so
// registering the module needs no call and names it once.
type ParkWaitTimesRoute struct{}

// PostApiParkWaitTimes serves the schema's POST /api/park-wait-times. A
// request may name several parks (SRS054<!-- The park-wait-times module
// reports on the parks its configuration names -->), and each is read
// through its own pair of fetches — no single upstream exchange answers a
// request naming more than one park, so this module runs the framework's
// cache/rate-limit/timeout pipeline once per park per endpoint via
// Route.Fetch rather than once per request via Route.Serve.
//
// A park whose own fetches fail carries `available: false` and a
// plain-language reason rather than failing the whole read — the parks a
// request named that did answer are unaffected (the owner's ruling on
// graceful degradation). Only the request's own context ending — this
// caller gone, or the server shutting down — fails the whole read, the same
// outcome Route.Serve answers it with.
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

	payload := boundary.ParkWaitTimesPayload{Parks: make([]boundary.ParkWaitTimesPark, 0, len(request.Parks))}
	for _, slug := range request.Parks {
		park, err := fetchPark(r.Context(), slug, named[slug])
		if err != nil {
			// The pipeline errors only where this caller's context ended: a
			// client that has gone, or a server shutting down under one still
			// connected. Written the same 503 outcome Route.Serve answers it
			// with (ADR 0026 rev 2), for the whole request rather than one
			// park: a read that cannot finish is not a reading of the parks
			// it reached so far.
			writeJSON(w, http.StatusServiceUnavailable, boundary.UpstreamFailure{
				Module:  Source,
				Cause:   "shutting-down",
				Message: "this backend stopped serving before this source could answer",
			})
			return
		}
		payload.Parks = append(payload.Parks, park)
	}

	writeJSON(w, http.StatusOK, payload)
}

// fetchPark answers one park: its rides, read from the source's live-data
// endpoint, and its hours, read from its schedule endpoint. The two are
// fetched and cached under distinct keys, so a park with hot rides and a
// quiet schedule does not hold one back from the other's cache interval.
//
// The rides fetch is this park's whole reading: it is what SRS057–SRS061
// draw, so a park whose rides could not be read carries nothing to draw and
// is marked unavailable. The hours fetch is quieter content
// (the park-wait-times UI design spec, "the header sits above... its quiet
// peer"), so a schedule that could not be read or shaped costs this park
// its hours rather than its whole reading — the rides still answer.
func fetchPark(ctx context.Context, slug string, info supportedPark) (boundary.ParkWaitTimesPark, error) {
	liveResult, err := served.Fetch(ctx, slug+":live", liveURL(info.entityID))
	if err != nil {
		return boundary.ParkWaitTimesPark{}, err
	}
	if liveResult.Kind != upstream.Success {
		return unavailable(slug, info.name, failureMessage(liveResult)), nil
	}
	rides, err := shapeRides(liveResult.Body)
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

// errMalformedPayload is what a source's readable but unshapeable response
// renders as, this module's own words rather than the upstream one this
// module could not read.
var errMalformedPayload = errors.New("the source's response could not be read as this module's payload")

// failureMessage is the plain-language reason a park's own upstream call
// failed, one per outcome the framework's pipeline distinguishes. This is
// not the route's HTTP-status mapping (router.go's own, unduplicated here):
// nothing here answers with a status, since a failed park is carried inside
// a still-successful response rather than failing it.
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

// writeJSON writes value as the response body under status. This module
// answers a 200 payload assembled across several upstream calls, so it
// cannot use router.Route.Serve's own response writing (built for exactly
// one), and writes its generated types directly instead.
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
