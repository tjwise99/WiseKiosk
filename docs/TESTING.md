# Test architecture

A **specification**, not a description. It is written before the tests exist, so it says what tests
must *prove* — not what some accumulated suite happens to do. A strategy written first is
enforceable; one reverse-engineered from existing tests only ratifies whatever accumulated.

It is reviewed on a schedule (see [Review cadence](#review-cadence)), because tests resist deletion
more strongly than code does and the review will not arise on its own.

---

## Tiers

Each tier states what it **guarantees** and when it runs.

| Tier | Guarantees | Specified by | Runs |
|---|---|---|---|
| **Unit** | Shaping libraries transform known upstream responses into correct payloads. Pure, fast, no network | [module contract](contracts/module-contract.md), part 1 | Every commit, in CI |
| **Boundary** | The frontend and backend agree on every value that crosses: parameter names *and types*, success payloads, the structured upstream-failure body, the client-error rejection body, and every status code the frontend discriminates on | SYS005 / SRS015 | Every commit, in CI |
| **Integration** | Routes serve; the TTL cache honours its TTL; parameter validation rejects bad input; config validation fails loudly on bad config | SRS009 / SRS011 / SRS012 / SRS002 | Every commit, in CI |
| **Render** | Each module renders from its props; the page assembles with a known-good config | [module contract](contracts/module-contract.md), part 3 / SRS017 | Every commit, in CI |
| **Contract** | Upstream APIs still return what the shaping libraries expect | — | **Open — see below** |

The Boundary row enumerates the value classes deliberately: "payload shape and parameter name" reads
narrower than SRS015, and an error body or a status code left out of the schema is exactly the value
that crosses unproven.

### Open: where the Contract tier runs, and how it reaches upstream

**This is the tier's designer's decision to make, and it is not made.** The requirement that used to
settle it forbade any CI workflow from holding an upstream credential, which forced the tier out of
CI and into a nested module outside the parent's test discovery. That requirement is withdrawn: it
banned a normal practice, and the mechanism it forced is one [ADR
0010](decisions/0010-runtime-materialised-gate-fixtures.md) independently found leaky — *"a nested
module looked like the escape and is not one."*

What the tier must prove is unchanged and stated only here: **an upstream API still returns what the
shaping library expects.**

**The real constraints, which are not about secret safety:**

- **One source needs a credential.** OpenMeteo and themeparks.wiki are keyless; only CheckWX is not.
  A design that solves the general case is solving a case of one.
- **Usage cost.** A tier hitting live upstreams on every pull request burns quota against a rate
  limit nobody is watching.
- **Flakiness.** A check that fails when someone else's API has a bad afternoon trains an author to
  ignore red, which is worse than not having the check.

**Three shapes, none chosen:**

1. **Recorded fixtures replayed in CI** — capture each upstream's response, assert the shaping
   library against it. No credential anywhere, runs on every commit like every other tier. Cost: a
   fixture is a snapshot, so it detects drift only when someone re-records.
2. **An encrypted CI secret, scoped to one workflow** — the tier runs in CI against the live API.
   Costs quota and inherits upstream availability.
3. **A scheduled run outside the pull-request gate** — live, credentialed, and off the merge path, so
   an upstream outage fails a nightly rather than a change.

1 and 3 compose: fixtures gate every change, a scheduled live run detects the drift fixtures cannot.

Whoever designs the test plans decides this and records it here.

---

## The Boundary tier is generated, not hand-written

The backend is Go and the frontend is TypeScript, so they share no types
([ADR 0001](decisions/0001-backend-language-go.md)). The Boundary tier therefore is not a pair of
hand-maintained type declarations checked for agreement by a test — it is **one schema, with both
sides generated from it**. The tier's job in CI is to prove the generation is real and current:

- Generation from the one schema by the codegen mechanism
  ([ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md)), the CI drift gate that fails on
  committed output differing from a fresh regeneration, and version-pinning of the generators so
  regeneration is deterministic. Generation from one schema is **SRS015** and the drift gate is
  verified under **SRS016**; the version pin itself is no requirement's — it is a repository
  convention, in [`CI.md § Publishing and provenance`](CI.md#publishing-and-provenance).
- That the generated types are the ones actually *used* on both sides, including the per-module
  error-render path, rather than shadowed by a hand-declared twin — **SRS016**, under **SYS005**.
- That the frontend adds no second, runtime validator over proxied payloads, so agreement rests on
  the schema and the drift gate rather than a bundled re-check —
  [ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md). No requirement states this: it was
  deleted as a prohibition against a case that does not exist, and the ADR carries the decision and
  the premise it rests on.

A value that must agree across the boundary but can be *neither* generated from the schema *nor* proven
to agree by a test is **a finding about the architecture**, not something to paper over with a comment.
This tier exists specifically to make that impossible.

---

## Standing obligations

Gate on these — they name what must be proven. Not on a coverage number. Each is stated here in the
short form a test author needs, and cited to whatever governs it: an item in the
[requirements tree](requirements/README.md) where the obligation is on the running software, and the
module contract or [`../tools/README.md`](../tools/README.md) where it is not
([ADR 0011](decisions/0011-requirement-or-convention.md)). What every one has is a home that can be
checked against, rather than prose alone.

- **Every value crossing the frontend/backend boundary is generated from one definition**
  → SYS005 / SRS015 / SRS016, and
  [above](#the-boundary-tier-is-generated-not-hand-written).
- **Every module supplies a render test for its component, and — where it registers against an
  external source — unit tests for its shaping library.** A module with no registration entry is a
  local module and is not expected to have one. A module missing either is an incomplete module, not
  a passing one. That the files exist and sit where the runner reaches them is gated by
  [`CI.md § Module and framework structure`](CI.md#module-and-framework-structure); what they must
  cover is stated here. The module contract lists tests as part 6 of what a module supplies and
  defers to this section for what they prove.
- **Every config schema rejects a realistic malformed input, in a test** → SRS002 (a config error
  isolatable to one module is reported there and never silently worked around) and SRS005 (the
  schema's rules are enforced by one implementation, so an unknown key is rejected and named). The
  operator is not the author, so validation failing correctly and legibly is a product feature, and
  it is tested as one.
- **The standalone validator is exercised against known-good and known-bad configs** →
  [`../tools/README.md`](../tools/README.md), run in CI. The validator failing to reject a malformed
  config is a tooling bug, not a testing gap.
- **Repo-wide checks live at repo level** — see [Where a check belongs](#where-a-check-belongs),
  below.
- **A verification item's fit against its parent is re-read when the item is activated.** Every `TST`
  item is `active: false` until the code it checks exists, and Doorstop skips inactive items
  entirely — so the suspect-link mechanism, which is what normally flags a check whose parent's text
  moved beneath it, is inert across the whole tier. Activation is the one moment the fit is looked
  at, and it is a human read: does this check still assert a clause its parent still states? Nothing
  mechanical will ask.
- **Every test and check in the repository is executed by CI** — the whole-tree discovery and
  verify/CI parity gates are [`CI.md`](CI.md)'s (§ Gate wiring), not the tree's. A test no runner
  reaches is a false signal, so a new test is wired in by its location alone.

---

## On coverage

Coverage is **diagnostic, never evidence.** A line can be fully covered while the invariant that
matters — that two things agree, that a control functions where deployed — is untested by
construction. A high number buys confidence it has not earned.

Report coverage. Read it to find untested areas. Gate on the standing obligations above. No gate
fails a merge on a coverage percentage treated as a quality threshold; the coverage gate, where one
exists, fails only on uncovered source that is neither exempted nor justified — coverage as
traceability closure, gate 3 of [ADR 0005](decisions/0005-traceability-gating.md), never as a chosen
quality bar.

---

## Where a check belongs

Put a check at the altitude it is true at:

- **Repo-wide** (spans both packages, or is about the repo as a whole) → the repo-level verification
  target, `just verify`, mirrored in CI. Not a test target: most of what belongs here — link and
  line-ending hygiene, tree integrity, lint, build — is a check, not a test.
- **Package mechanics** (how *this* package's own logic behaves) → that package's own tests.
- **A module's shaping/rendering** → with that module.

A check placed by convenience — "here, because a test runner already existed" — instead of by altitude
is a defect in the suite's architecture, not a neutral choice.

---

## Review cadence

The test architecture is reviewed **whenever a module is added** and **whenever the boundary
transport** (the OpenAPI schema / codegen mechanism, [ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md))
**changes**. This is scheduled deliberately: removing or reshaping a test feels like a regression even
when the test proves nothing, so without a scheduled review the suite silently becomes permanent
architecture nobody revisits. Code gets that review by default; tests must be given it explicitly.
The module-add trigger's other half is the [module contract](contracts/module-contract.md), which
carries a resolving link back to this section (see [Adding a module, step
8](contracts/module-contract.md#adding-a-module)).
