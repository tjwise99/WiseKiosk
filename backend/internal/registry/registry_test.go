package registry

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/tjwise99/WiseKiosk/backend/internal/router"
)

// schemaPath is the boundary schema, from this package's directory. Reading the
// authored schema rather than anything generated from it is the point: a module
// data route is excluded from the Go generation, so the path and the source that
// serves it are two spellings with no compiler between them (ADR 0008 rev 4).
const schemaPath = "../../../boundary/openapi.yaml"

// apiPrefix is the path space a module data route sits in. A route's last
// segment is its source.
const apiPrefix = "/api/"

// The two lines the scan below recognises. A path item is a key at the schema's
// path indent; the tag marks the path item it sits under as a module data route.
//
// The tag is spelled in three places — the schema that carries it, the
// generator's configuration that excludes it, and here — and every partial
// rename among them fails loudly rather than quietly. Renaming it in either of
// the first two alone generates a handler for the route, whose parameter binding
// imports a module `backend/go.mod` does not carry, so the build stops at the
// import: the dependency this arrangement exists to avoid is also what guards it
// (ADR 0008 rev 4). Renaming it in both and not here leaves the module set
// empty, which the case below refuses outright.
var (
	pathItem    = regexp.MustCompile(`^ {2}(/\S*):\s*$`)
	moduleRoute = regexp.MustCompile(`^\s+- module-route\s*$`)
)

// declaredPaths reads the schema's path items, and which of them are module data
// routes. A path item opens a block and holds until the next one, which is what
// lets a tag inside it be attributed.
func declaredPaths(t *testing.T) (all map[string]bool, moduleRoutes map[string]bool) {
	t.Helper()

	authored, err := os.ReadFile(filepath.FromSlash(schemaPath))
	if err != nil {
		t.Fatalf("reading the boundary schema: %v", err)
	}

	all, moduleRoutes = map[string]bool{}, map[string]bool{}
	open := ""
	for line := range strings.Lines(string(authored)) {
		line = strings.TrimRight(line, "\r\n")
		if found := pathItem.FindStringSubmatch(line); found != nil {
			open = found[1]
			all[open] = true
			continue
		}
		if open != "" && moduleRoute.MatchString(line) {
			moduleRoutes[open] = true
		}
	}

	// A scan that matched nothing would pass every comparison below on an empty
	// population. /healthz is the schema's own infrastructure route, so finding
	// it says the scan reads path items, and finding it outside the module set
	// says the tag is read as well.
	if !all["/healthz"] {
		t.Fatalf("the schema scan found no /healthz among %v, so it is not reading path items", all)
	}
	if moduleRoutes["/healthz"] {
		t.Fatal("the schema scan reads /healthz as a module data route")
	}
	return all, moduleRoutes
}

// TestEveryEntrySourceIsAPathTheSchemaDeclares is the forward half of the
// correspondence no compiler holds: a source renamed here without the schema
// following registers a route the frontend's generated client never calls.
func TestEveryEntrySourceIsAPathTheSchemaDeclares(t *testing.T) {
	all, _ := declaredPaths(t)

	if len(Entries) == 0 {
		t.Skip("the registration list is empty, so there is no source to compare")
	}
	for _, entry := range Entries {
		if declared := apiPrefix + entry.Source; !all[declared] {
			t.Errorf("entry %q serves %s, which the schema does not declare", entry.Source, declared)
		}
	}
}

// TestEveryModuleRouteTheSchemaDeclaresHasAnEntry is the reverse half, and the
// one a generated server interface would hold by construction: a path the schema
// declares and no entry serves answers 404 to a frontend calling the client
// generated from that same schema.
func TestEveryModuleRouteTheSchemaDeclaresHasAnEntry(t *testing.T) {
	_, moduleRoutes := declaredPaths(t)

	if len(moduleRoutes) == 0 {
		t.Fatal("the schema declares no module data route, so nothing here is compared")
	}

	served := make(map[string]bool, len(Entries))
	for _, entry := range Entries {
		served[apiPrefix+entry.Source] = true
	}
	for declared := range moduleRoutes {
		if !served[declared] {
			t.Errorf("the schema declares %s and no entry serves it", declared)
		}
	}
}

// TestTheRegistrationListServesEachPathItDeclares reads the correspondence the
// two cases above compare by name, through the router the process runs. Building
// it is also the construction check: an entry the framework cannot serve panics
// here rather than at the first request it would fail.
func TestTheRegistrationListServesEachPathItDeclares(t *testing.T) {
	handler := router.NewRouter(Entries)

	for _, entry := range Entries {
		t.Run(entry.Source, func(t *testing.T) {
			// A request naming nothing, which a registered source refuses before
			// any outbound call — where it refuses one at all. A source that admits
			// it would be answered from upstream, which a test does not reach, and
			// then a served path cannot be told from an unserved one here.
			if entry.Validate(url.Values{}) == nil {
				t.Skip("this source admits a request naming nothing")
			}

			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, apiPrefix+entry.Source, nil))

			if recorder.Code == http.StatusNotFound {
				t.Fatalf("GET %s%s is not a path this list serves (%s)", apiPrefix, entry.Source, recorder.Body)
			}
			if recorder.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want the entry's own rejection %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
			}
		})
	}
}
