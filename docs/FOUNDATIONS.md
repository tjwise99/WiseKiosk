# Foundations — WiseKiosk

The foundational specification for WiseKiosk: what it is, who it serves, the settled decisions, the
day-one architecture, what must not be built, and the test architecture. Written before any code,
and revised only when a stated premise moves.

**Standalone by intent.** Everything needed to start building is here, and nothing in this document
depends on anything outside this repository.

---

## 1. The product

### What it is

A smart-mirror display. A browser renders a fixed, config-driven set of modules into regions of a
full-screen page, running unattended on a display behind one-way glass. Data comes from a handful of
public APIs, refreshed on a slow interval.

### Who operates it

**The operator is frequently not the author.** Deployments run at the author's house and at friends'
and family's houses — separate networks, separate configs, separate owners. This is the single most
load-bearing requirement in this document.

It implies, non-negotiably:

- A bad config must fail **loudly and legibly**, never as a blank screen. On a headless kiosk with no
  keyboard, a silent failure is indistinguishable from a hardware fault.
- Configuration must be **validatable before deployment**, not only at boot.
- The failure a non-technical operator sees must state what is wrong and what to change.
- Upgrades must not require the operator to read a diff, edit code, or understand the stack.

### Deployment model

One published container image. Each deployment is independent: its own config, its own network, its
own owner. Customisation happens through configuration, never through a per-deployment fork or
branch — that is the entire reason this repository exists.

### Use cases

| Priority | Case | Implication |
|---|---|---|
| Primary | Full-screen kiosk display behind mirror glass | Fixed layout, no interaction, no routing, runs forever |
| Secondary | Loaded in a desktop browser for a quick check | Must render sensibly at desktop window sizes |
| Stretch | Viewed on a phone | Layout should not *actively break* at narrow widths — a cheap consideration, not a designed-for feature |

The stretch case earns effort only where it costs nearly nothing: relative units, a layout that
reflows rather than overlaps. **No per-client config profiles, no device detection, no responsive
design programme.** If supporting it starts requiring architecture, it has exceeded its budget.

### Modules

Five, all in scope: `clock`, `compliments`, `OpenMeteo`, `AviationWeather` (CheckWX METAR/TAF),
`DisneyWaitTimes` (themeparks.wiki).

