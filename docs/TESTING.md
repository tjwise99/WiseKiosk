# Test architecture

A **specification**, not a description. It is written before the tests exist, so it says what tests
must *prove* — not what some accumulated suite happens to do. A strategy written first is
enforceable; one reverse-engineered from existing tests only ratifies whatever accumulated.

It is reviewed on a schedule (see [Review cadence](#review-cadence)), because tests resist deletion
more strongly than code does and the review will not arise on its own.

---

## Tiers

Each tier states what it **guarantees** and when it runs.

| Tier | Guarantees | Runs |
|---|---|---|
| **Unit** | Shaping libraries transform known upstream responses into correct payloads. Pure, fast, no network | Every commit, in CI |
| **Boundary** | The frontend and backend agree on every payload shape and every parameter name | Every commit, in CI |
| **Integration** | Routes serve; the TTL cache honours its TTL; parameter validation rejects bad input; config validation fails loudly on bad config | Every commit, in CI |
| **Render** | Each module renders its payload; the page assembles with a known-good config | Every commit, in CI |
| **Contract** | Upstream APIs still return what the shaping libraries expect | Locally / scheduled — needs real keys, and CI holds none |

The **Contract** tier is deliberately outside CI: CI holds no API keys, so any check that needs a live
upstream runs locally or on a scheduled runner with credentials, never in the PR gate.

---

## The Boundary tier is generated, not hand-written

The backend is Go and the frontend is TypeScript, so they share no types
([ADR 0001](decisions/0001-backend-language-go.md)). The Boundary tier therefore is not a pair of
hand-maintained type declarations checked for agreement by a test — it is **one schema, with both
sides generated from it**. The tier's job in CI is to prove the generation is real and current:

- Both sides are generated from the single schema by the codegen mechanism
  ([ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md)).
- **CI regenerates and fails if the committed generated code differs from the schema** — a stale or
  hand-edited generated file is a build failure, not a silent drift.
- No payload type and no parameter name is hand-declared on either side.

A value that must agree across the boundary but can be *neither* generated from the schema *nor* proven
to agree by a test is **a finding about the architecture**, not something to paper over with a comment.
This tier exists specifically to make that impossible.

---

## Standing obligations

Gate on these — they name what must be proven. Not on a coverage number. Each obligation is carried
as an identified requirement in the [Doorstop tree](requirements/README.md) as the requirements
rewrite reaches its domain, so obligation and verification item are traceable and CI-checked, not
only prose here.

- **Every value crossing the frontend/backend boundary is generated from one definition** (see above).
- **Every module supplies unit tests for its shaping library and a render test for its component.**
- **Every config schema rejects at least one realistic malformed input, in a test.** The operator is
  not the author, so validation failing correctly and legibly is a product feature, and it is tested
  as one.
- **The standalone validator is exercised in CI against known-good and known-bad configs.** The
  validator failing to reject a malformed config is a product bug, not a testing gap.
- **Repo-wide checks live at repo level**, not inside whichever package happened to have a test runner
  first.
- **Every test file is wired into CI.** A test that has never run is worse than no test — it is a false
  signal.

---

## On coverage

Coverage is **diagnostic, never evidence.** A line can be fully covered while the invariant that
matters — that two things agree, that a control functions where deployed — is untested by
construction. A high number buys confidence it has not earned.

Report coverage. Read it to find untested areas. **Do not gate on a number, and do not treat a high
number as safety.** Gate on the standing obligations above.

---

## Where a check belongs

Put a check at the altitude it is true at:

- **Repo-wide** (spans both packages, or is about the repo as a whole) → a repo-level test target.
- **Package mechanics** (how *this* package's own logic behaves) → that package's own tests.
- **A module's shaping/rendering** → with that module.

A check placed by convenience — "here, because a test runner already existed" — instead of by altitude
is a defect in the suite's architecture, not a neutral choice.

---

## Review cadence

The test architecture is reviewed **whenever a module is added** and **whenever the transport
changes**. This is scheduled deliberately: removing or reshaping a test feels like a regression even
when the test proves nothing, so without a scheduled review the suite silently becomes permanent
architecture nobody revisits. Code gets that review by default; tests must be given it explicitly.
