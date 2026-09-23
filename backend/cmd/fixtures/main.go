// A diagnostic origin for profiling the display on the deployed board: the
// product's own assembly with the park-wait-times route answered from an
// embedded fixture, so every run draws the same full, open roster and no
// upstream is reached. Built by no image and by no CI step that produces one —
// the Dockerfile builds `./cmd` alone.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/headers"
	"github.com/tjwise99/WiseKiosk/backend/internal/health"
	"github.com/tjwise99/WiseKiosk/backend/internal/registry"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

const (
	// defaultAddr is the service port the product serves on, fixed by
	// ADR 0020 rev 4.
	defaultAddr = ":8080"
	// defaultStaticRoot is the bundle location for a run from the repository
	// root.
	defaultStaticRoot = "frontend/dist"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}

// run parses flags out of args and serves, returning the process exit code. It
// is kept apart from main so it can run under test with its own flag set and
// injected stderr — main() itself cannot: it either blocks serving or exits the
// test binary. serve below is the seam a test overrides to avoid binding a port.
func run(args []string, stderr io.Writer) int {
	fs := flag.NewFlagSet("fixtures", flag.ContinueOnError)
	fs.SetOutput(stderr)
	addr := fs.String("addr", defaultAddr, "address to serve on")
	root := fs.String("static-root", defaultStaticRoot, "directory served as the frontend bundle")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	err := serve(*addr, newServer(staticserve.New(http.Dir(*root)), nil))
	_, _ = fmt.Fprintln(stderr, err)
	return 1
}

// serve is the seam a test overrides to avoid binding a port.
var serve = func(addr string, h http.Handler) error {
	return http.ListenAndServe(addr, h)
}

// newServer assembles the same route space the product assembles, over
// fixtureRoutes rather than the product's own set.
func newServer(static, seam http.Handler) http.Handler {
	mux := http.NewServeMux()
	boundary.HandlerFromMux(fixtureRoutes{}, mux)
	if seam == nil {
		seam = router.NewFallback(mux)
	}
	mux.Handle("/api/", seam)
	mux.Handle("/", static)
	return headers.Wrap(mux)
}

// fixtureRoutes is the product's schema route set with one method of its own.
// The embedded fields carry every other schema route unchanged, and
// PostApiParkWaitTimes below shadows the one registry.Modules promotes, so the
// schema still registers every path and only what answers this one differs
// (ADR 0008 rev 6).
type fixtureRoutes struct {
	health.Route
	registry.Modules
}

// The tie the composite exists for: a schema route no method serves is a
// compile error here.
var _ boundary.ServerInterface = fixtureRoutes{}

// PostApiParkWaitTimes answers from the embedded fixture and makes no upstream
// request. A body that cannot be read, and one that is not a park-wait-times
// request, are each rejected through router.Reject rather than answered.
func (fixtureRoutes) PostApiParkWaitTimes(w http.ResponseWriter, r *http.Request) {
	router.BoundBody(w, r)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		router.Reject(w, router.InvalidParameters, "the request body could not be read")
		return
	}
	var request boundary.ParkWaitTimesRequest
	if err := json.Unmarshal(body, &request); err != nil {
		router.Reject(w, router.InvalidParameters, "the request body is not a park-wait-times request")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(fixturePayload(request.Parks))
}
