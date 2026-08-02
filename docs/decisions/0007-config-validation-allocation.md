# 0007 — Config validation is frontend-owned: one TS engine in the page and the desk CLI

**Status:** accepted
**Decided:** 2026-07-23 (configuration requirements round #34; ticket #47; revised the same day from
a backend-boot-gate draft after owner challenge)

## Context

The configuration requirements round could not write testable fail-fast requirements without
deciding where validation lives. The original design sketch read as contradictory — the frontend
"owns" `config.json` while the backend "schema-validates at boot and serves it verbatim" — because
"owns" conflates **whose concerns the keys describe** (module list, positions, display options — all
frontend) with **who delivers the bytes**. The mechanical constraint that survives every option:
the page runs in a browser on the display host, so config bytes reach it only over HTTP, from the
origin that already serves the SPA bundle. "Serving the config" means a file sits in the static
tree — it does not have to mean a code path.

A first draft of this ADR allocated a backend boot gate (validate at boot, refuse and serve a
structured report, healthcheck unhealthy). That design rested on an unratified premise: *the
deployment healthcheck must reflect config validity*. The premise was elicitation scaffolding, not
an owner requirement — and it was the only thing importing config awareness into the backend. The
owner challenged it; it fell; the allocation below is what remains when it does.

## Decision

- **The configuration is a static file** bind-mounted into the served tree. The Svelte app fetches
  it like any other asset; delivery is byte-for-byte by construction, because static file serving
  has no rewrite path.
- **One TypeScript validation engine, two build targets.** In the page, it runs at load and gates
  rendering: an invalid configuration is never applied, and the page shell — which requires no
  valid configuration to load — renders the full validation report in operator language instead.
  The same source is packaged as the standalone desk CLI ([`../../tools/README.md`](../../tools/README.md)),
  so page-load validation and the desk validator cannot disagree.
- **The backend is config-blind.** No config file, no parse, no endpoint, no code path that knows
  the configuration exists. The healthcheck is process liveness only; config validity is signalled
  by the display itself and caught pre-deploy by the desk validator.
- Requirements phrase validation as gating the **application** of a configuration; page load is
  today's only apply point, so a future live-apply path (e.g. a remote config editor) is not
  designed out.

## Alternatives considered

- **Backend boot gate** (this ADR's first draft): Go validation library invoked by the backend at
  boot; refuse-and-report; healthcheck unhealthy; report crosses the boundary as a generated
  payload. Rejected once its motivating premise fell: dropping the config-aware healthcheck makes
  "the backend owns no config" literal rather than fenced, moves diagnostics into the component
  that owns presentation (which can map errors to display regions), and removes a boundary payload.
- **A Python validator.** Serves neither consumer: browsers cannot run it, and the desk needs an
  interpreter a non-technical operator does not have. The engine language falls out of the
  allocation — TS serves browser + CLI; Go served backend + CLI; Python serves only a developer's
  shell.
- **Both sides validate.** Two engines over one schema drift, and the divergence surfaces as a
  validator that accepts what the page rejects — the defect class the single-definition rule
  exists to kill — a second implementation built without a second need
  ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist, generality).
- **Entrypoint check** (frontend-owned plus the same CLI run at container start). Catches a bad
  deploy while the operator is still at the terminal, but ships Node in the image and reintroduces
  hard-exit for the unattended case.

## Consequences

- Page-load and desk validation are one implementation (SRS005
  <!-- One validation implementation -->); the engine ships in the bundle — acceptable for a small
  schema, even on a Pi-Zero-class browser — and as a packaged CLI, a distribution question the
  generator has in every variant.
- The validation report never crosses the frontend/backend boundary: one less payload in the
  contract, and the boundary-contract domain (#37) is untouched by configuration.
- The apply floor improves: edit the file, reload the page — no container restart, rebuild, or
  redeploy (SRS003 <!-- A configuration change applies no later than the next page load -->).
- A future remote config editor composes naturally: same schema, same engine.
- The page shell acquires a hard obligation to load and render diagnostics without a valid
  configuration (TST010 <!-- Pending: configuration failure-class render test -->).
- The freshness floor (SRS003
  <!-- A configuration change applies no later than the next page load -->) is frontend-owned: the
  page must fetch the configuration bypassing HTTP caches (`cache: 'no-store'` or equivalent),
  because the conventional server-side fix — a no-cache header on the config path — is a
  config-aware code path this decision forbids.
- A healthy healthcheck coexists with a display showing an error report. Accepted, not accidental:
  the mirror is the monitoring surface — nobody watches healthchecks at a family member's house. A
  future observability pass must not "fix" this by re-adding a config-aware healthcheck.
- The original backend-validates sentence and "boot validation" phrasing are superseded here; both
  dissolve under #42.
