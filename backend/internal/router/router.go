// Package router serves the API from the route registration list: one route per
// entry, and the request flow from parameter validation, through the upstream
// pipeline, to the boundary body it answers with (ADR 0026 rev 2).
package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/secret"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// Entry is one upstream-backed module's route registration: the module's own
// functions, the secret it needs, and every policy governing its route. It is
// the seam between the framework here and a module's shaping library.
type Entry struct {
	// Config is the six policies this route runs under, all required.
	upstream.Config

	// Source names the route GET /api/<Source>, the cache namespace and the
	// rate bucket.
	Source string
	// Validate judges a request's parameters against the pattern this source
	// declares, returning an error naming the rejection. The error's text is
	// what the rejection renders. Required.
	Validate func(url.Values) error
	// Secret is the logical name of the secret this source needs, empty where
	// it needs none.
	Secret string
	// BuildURL builds the upstream URL from the request's parameters, without
	// the secret and without I/O. Required.
	BuildURL func(url.Values) (string, error)
	// InjectSecret places the resolved secret value in the outbound request.
	// Set exactly where Secret is, and reached only then.
	InjectSecret func(req *http.Request, secretValue string)
	// Shape turns the upstream body into the JSON-encodable frontend payload,
	// without I/O. The body is the cached response, held by every caller that
	// response is served to, so Shape modifies neither it nor anything else
	// two concurrent calls share. Required.
	Shape func(body []byte) (any, error)
}

const (
	// apiPrefix is the path space every route sits in.
	apiPrefix = "/api/"
	// allowedMethods is the 405 response's Allow header. A GET pattern serves
	// HEAD as well.
	allowedMethods = "GET, HEAD"
	// contentTypeJSON is the type every body here is written as.
	contentTypeJSON = "application/json"
)

// The causes a rejected request carries, distinguishing what the framework
// refused before any upstream call.
const (
	causeInvalidParameters = "invalid-parameters"
	causeUnknownSource     = "unknown-source"
	causeMethodNotAllowed  = "method-not-allowed"
	causeRateLimited       = "rate-limited"
)

// The causes a failed data request carries, one per outcome the pipeline
// distinguishes plus the three the framework classifies itself.
const (
	causeUnreachable        = "unreachable"
	causeTimeout            = "timeout"
	causeUpstreamStatus     = "upstream-status"
	causeOversize           = "oversize"
	causeSecretUnresolvable = "secret-unresolvable"
	causeMalformedPayload   = "malformed-payload"
	// causeUpstreamFailure is what an outcome carrying no cause of its own is
	// rendered as.
	causeUpstreamFailure = "upstream-failure"
	// causeShuttingDown is the one failure no upstream call produced: this
	// backend stopped serving before the answer was ready (ADR 0026 rev 2).
	causeShuttingDown = "shutting-down"
)

// malformedMessage is what a module's own reshaping failure renders as.
const malformedMessage = "the source's response could not be read as this module's payload"