Adding a sixth must be a **documented contract**, not a plugin system — see
[Module contract](#6-module-contract).

### Explicit non-goals

- Not a plugin host. No third-party module ecosystem, no dynamic loading, no extension points.
- Not multi-tenant. One instance serves one configuration.
- No user accounts, sessions, or authentication. LAN-only, single trusted network.
- No compatibility layer with any prior mirror framework. Nothing is inherited.

---

## 2. Settled decisions

These are settled. **Do not relitigate them** — reopen one only if the stated premise stops being
true. Where a decision carries a rejected alternative worth preserving, it graduates to an ADR in
[`decisions/`](decisions/README.md).

| Decision | Premise that would reopen it |
|---|---|
| Call upstream REST APIs directly; no heavyweight client packages | An upstream API becomes complex enough that a client library earns its dependency cost |
| Secrets resolve server-side only; a key never reaches the browser **by construction** | Never. This is structural, not a policy |
| Config is the single source of truth; **fail fast**, no defaults merge, no silent degradation | Never — and it is stronger here, since the operator may not be technical |
| CI holds no API keys; key-dependent checks run locally | A secrets manager makes key-bearing CI genuinely safe *and* something needs it |
| Frontend is Svelte 5 + Vite, a static SPA | A frontend requirement appears that Svelte serves badly |
| **No SSR, no routing, no meta-framework** — follows from a display that renders a fixed module set and never navigates | The product grows a genuine multi-page or SEO requirement (it will not) |
| **Backend is Go**, with a generated boundary contract — see [ADR 0001](decisions/0001-backend-language-go.md) | The boundary-contract codegen mechanism proves unsustainable, or the backend grows a requirement Go serves badly |

Dependency-footprint discipline generalises: **prefer the standard library and a direct HTTP call
over a package**, and treat any dependency pulling a native build toolchain as disqualified unless
nothing else will do.

**Dev tooling is siloed with the feature it serves, not dropped at the repo root.** A tool's
dependency manifest, lockfile, and virtual environment live in that feature's directory, and its
Dependabot ecosystem points there — so the requirements tool's `requirements-dev.txt` and venv sit
under [`requirements/`](requirements/README.md), not `/`. This keeps each tool's footprint legible
and removable as a unit, and stops the root filling with unrelated manifests as tooling accretes.

---

## 3. Day-one architecture

> **Confidence warning.** This section is a design hypothesis. No version of this architecture has
> been implemented or run — the reasoning is sound but unvalidated. Treat it as the strongest
> available starting point, not as settled fact, and note that estimates (such as the cache being
> "roughly fifteen lines") are projections.

### Transport: stateless REST proxy

- `GET /api/<source>?…` returns shaped JSON. Stateless.
- A **TTL response cache keyed on the query string** provides dedupe and upstream politeness. Roughly
  fifteen lines. No scheduler, no module registry, no server-side module concept.
- **All sources are proxied**, including the ones that permit CORS — keeps CSP at `connect-src
  'self'`, keeps response shaping server-side where it is testable, keeps one pattern.
- **No sockets. No plugin API.** The refresh cadence is ten to fifteen minutes; nothing needs a live
  channel. The clock renders client-side.
- Bound the proxy: validate parameters against known-good patterns (ICAO codes, a park-ID map) and
  rate-limit the routes. Expect a static-analysis rate-limiting finding.

### Config: the frontend owns it, the backend owns none

- The frontend owns `config.json` — module list, positions, display options, fetch parameters.
  Mounted on the deploy host, served statically.
- **The backend has no config file.** Bind address and port are constants, not knobs. Every plausible
  candidate for backend configuration turns out to be a constant, a test seam, or code.
- Secrets are **delivered, not configured**: `readSecret(name)` resolves `<NAME>_FILE` to a path and
  reads it, falling back to the bare `<NAME>` environment variable. This is the Docker Official
  Images convention, works with a plain bind mount, and upgrades to a real secrets manager with no
  code change.
- **No secret ever transits through config delivery**, so there is no secret-stripping step to
  maintain. A denylist would fail open; this design has nothing to forget.
- The backend **schema-validates the config at boot and serves it verbatim** — validating without
  owning. This is what preserves fail-fast, and it is the only config the backend touches.

### Deployment

Container image published to a registry. Config bind-mounted. Secret supplied by `_FILE` path or
environment variable. Healthcheck on a fixed port. Restart policy `unless-stopped`.

**Note:** source-IP-based access control (`ipWhitelist` and the like) is worthless behind container
NAT — the gateway masquerades every client to the same address. Do not introduce it. Security on the
LAN comes from network boundaries, not from the application.

---

## 4. Backend language — resolved (Go)

Recorded as [ADR 0001](decisions/0001-backend-language-go.md). Go was chosen with the full field
considered — TypeScript on Node, Deno, and Rust were all weighed — because the backend is a thin
stateless REST proxy (route handlers, an HTTP client, response shaping, a TTL cache, schema
validation, static file serving; a few hundred lines with no exotic requirements) where the deciding
axis is learning value. Go delivers that, plus the smallest deploy: a static binary on
`scratch`/distroless, near-zero third-party dependencies, `net/http` a direct fit for a REST proxy.

The one real cost, and the reason this is a deliberate decision rather than a default:

> **Go does not share types with the Svelte/TypeScript frontend.** A value that must agree on both
> sides of the frontend/backend boundary, with no shared definition and nothing enforcing agreement,
> is the single worst defect class this design guards against — it fails silently, and is untestable
> by construction.

Therefore, non-negotiably: **the boundary contract must have exactly one definition and a mechanism
that regenerates both sides from it** — an OpenAPI schema with client generation, or equivalent.
This is an up-front cost that must be paid **before the second module exists**, not retrofitted.
Under a shared-TypeScript backend it would be nearly free; under Go it is real and deliberate.
Choosing Go without this mechanism is not on the table.

Because the backend ships as a single static binary, there is no runtime image and no
lockfile/toolchain split to manage on the backend side at all.

---

## 5. What must not be built

Each of these is generality or machinery bought against a case that does not exist. **If something
exists to support a case that does not exist yet, it should not exist yet.**

| Anti-pattern | What it looks like |
|---|---|
| **A plugin system with no plugins** | A helper API, per-module event namespaces, a catch-all event relay, static-file serving for module `public/` directories — machinery for third-party modules that will never exist |
| **Abstraction without a second consumer** | Extension points with one implementation. Generality bought against a future that never arrives — and everything downstream must accommodate it |
| **A transport chosen before the access pattern** | A bidirectional live channel for data refreshed every 10–15 minutes. The refresh is frontend-driven, so a server-push channel serves nothing here but a clock tick, which belongs client-side |
| **Cross-boundary invariants enforced by comments** | The same value computed independently on both sides, agreement guaranteed by a comment pointing at its twin. Silent failure on divergence — this is exactly why the boundary contract is generated (§4) |
| **Secret handling by denylist** | A list of keys to strip before delivery. Fails open the moment a secret is added and the list is not |
| **Config keys that are not operator-tunable** | A `port` that breaks the healthcheck if changed, an `address` that must always be `0.0.0.0`, `language`/`locale`/`basePath` keys never read. If turning it breaks the deployment, it is a constant |
| **Security controls that do not function where deployed** | `ipWhitelist` behind container NAT — plausible, documented, and inert for its entire life |
| **Production architecture serving a test requirement** | A backend-driven clock that exists only to exercise a transport |

---

## 6. Module contract

Room to grow, without a plugin system. A **contract** is documentation an author follows; a **plugin
system** is runtime machinery that must be maintained, typed around, and eventually deleted.

A module is:

1. **A shaping library** — builds the upstream URL, parses and reshapes the response into the payload
   the frontend renders. Pure functions, no I/O, unit-tested directly. In Go, a package of pure
   functions. *This is the valuable part.*
2. **A route registration** — one entry binding `/api/<source>` to that library, with its parameter
   validation and cache TTL. A static list, resolved at compile time. Not a registry, not discovery,
   not dynamic loading.
3. **A Svelte component** — renders the payload. Receives its config as props. The payload type it
   consumes is **generated from the boundary schema**, never hand-declared (§4).
4. **A config schema fragment** — what this module accepts, validated at boot and by the standalone
   validator.
5. **Tests** — the specific obligations in [`TESTING.md`](TESTING.md), not "some tests."

Adding a module means adding five things in five known places. Adding a module must **never** mean
changing the framework.

---

## 7. Test architecture

Specified up front, because a test suite left to accumulate becomes permanent architecture nobody
reviews. The full specification is [`TESTING.md`](TESTING.md); this section is its summary and the
obligations it exists to enforce.

**Tiers:** Unit (shaping libraries transform known upstream responses into correct payloads),
Boundary (frontend and backend agree on every payload shape and parameter name), Integration (routes
serve, the cache honours its TTL, validation rejects bad input), Render (each module renders its
payload; the page assembles with a known config), Contract (upstream APIs still return what the
shaping libraries expect — run locally/scheduled, since CI holds no keys).

**Standing obligations:**

- **Every value crossing the frontend/backend boundary is generated from one definition or covered by
  an agreement test.** Under the Go decision (§4) this means *generated*. If a value can be neither
  generated nor agreement-tested, that is a finding about the architecture.
- **Every module supplies unit tests for its shaping library and a render test for its component.**
- **Every config schema rejects at least one realistic malformed input in a test** — the operator is
  not the author, so validation failing correctly is a product feature.
- **Repo-wide checks live at repo level**, not inside whichever package happened to have a test
  runner first.
- **Every test file is wired into CI.** A test that has never run is worse than no test — it is a
  false signal.

Coverage is **diagnostic, never evidence.** Report it, read it to find untested areas, and gate on
the obligations above — which name what must be *proven*. Reviewed whenever a module is added and
whenever the transport changes; scheduled, because tests resist deletion and the review will not
arise naturally.

---

## 8. Operator tooling

Scoped to a **config generator and a validator**. A graphical config editor is a plausible future
and should not be foreclosed, but it is not designed for now.

| Tool | Requirement |
|---|---|
| **Config schema** | One machine-readable definition — the source for boot validation, the standalone validator, the generator, and any future editor. Exactly one definition, the same single-definition rule the boundary contract follows |
| **Validator** | Runs standalone against a config file, before deployment, without starting the app. Reports errors in operator language: what is wrong, where, and what to change. Exits non-zero |
| **Generator** | Produces a valid starting config — prompted or from a template. The operator should never begin from a blank file or by copying an example and editing blind |

Both are exercised in CI against known-good and known-bad configs. The validator failing to reject a
malformed config is a product bug, not a testing gap.

Because the schema is a single machine-readable artifact, a graphical editor can be added over it
later without redesign. That is the only concession made to it now.

---

## 9. Open questions

To close before or during early implementation. Recorded so they are decided rather than defaulted.

| # | Question | Status / notes |
|---|---|---|
| 1 | Backend language | **Closed: Go** ([ADR 0001](decisions/0001-backend-language-go.md)) |
| 2 | **Boundary-contract mechanism** | **Closed: OpenAPI schema → generated Go + TS types** ([ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md)); 3.0.3 now, 3.1 later. **Must be built before the second module** (#7, after #5) |
| 3 | Cache TTLs and rate-limit thresholds | Choose once, hardcode, document the reasoning |
| 4 | Config schema format | Drives boot validation, the validator, the generator, and a future editor. Pick for tooling ecosystem, not elegance |
| 5 | Module set | **Closed: all five** (clock, compliments, OpenMeteo, AviationWeather, DisneyWaitTimes) |
| 6 | Liveness canary under REST | The equivalent of a socket canary is a cache-behaviour test — cheaper, but it must be written |

---

## 10. Order of work

1. **Decide the backend language** — done: Go, [ADR 0001](decisions/0001-backend-language-go.md).
2. **Write the requirements, settled decisions, and day-one architecture** (this document) as the
   first commit, before code — done.
3. **Write the test architecture** ([`TESTING.md`](TESTING.md)) as a specification, before tests
   exist.
4. **Set up invariant gates immediately** — lint, container scanning, static analysis, secret-free
   CI, line endings, image signing. These outlive every rewrite and are the mechanised reviewer.
5. **Establish the boundary-contract codegen mechanism** — chosen in
   [ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md); build it (#7, after #5) before
   the second module exists.
6. **Then build**, in slices sized by what can actually be reviewed — not by milestone. A slice that
   cannot be read has not been reviewed, and it will carry defects past every later pass.
