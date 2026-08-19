// Package canarytest holds the value the secret-leak sweeps plant and search
// for. Two packages sweep — the router's routes and the assembled server's
// surfaces — and Go's package boundary would otherwise make the value two
// literals, where strengthening one leaves the other sweeping for something
// else while both still read as one mechanism.
package canarytest

// Value is planted through the <NAME>_FILE delivery path and swept for in every
// response body, every response header value and the captured log output
// (ADR 0023 rev 1). It is distinctive rather than plausible, so a match is the
// planted value and never an accident of the payload.
const Value = "canary-3f8a-not-in-any-output"