// outbound is the client every route's fetch makes its call with. It follows no
// redirect, returning the 3xx as the response, and sets no timeout of its own:
// the deadline is the one the pipeline puts on the call's context.
var outbound = &http.Client{
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// NewRouter returns the handler serving one route per entry, against the wall
// clock.
func NewRouter(entries []Entry) http.Handler {
	return newRouter(entries, time.Now)
}

// newRouter builds the handler against the clock now, which each route's cache
// TTLs and rate limit are measured on. It registers GET /api/<Source> once per
// entry, and one fallback over the rest of the API path space. An entry the
// framework cannot serve panics here rather than at the request it would fail.
func newRouter(entries []Entry, now func() time.Time) http.Handler {
	mux := http.NewServeMux()
	sources := make(map[string]struct{}, len(entries))

	for _, entry := range entries {
		entry.check()
		if _, duplicate := sources[entry.Source]; duplicate {
			panic("router: two entries register source " + entry.Source)
		}
		sources[entry.Source] = struct{}{}

		route := &route{entry: entry, proxy: upstream.New(entry.Config, now)}
		mux.Handle(http.MethodGet+" "+apiPrefix+entry.Source, route)
	}

	mux.Handle(apiPrefix, &fallback{sources: sources})
	return mux
}

// check panics on an entry missing a part the request flow calls.
func (e Entry) check() {
	switch {
	case e.Source == "":
		panic("router: an entry names no source")
	case e.Validate == nil:
		panic("router: entry " + e.Source + " carries no validator")
	case e.BuildURL == nil:
		panic("router: entry " + e.Source + " carries no URL builder")
	case e.Shape == nil:
		panic("router: entry " + e.Source + " carries no shaping function")
	case e.Secret != "" && e.InjectSecret == nil:
		panic("router: entry " + e.Source + " names secret " + e.Secret + " and does not place it")
	case e.Secret == "" && e.InjectSecret != nil:
		panic("router: entry " + e.Source + " places a secret and names none")
	}
}

// route serves one entry's requests.
type route struct {
	entry Entry
	proxy *upstream.Proxy
}

// ServeHTTP validates the request's parameters, then asks the pipeline for the
// answer under the canonicalised query string. A rejection is answered before
// any upstream call; the pipeline's error means this caller's context ended,
// and is answered as this module's failure.
func (rt *route) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	params, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		reject(w, http.StatusBadRequest, causeInvalidParameters, "the request parameters could not be read")
		return
	}
	if err := rt.entry.Validate(params); err != nil {
		reject(w, http.StatusBadRequest, causeInvalidParameters, err.Error())
		return
	}

	result, err := rt.proxy.Do(r.Context(), rt.entry.Source, params.Encode(), rt.fetch(params))
	if err != nil {
		// The pipeline errors only where this caller's context ended: a client
		// that has gone, which is what ends one here, or a server shutting down
		// under one still connected, once a shutdown call exists to do it. Both
		// are written the 503 outcome (ADR 0026 rev 2), where returning
		// unwritten emits an empty 200. Only the second reads it.
		rt.fail(w, http.StatusServiceUnavailable, causeShuttingDown, "this backend stopped serving before this source could answer")
		return
	}
	rt.respond(w, result)
}

// fetch returns the call the pipeline makes on a cache miss: the module builds
// the URL, the entry places its secret, and the shared client makes the call.
func (rt *route) fetch(params url.Values) upstream.Fetcher {
	return func(ctx context.Context) (*upstream.Response, error) {
		target, err := rt.entry.BuildURL(params)
		if err != nil {
			return nil, err
		}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			return nil, err
		}

		if rt.entry.Secret != "" {
			resolved, err := secret.Resolve(rt.entry.Secret)
			if err != nil {
				return nil, err
			}
			// Unwrapped here and handed straight to the entry's injector
			// (ADR 0023 rev 2).
			rt.entry.InjectSecret(request, resolved.Reveal())
		}

		response, err := outbound.Do(request)
		if err != nil {
			return nil, rt.outboundFailed(err)
		}
		return &upstream.Response{Status: response.StatusCode, Body: response.Body}, nil
	}
}

// outboundError is a failed outbound call, naming the source and carrying the
// cause beneath it.
type outboundError struct {
	source string
	cause  error
}

func (e *outboundError) Error() string {
	return "source " + e.source + ": outbound call failed: " + e.cause.Error()
}

// Unwrap keeps the cause reachable to the errors.Is the pipeline classifies a
// deadline with.
func (e *outboundError) Unwrap() error {
	return e.cause
}

// outboundFailed replaces the *url.Error net/http returns, whose Error text
// renders the request URL, with one carrying the cause and no URL. An entry's
// injector may place its secret in the query string, and this error is held in
// Result.Err for the negative TTL (ADR 0023 rev 2).
func (rt *route) outboundFailed(err error) error {
	var wrapped *url.Error
	if errors.As(err, &wrapped) {
		err = wrapped.Err
	}
	return &outboundError{source: rt.entry.Source, cause: err}
}

