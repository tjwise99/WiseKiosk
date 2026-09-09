# 0029 — Render the API explorer with a build-fetched Swagger UI, interactive locally

**Status:** accepted
**Decided:** 2026-09-09 (#195 API explorer implementation, owner-ruled the same day)
**Rev:** 1

## Revisions

- **rev 1** — 2026-09-09 — first written (#195 API explorer).

## Context

`boundary/openapi.yaml` ([ADR 0008 rev 5](0008-boundary-contract-openapi-codegen.md)) is the whole
wire contract, but it had no browsable or interactive rendering — a developer read the YAML by hand.
ADR 0008 rev 5 withdrew the docsite-renderer decision and delegated it to #195, deferred until real
content existed; `boundary/openapi.yaml` now carries `/healthz` and `/api/weather`, so that deferral
has lapsed.

## Decision

Render the schema with [Swagger UI](https://github.com/swagger-api/swagger-ui), fetched at build time
as an npm devDependency (`swagger-ui-dist`, pinned) in a new `docs/site/` npm silo, and copied into the
Sphinx build output by `docs/site/copy_explorer_assets.py` (`html_static_path`, gitignored, regenerated
every build). **Swagger UI's source is never committed** — no `.js`/`.css`/`.map` is ever git-tracked;
the built site's `_static/swagger-ui/` and `_static/openapi.yaml` are pure build output, the same way
`docs/site/generated/` (the sphinx-needs pages) already is.

This needs no new rev of [ADR 0017 rev 8](0017-authored-language-set.md): it already carves out
"documentation, and the assets a build serves" from the authored-language-set decision entirely — a
build-fetched, build-copied bundle a docs build serves is exactly that carve-out, not a new authored
JS/CSS surface.

**"Try it out" is interactive locally, and reference-only on the published site.** `frontend/`'s Vite
dev server already reaches the backend same-origin, without any CORS header, through its existing
`server.proxy` for `/api` and `/healthz` — the identical path the frontend bundle itself uses. A
dev-only Vite plugin (`frontend/vite-plugin-docs-explorer.ts`, a `configureServer` hook — a hook `vite
build`/`vite preview` never call, so it cannot reach the production bundle) mounts the *whole* built
docs site at `/docs` — every page, `_static` asset and the search index, not the explorer alone —
riding that same proxy: `curl`, the generated boundary client and now the explorer page (one page of
the site, at `/docs/api-explorer.html`) all reach the backend the same, unmodified way. `just
docs-serve` is the one command that builds the docs site and launches this server, so there is no
separate build-then-serve step to remember; with `just serve` running, it prints both URLs. No backend
code changed, no new dependency, no requirement or gate touched. On the published static Pages site —
no backend behind it at all — the
explorer stays browsable-only, which is not a limitation of this change but of what a static site can
ever do.

## Alternatives considered

- **Hard-committing Swagger UI's source.** Would make `.js`/`.css`/`.map` tracked, tripping
  `check-languages.py` (no `.js` extension is declared at all — a hand-committed bundle fails outright)
  and `check-added-large-files`, forcing a language-gate carve-out. Rejected precisely *because* it
  would weaken a gate for this feature's sake; the build-fetch route avoids that entirely, confirmed by
  `git ls-files` carrying zero `swagger-ui-dist` files after implementation.
- **sphinxcontrib-openapi.** Renders the schema browsably from within Sphinx with no extra JS, but has
  no "Try it out" affordance of any kind — fails the interactive half of the ask outright.
- **Scalar.** Also interactive, but at decision time its dist was roughly double Swagger UI's size, with
  materially more frequent releases (near-daily vs. weekly) and no established advisory track record in
  this project's dependency-scanning experience — more vendored surface to re-vet for no rendering
  capability Swagger UI lacks here.
- **Standalone, cross-origin docs server reaching the backend directly.** Serve the built docs site
  from its own static-file origin and point Swagger UI straight at the backend's fixed `:8080`.
  Rejected: the backend sends no `Access-Control-Allow-Origin` header anywhere
  (`backend/internal/headers.Wrap`, the sole place response headers are set) — confirmed empirically
  against the real handler and via a real-browser cross-origin `fetch()`, both failing for `GET
  /healthz` and `POST /api/weather`. Fixing it would need a backend CORS capability this docs ticket
  has no business adding: there is no existing dev/prod switch in the backend at all, and
  [ADR 0020 rev 4](0020-release-artifact-set-and-operator-tooling.md) already closes "the operator
  interface to the binary is its flags, and there are two" — a new gate would need a rev to that
  decision, not just code; `headers.Wrap` is itself requirement-cited
  (SRS010<!-- The display page reaches no origin but the backend's -->,
  SRS027<!-- The display page holds no device capability it does not use -->,
  SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->), so a new
  observable header behavior there reads as a new obligation under
  [ADR 0011 rev 2](0011-requirement-or-convention.md);
  and the OPTIONS preflight `/api/weather` needs cannot be added to the generated router
  (`backend/internal/boundary/boundary.gen.go`, drift-gated `oapi-codegen` output) without either
  forking `boundary/openapi.yaml` or a second, separate bypass-middleware mechanism ahead of it.
- **Serving the explorer through the backend itself, via its existing `-static-root` flag** (pointed at
  the built docs site instead of `frontend/dist` — the same one-origin composition `just
  run`/`run-container` already use for the compiled frontend bundle, needing no new flag). This avoids
  CORS entirely by being genuinely same-origin, but fails on a different wall: `headers.Wrap` sets a
  strict Content-Security-Policy (`script-src 'self'; style-src 'self'; img-src 'self'`, no
  `unsafe-inline`, no `unsafe-eval`, no `data:`) over the *entire* mux, including the static handler.
  Confirmed empirically (real backend, real headless-browser render): Swagger UI never renders at all
  under it — its own inline init script, the inline styles it injects at runtime, its `data:` SVG icons
  and an internal `eval`/`new Function()` call are all blocked. Loosening that CSP is a backend change
  to the same requirement-cited function as above
  (SRS010<!-- The display page reaches no origin but the backend's -->,
  SRS027<!-- The display page holds no device capability it does not use -->,
  SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->), on the
  identical binary that runs the physically deployed kiosk — out of scope here for the same reason the
  CORS route is.

The Vite dev-plugin route was chosen because it is the only one of the three interactive-delivery
options that needs no backend change of any kind.

## Consequences

Makes the boundary contract browsable from the docs site, and interactive against a real backend for
local development, at the cost of one more npm silo (`docs/site/`) for Renovate to keep current —
already covered by the default npm manager the same way `docs/architecture/`'s silo already is, no
`renovate.json` change needed — and one small dev-only Vite plugin plus one new `justfile` recipe
(`docs-serve`, depending on the existing `site-build`) that previews the whole docs site locally, the
explorer being one page of it. `just dev` itself stays untouched: the docs build is not one of its
prerequisites, so the ordinary frontend dev loop pays nothing for this. The plugin still 404s
gracefully if the docs build is ever missing, but that is a safety net, not the
documented path — `just docs-serve` always builds first. Forecloses committing any
interactive-explorer JS to the tree outright, by construction (the same gates that already forbid it
for anything else). The published site's "Try it out" stays reference-only, which is inherent to a
static site having no backend behind it, not a gap this ADR leaves open.
