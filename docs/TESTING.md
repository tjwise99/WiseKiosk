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
| **Boundary** | The frontend and backend agree on every value that crosses: parameter names *and types*, success payloads, the structured upstream-failure body, the client-error rejection body, and every status code the frontend discriminates on | SYS006 / SRS023 | Every commit, in CI |
| **Integration** | Routes serve; the TTL cache honours its TTL; parameter validation rejects bad input; config validation fails loudly on bad config | SRS018 / SRS020 / SRS021 / SRS002 | Every commit, in CI |
| **Render** | Each module renders from its props; the page assembles with a known-good config | [module contract](contracts/module-contract.md), part 3 / SRS006 | Every commit, in CI |
| **Contract** | Upstream APIs still return what the shaping libraries expect | — | **Open — see below** |

The Boundary row enumerates the value classes deliberately: "payload shape and parameter name" reads
narrower than SRS023, and an error body or a status code left out of the schema is exactly the value
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
  regeneration is deterministic — all specified by **SRS030**.
- That the generated types are the ones actually *used* on both sides, including the per-module
  error-render path, rather than shadowed by a hand-declared twin — **SRS024**, under **SYS006**.
- That the frontend adds no second, runtime validator over proxied payloads, so agreement rests on
  the schema and the drift gate rather than a bundled re-check — **SRS032**.

A value that must agree across the boundary but can be *neither* generated from the schema *nor* proven
to agree by a test is **a finding about the architecture**, not something to paper over with a comment.
This tier exists specifically to make that impossible.

---

## Standing obligations

Gate on these — they name what must be proven. Not on a coverage number. Every one is carried as an
identified requirement in the [requirements tree](requirements/README.md), which is the
specification; each is stated here in the short form a test author needs and cited to the item that
governs it, so the obligation and its verification item stay traceable and CI-checked rather than
prose alone.

- **Every value crossing the frontend/backend boundary is generated from one definition**
  → SYS006 / SRS023 / SRS030 / SRS024 / SRS032, and
  [above](#the-boundary-tier-is-generated-not-hand-written).
- **Every module supplies a render test for its component, and — where it fetches an upstream — unit tests for its shaping library**
  → [the module contract](contracts/module-contract.md), part 6. A module missing either is an
  incomplete module, not a passing one.
- **Every config schema rejects a realistic malformed input, in a test** → SRS002 (a failing config
  is never applied, in whole or in part) and SRS007 (an unknown key is rejected and named). The
  operator is not the author, so validation failing correctly and legibly is a product feature, and
  it is tested as one.
- **The standalone validator is exercised against known-good and known-bad configs** → SRS015, run
  in CI. The validator failing to reject a malformed config is a product bug, not a testing gap.
- **Repo-wide checks live at repo level** — see [Where a check belongs](#where-a-check-belongs),
  below.
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