// respond writes the boundary body the result calls for: the shaped payload on
// a success, a rejection where no outbound call was made, and this module's
// upstream failure otherwise.
func (rt *route) respond(w http.ResponseWriter, result upstream.Result) {
	switch result.Kind {
	case upstream.Success:
		rt.succeed(w, result.Body)
	case upstream.RateLimited:
		reject(w, http.StatusTooManyRequests, causeRateLimited, "this source is being asked for more often than its limit allows")
	default:
		status, cause, message := rt.failure(result)
		rt.fail(w, status, cause, message)
	}
}

// succeed writes the module's payload. It is encoded before the status is, and
// a payload that cannot be encoded is answered as this module's failure.
func (rt *route) succeed(w http.ResponseWriter, body []byte) {
	payload, err := rt.entry.Shape(body)
	if err != nil {
		rt.fail(w, http.StatusBadGateway, causeMalformedPayload, malformedMessage)
		return
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		rt.fail(w, http.StatusBadGateway, causeMalformedPayload, malformedMessage)
		return
	}
	writeEncoded(w, http.StatusOK, encoded)
}

// failure names the status, cause and message for a result that carries no
// body. An unresolvable secret arrives as a failed exchange, so it is read from
// the error before the outcome is; the message carries the secret's name and
// neither its value nor the path it was looked for at. An outcome no case names
// is logged and rendered under the undistinguished cause.
func (rt *route) failure(result upstream.Result) (int, string, string) {
	var unresolvable *secret.UnresolvableError
	if errors.As(result.Err, &unresolvable) {
		return http.StatusBadGateway, causeSecretUnresolvable,
			fmt.Sprintf("the secret %s this source needs is not available", unresolvable.Name)
	}

	switch result.Kind {
	case upstream.Unreachable:
		return http.StatusBadGateway, causeUnreachable, "the source could not be reached"
	case upstream.Timeout:
		return http.StatusGatewayTimeout, causeTimeout, "the source did not answer in time"
	case upstream.UpstreamStatus:
		return http.StatusBadGateway, causeUpstreamStatus, fmt.Sprintf("the source answered with status %d", result.Status)
	case upstream.Oversize:
		return http.StatusBadGateway, causeOversize, "the source's response was larger than this route accepts"
	}

	log.Printf("router: source %s carries no boundary cause for outcome %s", rt.entry.Source, result.Kind)
	return http.StatusBadGateway, causeUpstreamFailure, "this source could not be served"
}

// fail writes this module's upstream-failure body.
func (rt *route) fail(w http.ResponseWriter, status int, cause, message string) {
	writeJSON(w, status, boundary.UpstreamFailure{Module: rt.entry.Source, Cause: cause, Message: message})
}

// fallback answers the API paths no entry registered: a registered source
// reached by a method its route does not serve, and anything else.
type fallback struct {
	sources map[string]struct{}
}

func (f *fallback) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, known := f.sources[strings.TrimPrefix(r.URL.Path, apiPrefix)]; known {
		w.Header().Set("Allow", allowedMethods)
		reject(w, http.StatusMethodNotAllowed, causeMethodNotAllowed, "this source answers "+allowedMethods+" only")
		return
	}
	reject(w, http.StatusNotFound, causeUnknownSource, "this backend serves no such source")
}

// reject writes the client-rejection body (ADR 0026 rev 2).
func reject(w http.ResponseWriter, status int, cause, message string) {
	writeJSON(w, status, boundary.ClientRejection{Cause: cause, Message: message})
}

// writeJSON writes value as the response body under status.
func writeJSON(w http.ResponseWriter, status int, value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	writeEncoded(w, status, encoded)
}

// writeEncoded writes an already-encoded body under status.
func writeEncoded(w http.ResponseWriter, status int, encoded []byte) {
	w.Header().Set("Content-Type", contentTypeJSON)
	w.WriteHeader(status)
	w.Write(encoded)
}
