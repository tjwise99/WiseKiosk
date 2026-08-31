// Package registry holds the route registration list (ADR 0021 rev 2).
package registry

import "github.com/tjwise99/WiseKiosk/backend/internal/router"

// Entries is the static route registration list: one entry per upstream-backed
// module, declared here and nowhere else. A module is added by adding one
// element to this literal.
var Entries = []router.Entry{}
