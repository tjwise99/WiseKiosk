# 0007 — Config validation: one Go library, backend boot gate, frontend renders the report

**Status:** accepted
**Decided:** 2026-07-23 (configuration requirements round #34; ticket #47)

## Context

The configuration requirements round could not write testable fail-fast requirements without
deciding where validation lives. FOUNDATIONS §3 said the frontend "owns" `config.json` while the
backend "schema-validates the config at boot and serves it verbatim" — which reads as a
contradiction. The knot is that "owns" conflates two different things: **whose concerns the keys
describe** (module list, positions, display options — all frontend) and **who delivers the bytes**.
In a one-container deployment the backend process is the only HTTP surface there is: it serves the
SPA bundle, so it serves the config file the same way, regardless of ownership. The real open
question was: who validates, and what refuses to proceed when validation fails.

## Decision

Split the lump three ways:

- **Validation logic is one standalone Go library.** The CLI validator wraps it; the backend
  invokes it at boot. Neither contains its own enforcement of the schema's rules. The schema
  itself — one machine-readable artifact whose format is ticket #8's question — is the only
  deliberately multi-consumer piece: data, not code, which is what keeps a future config editor
  possible.
- **The backend is the boot gate and the reporter.** It runs the library before serving. On
  failure it serves no configuration and no module API, exposes a structured validation report
  (every error: what is wrong, where, and what to change), and its healthcheck reports unhealthy.
  The healthcheck polls the serving process; no other component can carry that signal.
- **The frontend is the presenter.** The fixed page shell loads without a valid configuration,
  receives the validation report as a boundary payload — generated types, per
  [ADR 0001](0001-backend-language-go.md) — and renders the errors in operator language. This is
  the same backend-reports/frontend-renders split the tree already blesses for runtime upstream
  failures (SRS001/SRS002); boot-time config failure is the same shape.

Requirements phrase validation as gating the **application** of a configuration, with boot the only
apply point today, so a future live-apply path (e.g. a remote config editor) is not designed out.
The error-presentation state is scoped to "no valid configuration has been applied," leaving
keep-last-good available to a future live reload handed a bad file.

## Alternatives considered

- **Frontend validates at page load; config served blind.** Keeps the backend config-blind, but
  fail-fast becomes fail-at-render with no healthcheck signal, the error display depends on the
  very machinery a bad config drives, and a schema-validation engine ships to a Pi-Zero-class
  browser — a second, non-Go validation implementation by construction.
- **Backend-served static error page.** Workable, but plants presentation in the component that
  owns no other presentation; rejected in favour of rendering in the SPA shell, matching
  SRS001/SRS002.
- **Both sides validate.** Two engines over one schema drift, and the divergence surfaces as a
  validator that accepts what boot rejects — the exact defect class the single-definition rule
  exists to kill. A second implementation with no second need is what FOUNDATIONS §5 forbids.

## Consequences

- The CLI validator and the boot gate cannot disagree: one implementation (SRS014).
- The validation report is a boundary payload — generated from the boundary schema, picked up by
  the boundary-contract domain (#37).
- The page shell acquires a hard obligation to render with no valid configuration (TST013).
- FOUNDATIONS §3's "owns" sentence is retired by the shape-vs-delivery distinction recorded here;
  the prose itself dissolves under #42.
