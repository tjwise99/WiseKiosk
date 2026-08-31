# 0008 — Boundary contract: one OpenAPI schema, the whole wire contract generated from it

**Status:** accepted
**Decided:** 2026-08-31 (rev 4's registry seam, met at the first module data route on #220 weather
module; the types-to-wire-contract pivot taken 2026-08-23 in the #188 boundary codegen session, and
the surrounding model 2026-07-23 at the boundary-contract requirements round #37, with the
codegen-mechanism trade carried by #7). This ADR records the mechanism **decision**; the **build** is
#7, and rev 3's migration is #188.
**Rev:** 4

## Revisions

- **rev 4** — 2026-08-31 — rev 3's open question is answered by the first module data route: the
  generated `ServerInterface` method **delegates into the registry**, implemented in the registry's
  own file beside the entry it reaches. The Go generator reads that route **without its request
  parameters**, through an overlay, so the emitted code binds nothing and keeps rev 3's claim that
  the generated server adds no module requirement — which a parameterised route would otherwise have
  falsified (#220 weather module).
- **rev 3** — 2026-08-23 — both sides generate the **whole wire contract** — routes, client, server
  and types — where rev 2 generated types alone and left every route hand-authored on each side. That
  gap put the route outside what the drift gate compares, and a hand-rolled per-route drift script was
  written to patch it. `openapi-typescript` gives way to `orval`; the Go side turns on
  `oapi-codegen`'s `std-http-server` and `client` targets. `/healthz` enters the schema, and the
  schema is recorded as holding two kinds of path (#188 boundary codegen).
- **rev 2** — 2026-08-12 — the schema's location, left open here and named as another ticket's to
  take, is [ADR 0021 rev 1](0021-repository-layout.md)'s; the sentences deferring it now cite that
  record. The mechanism, the version and the drift gate are unchanged (#5 repo layout).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

The Go backend and the TypeScript frontend share no types ([ADR 0001 rev 1](0001-backend-language-go.md)),
which makes the boundary contract non-negotiable: **one schema, both sides generated from it**, CI
failing on stale generated code. Round #37 elicited the requirements for that property
(SYS005<!-- Single-definition internal contract -->;
SRS015<!-- One schema, all boundary value classes -->–SRS016<!-- Both sides consume the generated types -->)
deliberately **mechanism-agnostic** — a "shall" that names a tool churns when the tool changes. This
ADR chooses the tool, which is the decision half of #7.

#7 was gated on the repository layout — where the single schema and the two packages live. Choosing
the mechanism does not need that layout; only *building* it does, so this ADR took the decision
without one, and [ADR 0021 rev 2](0021-repository-layout.md) supplied the layout afterwards. #7's
acceptance — schema file present, both generators wired, drift gate green — is what waited.

**What rev 3 reopens.** Rev 2 read "both sides generated from it" as *both sides' types*, and the
first route to exist showed what that leaves out. The path was hand-authored on each side — a Go
constant and a TypeScript string — and neither was compared to anything: what the drift gate
regenerated were types, and the Go generator's output did not carry a path at all. The gap was then
patched by a bespoke script written to compare the two hand-authored strings, a second enforcer for
the property the drift gate already exists to hold. That is the shape of a mechanism decided one
notch too narrow, so rev 3 widens it to the whole wire contract rather than adding the script.

## Decision

- **One hand-authored OpenAPI schema is the single definition**, owned by neither package (it sits at
  `boundary/openapi.yaml`, per [ADR 0021 rev 2](0021-repository-layout.md)). A module contributes its payload as a **named component inside
  that schema**: the *fragment* [the module contract](../contracts/module-contract.md) part 6 names is
  that component, a section of the one schema rather than a file of its own, so nothing recomposes and
  the schema stays authored rather than generated. Rejected — one fragment file per module, recomposed
  into the committed schema: it buys per-module file ownership at the cost of a composition stage in
  the drift gate and an OpenAPI that is generated output, which is the same cost that rules out
  TypeSpec below. The configuration schema's shape is #8's and nothing here settles it.
- **OpenAPI 3.0.3 now; 3.1 is the stated migration target.** 3.1's schema objects *are* JSON Schema
  2020-12, which would give one dialect shared with the configuration schema (open question 4) and a
  common docsite render — but `oapi-codegen` has historically lagged 3.1. Start on the interop-safe
  version; migrate once both generators handle 3.1 cleanly, whatever renders the schema does, and
  the config-schema format is settled.
- **Each side generates its whole wire contract — routes, client, server and types — not types
  alone.** Types-only generation leaves every route hand-authored twice, which puts the one thing the
  single-definition rule is about *outside* what the drift gate compares. A generated *type* naming a
  path is not enough: the request is issued and served by hand-written strings, so the gate can agree
  with itself while the two sides disagree with each other. Rev 2 had it that way, and the first
  liveness route promptly grew a bespoke per-route drift script to patch the hole by hand. Generating
  the route table closes it by construction — the registration and the call site are both output of
  the schema, so a path that moves is a difference the existing gate sees.
- **Go via `oapi-codegen`** with `models`, `std-http-server` and `client`. `std-http-server` binds
  against the standard library's own `net/http.ServeMux` through a structural interface `*http.ServeMux`
  already satisfies, so **no router dependency and no new module requirement** — the process keeps
  its own `main` and its own multiplexer, and the generated half is one file. Rev 4 records what the
  second half of that turns on: the one part of the emitted Go that would need a module is parameter
  binding, and the overlay below is what removes it.
- **TypeScript via `orval`** (its `fetch` client), which replaces `openapi-typescript`. It emits one
  self-contained file whose every declaration is local — nothing resolves into `node_modules`, which
  is what SRS016<!-- Both sides consume the generated types --> requires of a boundary value's
  declaration — and whose client is a bare `fetch` call, so **nothing enters the browser module
  graph and the bundle carries no runtime helper** (the Raspberry-Pi-Zero-class constraint decides
  this, as it did when the same clause bought types-only emission). It declares no `typescript` peer,
  so the generator cannot hold a TypeScript upgrade hostage. Its output is formatted by `prettier`,
  orval's own declared peer, because the raw emission carries stray semicolons and blank-line runs.
- **The schema holds two kinds of path.** A **module data route** carries the full component set —
  its success payload, the upstream-failure body and the client-rejection body — and is what
  [the module contract](../contracts/module-contract.md) governs. An **infrastructure route** answers
  about the process rather than about a source, declares its own response and nothing else, and is
  not a module's to contribute. Rev 3 brings one in, `/healthz`, whose 200 carries no body at all
  because every consumer reads the status code; which paths of either kind exist is the schema's to
  say, and is not counted here. The distinction is recorded because the schema's
  conventions were written module-shaped, and **both** of
  TST032<!-- Pending: boundary schema is single and complete -->'s path-level clauses are scoped to
  module data routes when it is activated. Its "every path declares the error set" assertion is,
  because that is where the obligation comes from — an infrastructure route has no upstream to fail
  and no request to reject. Its "schema path items equal the static route registration list, in both
  directions" assertion is too, for the same reason one clause over: that list holds one entry per
  upstream-backed module, so `/healthz` is a path item that has no entry in it and is never going to
  acquire one. Read unscoped, the clause is false the moment an infrastructure route exists, and the
  reading that repairs it — adding registry plumbing for a liveness route — would invent a module
  where there is none.
- **A generated module-route method delegates into the registry, and lives beside the entry it
  reaches.** Rev 3 left open how a generated `ServerInterface` method meets a registry whose whole
  interface is one element of a literal. The answer: the method is written once per module data
  route, in the registry's own file, and its body hands the request to the handler built over that
  literal — so the *path* is the schema's, the *behaviour* is the framework's, and nothing about the
  request is decided in both. Three properties follow. The generated pattern shadowing the `/api/`
  seam stops being a hazard and becomes the mechanism, because what it shadows the seam with is the
  seam's own handler. A route the schema declares and the registry has not taken up is a build
  failure rather than a path that answers from somewhere else, which is the compile-time tie the
  types already had and the routes did not. And the per-route hand code rev 3 objected to is a
  delegation naming no path, no method and no parameter — the *drift* the objection was about
  cannot live in it.
  Rejected — a registry read at build time to synthesise the methods: code generation of our own, a
  second generator in the drift gate, against a population of about five routes. Rejected — keeping
  module paths out of the schema: it buys back the hand-authored request on the frontend, which is
  the property this ADR exists to hold.
  The cost is honest and is the reason the alternatives were weighed: a module now costs the shared
  tree **two** things rather than one — its element of the registration list and its delegation —
  both in the one file [the module contract](../contracts/module-contract.md) part 5 already admits
  framework code naming a module in.
- **The Go generator reads a module data route without its request parameters, through an overlay.**
  Those parameters are the route's registration entry's to judge — the entry reads the raw query,
  which is also what the response cache is keyed on — so a generated handler that bound them into a
  struct would be parsing two floats the delegation immediately discards. That binding is the *one*
  thing in the emitted Go needing anything outside the standard library
  (`github.com/oapi-codegen/runtime`, and two modules beneath it), so removing it removes them. The
  overlay is a subtraction, declared in the Go generator's configuration and applied before
  generation: the schema is unchanged and stays the single authored source, the route and the payload
  types are still generated on this side, and the **frontend generates from the schema itself**, so
  its client still carries the parameters and the request is hand-authored nowhere.
  It selects on the `module-route` tag rather than on any path, so no module's name reaches the Go
  generator's configuration and the overlay is written once. Two things make a mistake in it loud:
  the generator is strict about a selector matching nothing, and a module route the selector misses
  keeps its parameters, so the emitted code imports a module `backend/go.mod` does not carry and the
  build stops at the import.
  Two properties fall out that are worth having in their own right. There is **one validator** of a
  request's parameters rather than two — the entry's — where a generated binding would have refused
  some requests before the entry ever saw them. And no response can leave this backend outside the
  shapes this schema declares: an unbindable request would have been answered by the generator's
  `ErrorHandlerFunc`, whose default writes `net/http`'s plain text on a path this schema declares.
  Rejected — accepting the dependency for a parse that is thrown away. Rejected — dropping the Go
  `client` target to shed it, which does not work (the server binding needs the module too) and would
  cost the liveness probe its generated path. Rejected — excluding module data routes from the server
  generation altogether, which sheds the dependency but gives up the generated route this ADR exists
  to hold.
- **The schema defines every value class that crosses the boundary**
  (SRS015<!-- One schema, all boundary value classes -->): request parameter names and types,
  success payloads, the structured body for the upstream failure
  SRS001<!-- A failed module shows why, and only that module --> obliges a module to render, the
  client-error rejection body SRS013<!-- Client-facing contract for rejected requests --> requires
  the frontend to be able to render, and every response status code the frontend discriminates on.
  SRS001<!-- A failed module shows why, and only that module --> and
  SRS013<!-- Client-facing contract for rejected requests --> oblige the behaviour; the shapes that
  carry it are defined here and nowhere else, because
  SRS015<!-- One schema, all boundary value classes --> admits no second definition site.
- **Drift gate:** a repo-level CI check regenerates both sides and fails on any difference
  (`git diff --exit-status`); the generators are **version-pinned** so a toolchain bump cannot read
  as schema drift (SRS016<!-- Both sides consume the generated types -->; verified by
  TST033<!-- Pending: boundary codegen drift-gate test -->). The gate is repo-level because it
  spans both packages. It also **compiles** each side's output, because a generator exits zero on any
  configuration it accepts — including one naming fewer targets than the code consumes — and a
  non-empty assertion passes on a file missing a whole target. Compilation is what makes the consumer
  the judge of what was generated.
- **The frontend consumes the generated contract only — no runtime re-validation of proxied payloads.**
  The version-skew case a runtime validator defends against is foreclosed by single-image co-deploy,
  and a bundled validator (schema→zod/ajv) would cost weight and per-render CPU on the Pi against a
  case that does not exist. **Reopen if the two sides ever become independently deployable** — that
  is the premise the foreclosure rests on, and nothing else here survives its loss. This was once a
  requirement; it was deleted as a prohibition against a case that does not exist, and this ADR is
  its home.
- **Docsite: withdrawn as a decision here.** Rev 2 named `sphinxcontrib-openapi` as the renderer, on
  the generated-not-authored, single-toolchain pattern of doorstop→needs and likec4→mermaid
  ([ADR 0004 rev 1](0004-docs-site-sphinx-needs.md)). How the schema is *presented* is a separate
  trade from how it is *generated*, and rev 3 leaves it to #195 API explorer (split from #188
  boundary codegen), which takes the renderer choice with the interactive option on the table rather
  than inheriting a static one settled in passing here. Nothing renders the schema until it lands.

## Alternatives considered

- **OpenAPI 3.1 as the starting point** — rejected *for now* on tool maturity (`oapi-codegen` lags
  3.1); adopted as the migration target rather than dropped.
- **`openapi-typescript` (TypeScript)** — the incumbent through rev 2, and correct while the decision
  was types-only: it emits declarations and erases at compile. It emits *only* declarations, so it
  cannot carry rev 3's route table or client, and it holds a `typescript@^5.x` peer that pins the
  repository's own TypeScript version. Superseded rather than found wanting on its own terms.
- **TypeSpec → OpenAPI** — a more ergonomic authoring DSL, but it adds a Node compile hop and a
  second generation stage in the drift gate, and makes the OpenAPI itself a generated artifact. An
  authoring abstraction whose only consumer is ~5 routes — generality ahead of a second use
  ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist, generality).
- **JSON Schema only** (json-schema-to-typescript / quicktype) — models payload bodies but not
  operations, parameters, or status codes, so the request-parameter and rejection-status contract
  would live in a second definition: the exact silent-divergence defect the single-schema rule
  kills.
- **protobuf / gRPC** — a transport change disguised as a codegen choice. Browsers cannot speak gRPC
  without a gRPC-web proxy, and it replaces the REST-over-JSON proxy the design commits to — a
  transport chosen against the access pattern, which polls and needs no live channel (the pull-based
  shape [the module contract](../contracts/module-contract.md) is built against).
- **Smithy** — can emit OpenAPI, but carries a JVM toolchain and trait/projection machinery far
  beyond a five-route proxy.
- **`ogen` (Go)** — best-in-class 3.1 with generated request/response validation; kept as the
  documented fallback if 3.1 plus server-side validation are later wanted, but heavier (its own
  router, a large generated surface) than a thin proxy needs today. Rev 3's move to server
  generation does not cross that line: `oapi-codegen`'s `std-http-server` binds against the standard
  library's own `net/http.ServeMux`, where the objection to `ogen` was a router of its own. The
  concern was never *generating a server*; it was owning the routing layer. Rev 4's overlay does not
  cross it either: the server is still generated, and what is subtracted is a parameter parse rather
  than a route.
- **`openapi-generator`, as the single tool covering both languages** — rejected. It is the only
  candidate spanning Go and TypeScript, and one tool would be simpler than two, but its `go-server`
  **mandates a third-party router**: a closed `mux`|`chi` option with no standard-library choice, and
  the router type is in the exported `NewRouter` signature rather than an internal detail — so the
  routing layer this design keeps ([ADR 0001 rev 1](0001-backend-language-go.md), and the `ogen`
  entry above) would be given away by the codegen choice. Beyond the kernel objection it requires a
  JVM and a downloaded jar on every machine and in CI, which nothing else in this repo needs, and it
  emits a whole-application scaffold — the Go spread across many files, plus a `main.go` and a
  Dockerfile that assume they own the process. The magnitudes behind that are the trial's, recorded
  on #188 boundary codegen. **This is why the decision is two native generators rather than one tool**: the
  cost of a second generator is two pinned versions, and the cost of the unified tool is a dependency
  the architecture refuses.
- **Frontend runtime validation (schema→zod/ajv)** — rejected: bundle weight and per-render cost on
  a Pi-Zero browser against a version-skew case foreclosed by single-image co-deploy.

## Consequences

- **#7 becomes an implementation ticket**: the mechanism is settled; its build (schema file, wired
  generators, green drift gate) has the layout it waited for
  ([ADR 0021 rev 2](0021-repository-layout.md)).
- **Two pinned generators to keep current** — inherent to Go not sharing types (ADR 0001 rev 1 paid for
  this knowingly), tracked like any pinned tool. Rev 3 adds a third pin, `prettier`, which formats
  orval's output: unpinned it would reformat the committed contract on its own schedule and read as
  schema drift.
- **A route cannot be added by hand on either side.** Adding one means editing the schema and
  regenerating; a registration or a call written directly is either overwritten or reported as drift.
  That is the point, and it is also the cost — the schema sits on the critical path of every route
  change, not only of every payload change.
- **The schema's server interface is composed at the assembly point.** Rev 3's open question is
  answered above; what it correctly predicted is that `health.Route` stops satisfying the widened
  interface the moment a module data route exists. The generated interface is one and its two kinds
  of path are owned by different packages, so neither owner can implement the whole of it: the
  process's `main` composes the infrastructure routes' handler and the registry's into the one value
  the generated router takes. A package's own tests reach the generated router the same way, by
  standing in for the routes that are not theirs — which is what keeps another package's path out of
  their assertions.
- **The backend's runtime dependency set stays empty, and it takes the overlay to keep it that way.**
  `backend/go.mod` and `backend/go.sum` carry nothing the emitted code imports; without the overlay
  the first parameterised route adds `github.com/oapi-codegen/runtime` plus
  `github.com/apapsch/go-jsonmerge/v2` and `github.com/google/uuid` beneath it, against
  [ADR 0001 rev 1](0001-backend-language-go.md)'s "near-zero third-party dependencies" and into the
  dependency-vulnerability gate ([`../CI.md`](../CI.md)). **Reopen if a module data route ever needs
  the generated handler to read the request** — a request body to decode, a header to honour — since
  the trade is struck on a handler that delegates without looking.
- **A second file stands between the schema and the Go generator**, and that is the overlay's
  cost. Reading what this side generates means reading two files rather than one, and the drift gate
  regenerates through both — so an overlay that stopped applying is a difference the gate sees, but
  only because the generator refuses a selector that matches nothing. It is one action, and it is
  written once rather than per module.
- **The Go client's view of a module data route carries no parameters.** The overlay applies to the
  whole document, so the `client` target emits `GetApiWeather` without them. Nothing calls it — the
  Go client exists for the liveness probe ([ADR 0020 rev 2](0020-release-artifact-set-and-operator-tooling.md))
  — and a caller that tried would be refused by the entry's validator rather than answered wrongly.
  The frontend's client, generated from the schema itself, is unaffected.
- **The generated Go surface is larger than the types were.** `std-http-server` emits a parameter-error
  set and a middleware hook whether or not any route has parameters. Accepted: it is one file, it
  compiles, and it adds no dependency.
- **`orval` is small at the boundary and large in `node_modules`.** It ships undivided: installing it
  brings the whole set of `@orval/*` client generators although the configuration reaches only the
  `fetch` one, a documentation toolchain (`typedoc` and its plugins), and `esbuild` with a native
  binary package per platform — none of which the generator it replaces brought. **None of it reaches
  what ships**: the emitted client imports nothing, so the browser module graph and
  [`frontend/bundle-allowlist.json`](../../frontend/bundle-allowlist.json) are untouched, and the
  cost is build-time and supply-chain only. It is recorded because a Dependabot pull request against
  a package like `@orval/angular` is otherwise unexplainable to whoever has to weigh it: such packages
  are present because orval is one package, not because anything uses them. The size of that tree at
  any moment is `frontend/package-lock.json`'s to state, and is not counted here.
- **A generated route is method-scoped, where a hand-written one was not.** `std-http-server`
  registers `GET /healthz`, so the schema's `get:` is now load-bearing in a way it was not when the
  registration was `mux.Handle("/healthz", …)` and answered any verb. What an unlisted method gets is
  the served tree's answer rather than a 405, because the `/` seam matches the path when the
  method-scoped pattern does not — the observable is
  [`../ARCHITECTURE.md`](../ARCHITECTURE.md)'s. The general shape is that a generated pattern is more
  specific than the seams it sits beside, which is also the third strand of the open question above.
- **Hand-authored OpenAPI YAML is verbose** — accepted for ~5 payloads; the 3.1 migration and, if it
  ever bites, an authoring layer remain open.
- **The configuration schema stays a separate artifact**, TS-owned (ADR 0007 rev 2), never crossing the
  wire. When 3.1 lands, both schemas can share the JSON Schema 2020-12 dialect and whatever renders
  them — a shared *vocabulary*, not a merged schema (that would be abstraction without a second
  consumer).
- **Nothing renders the schema for a reader until #195 API explorer lands.** Rev 3 withdrew the
  renderer choice rather than replacing it, so the schema is readable as YAML and in no other form
  meanwhile.
- **ARCHITECTURE.md's "boundary contract" section** (its "open question 2") is answered by this ADR;
  the fuller prose is written when the mechanism is built, under #7 boundary-contract codegen.
- **Requirement text stays mechanism-agnostic**
  (SYS005<!-- Single-definition internal contract -->,
  SRS015<!-- One schema, all boundary value classes -->–SRS016<!-- Both sides consume the generated types -->):
  this ADR is provenance, not cited inside the "shall" statements, so a later mechanism change
  touches the ADR and the generate step, not the tree.
