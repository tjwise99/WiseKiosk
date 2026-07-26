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
| **Unit** | Shaping libraries transform known upstream responses into correct payloads. Pure, fast, no network | SRS033 | Every commit, in CI |
| **Boundary** | The frontend and backend agree on every value that crosses: parameter names *and types*, success payloads, the structured upstream-failure body, the client-error rejection body, and every status code the frontend discriminates on | SYS007 / SRS029 | Every commit, in CI |
| **Integration** | Routes serve; the TTL cache honours its TTL; parameter validation rejects bad input; config validation fails loudly on bad config | SRS020 / SRS022 / SRS023 / SRS005 | Every commit, in CI |
| **Render** | Each module renders from its props; the page assembles with a known-good config | SRS040 / SRS041 | Every commit, in CI |
| **Contract** | Upstream APIs still return what the shaping libraries expect | — (placement: SYS003 / SRS019) | Locally, outside CI — needs real keys, and CI holds none |

The Boundary row enumerates the value classes deliberately: "payload shape and parameter name" reads
narrower than SRS029, and an error body or a status code left out of the schema is exactly the value
that crosses unproven.

The **Contract** tier runs outside CI **entirely** — not merely outside the PR gate. No CI workflow
holds an upstream credential and no CI job runs a check that needs one, so a check needing a live
upstream runs locally, on a developer machine. There is no scheduled credentialed run.
→ SYS003 / SRS019.

It lives in a **nested module**, outside the parent module's test discovery. That placement is what
lets both obligations hold at once: whole-tree discovery reaches every committed test (SRS068), and
a credentialed check never runs in CI (SRS019). A build tag or a skip would satisfy the second by
breaking the first, which is why the boundary is the module and not a list of exclusions.

The Contract tier is the one tier whose *content* no requirement states; SRS019 governs only where it
runs, and defines the tier by reference to this document. What it must prove therefore lives here and
nowhere else.

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
  error-render path, rather than shadowed by a hand-declared twin — **SRS031**, under **SYS007**.
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
  → SYS007 / SRS029 / SRS030 / SRS031 / SRS032, and
  [above](#the-boundary-tier-is-generated-not-hand-written).
- **Every module supplies a render test for its component, and — where it fetches an upstream — unit tests for its shaping library**
  → SRS037. A module missing either is an incomplete module, not a passing one.
- **Every config schema rejects a realistic malformed input, in a test** → SRS005 (a failing config
  is never applied, in whole or in part) and SRS007 (an unknown key is rejected and named). The
  operator is not the author, so validation failing correctly and legibly is a product feature, and
  it is tested as one.
- **The standalone validator is exercised against known-good and known-bad configs** → SRS008, run
  in CI under SYS010. The validator failing to reject a malformed config is a product bug, not a
  testing gap.
- **Repo-wide checks live at repo level** → SYS010 / SRS069.
- **Every test and check in the repository is executed by CI** → SYS010, decomposed into SRS067
  (every `just verify` check runs in CI and the reverse) and SRS068 (runners are invoked in their
  whole-tree discovery form — `go test ./...`, the frontend runner's default glob — with no
  hand-maintained file list and no skip or build tag silencing a committed test). A test no runner
  reaches is a false signal, so a new test is wired in by its location alone.

---

## On coverage

Coverage is **diagnostic, never evidence.** A line can be fully covered while the invariant that
matters — that two things agree, that a control functions where deployed — is untested by
construction. A high number buys confidence it has not earned.

Report coverage. Read it to find untested areas. Gate on the standing obligations above. What a gate
may and may not assert is specified by SRS070: no gate fails a merge on a coverage percentage treated
as a quality threshold, and the coverage gate, where one exists, fails only on uncovered source that
is neither exempted nor justified — coverage as traceability closure, gate 3 of
[ADR 0005](decisions/0005-traceability-gating.md), never as a chosen quality bar.
→ SYS010 / SRS070.

---

## Where a check belongs

Put a check at the altitude it is true at:

- **Repo-wide** (spans both packages, or is about the repo as a whole) → the repo-level verification
  target, `just verify`, mirrored in CI. Not a test target: most of what belongs here — link and
  line-ending hygiene, tree integrity, lint, build — is a check, not a test.
- **Package mechanics** (how *this* package's own logic behaves) → that package's own tests.
- **A module's shaping/rendering** → with that module.

A check placed by convenience — "here, because a test runner already existed" — instead of by altitude
is a defect in the suite's architecture, not a neutral choice. → SYS010 / SRS069.

---

## Review cadence

The test architecture is reviewed **whenever a module is added** and **whenever the boundary
transport** (the OpenAPI schema / codegen mechanism, [ADR 0008](decisions/0008-boundary-contract-openapi-codegen.md))
**changes**. This is scheduled deliberately: removing or reshaping a test feels like a regression even
when the test proves nothing, so without a scheduled review the suite silently becomes permanent
architecture nobody revisits. Code gets that review by default; tests must be given it explicitly.
The module-add trigger's other half is the [module contract](contracts/module-contract.md), which
SRS071 requires to cross-link back to this review once that procedure is authored.
→ SYS010 / SRS071.
