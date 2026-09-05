// Package headers serves the response headers every route answers under: a
// content-security policy confining the page to its own origin
// (SRS010<!-- The display page reaches no origin but the backend's -->), a
// denial of type inference alongside the type each route already declares
// (SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->),
// and a denial of every browser feature the page has not been granted
// (SRS027<!-- The display page holds no device capability it does not use -->).
package headers

import (
	_ "embed"
	"net/http"
	"strings"
)

//go:embed csp.txt
var cspFile string

//go:embed permissions-policy.txt
var permissionsPolicyFile string

// csp is the Content-Security-Policy value served on every response, trimmed
// of the trailing newline net/http would otherwise rewrite to a space on the
// wire.
var csp = strings.TrimSpace(cspFile)

// permissionsPolicy is the Permissions-Policy value served on every response,
// read from the tracked permissions-policy.txt file.
var permissionsPolicy = strings.TrimSpace(permissionsPolicyFile)

// Wrap sets the content-security policy, the no-inference declaration and the
// denied-feature policy on every response next answers, before calling it.
func Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("Content-Security-Policy", csp)
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Permissions-Policy", permissionsPolicy)
		next.ServeHTTP(w, r)
	})
}
