// The WiseKiosk backend: one origin serving the frontend bundle, whatever an
// operator has mounted beside it, and the API.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/health"
	"github.com/tjwise99/WiseKiosk/backend/internal/registry"
	"github.com/tjwise99/WiseKiosk/backend/internal/router"
	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

const (
	// addr is the service port, fixed by ADR 0020 rev 2 along with the two
	// flags main reads.
	addr = ":8080"
	// defaultStaticRoot is the bundle location for a run from the repository
	// root; a container points -static-root at its own.
	defaultStaticRoot = "frontend/dist"
)

func main() {
	root := flag.String("static-root", defaultStaticRoot, "directory served as the frontend bundle")
	selfCheck := flag.Bool("health-check", false, "ask the local instance for liveness and exit")
	flag.Parse()

	if *selfCheck {
		if err := health.Check("http://localhost" + addr); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	api := router.NewRouter(registry.Entries)
	log.Fatal(http.ListenAndServe(addr, newServer(staticserve.New(http.Dir(*root)), api)))
}

// newServer assembles the routes: the boundary schema's own, the API, and the
// served tree for everything else. A nil api answers 404 for every path under
// /api/. The schema's paths are registered by the generated router, so no path
// it declares is written here (ADR 0008 rev 4).
//
// A module data route's generated pattern is more specific than the /api/ seam,
// so it takes that path and hands it back to the same handler the seam holds —
// the schema decides where the route is and the registry decides what it does.
// The generated wrapper reads the schema's parameters before either, and is
// given the boundary's own rejection body for a request it cannot read them
// from.
func newServer(static, api http.Handler) http.Handler {
	if api == nil {
		api = http.NotFoundHandler()
	}

	mux := http.NewServeMux()
	boundary.HandlerWithOptions(schemaRoutes{Routes: registry.NewRoutes(api)}, boundary.StdHTTPServerOptions{
		BaseRouter:       mux,
		ErrorHandlerFunc: router.RejectParameters,
	})
	mux.Handle("/api/", api)
	mux.Handle("/", static)
	return mux
}

// schemaRoutes is the whole of the boundary schema's server interface. The
// generated interface is one, and its two kinds of path are owned by different
// packages — an infrastructure route by the package that answers it, every
// module data route by the registry — so the two are composed at the assembly
// point rather than in either of them.
type schemaRoutes struct {
	health.Route
	registry.Routes
}
