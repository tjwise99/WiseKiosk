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

	log.Fatal(http.ListenAndServe(addr, newServer(staticserve.New(http.Dir(*root)), nil)))
}

// newServer assembles the routes: the boundary schema's own, the seam over the
// rest of the API path space, and the served tree for everything else. A nil
// seam is the framework's own, which answers for every API path the schema
// declares no route at. The schema's paths are registered by the generated
// router, so no path it declares is written here (ADR 0008 rev 4).
//
// A module data route's generated pattern is more specific than the /api/ seam,
// so it takes that path — the schema decides where a route is and the module
// embedded below decides what it does. The generated wrapper reads nothing of
// the request on the way: a module route's inputs are its JSON body, which the
// module reads itself, so the wrapper binds nothing and has no rejection of its
// own to write.
func newServer(static, seam http.Handler) http.Handler {
	mux := http.NewServeMux()
	boundary.HandlerFromMux(schemaRoutes{}, mux)
	if seam == nil {
		seam = router.NewFallback(mux)
	}
	mux.Handle("/api/", seam)
	mux.Handle("/", static)
	return mux
}

// schemaRoutes is the whole of the boundary schema's server interface. The
// generated interface is one, and its two kinds of path are owned by different
// packages — an infrastructure route by the package that answers it, every
// module data route by the module itself through the registry — so the two are
// composed at the assembly point rather than in either of them.
type schemaRoutes struct {
	health.Route
	registry.Modules
}

// The tie the composite exists for, asserted where it is read rather than at the
// call above: a schema route no embedded type serves is a missing method here.
var _ boundary.ServerInterface = schemaRoutes{}
