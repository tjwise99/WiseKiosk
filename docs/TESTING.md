# Test architecture

A **specification**, not a description. It is written before the tests exist, so it says what tests
must *prove* — not what some accumulated suite happens to do. A strategy written first is
enforceable; one reverse-engineered from existing tests only ratifies whatever accumulated. It is
reviewed on a schedule (see [Review cadence](#review-cadence)).

---

## Tiers

Each tier states what it **guarantees** and when it runs.

| Tier | Guarantees | Specified by | Runs |
|---|---|---|---|
| **Unit** | Shaping libraries transform known upstream responses into correct payloads. Pure, fast, no network | [module contract](contracts/module-contract.md), part 1 | Every commit, in CI |
| **Boundary** | The frontend and backend agree on every value that crosses: parameter names *and types*, success payloads, the structured upstream-failure body, the client-error rejection body, and every status code the frontend discriminates on | SYS005<!-- Single-definition internal contract --> / SRS015<!-- One schema, all boundary value classes --> | Every commit, in CI |
| **Integration** | Routes serve; the TTL cache honours its TTL; parameter validation rejects bad input; config validation fails loudly on bad config | SRS009<!-- Every source reachable through the backend, statelessly --> / SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable --> / SRS012<!-- Request parameters validated against known-good per-source patterns --> / SRS002<!-- A module-scoped configuration error is reported at that module --> | Every commit, in CI |
| **Render** | Each module renders from its props; the page assembles with a known-good config; and the assembled page is read for the values a viewer depends on: which region each module landed in, emission, type scale, region geometry, the configured edge band, reflow, and overflow | [module contract](contracts/module-contract.md), part 3 / SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths --> / SRS031<!-- Content too large for its region overflows --> / SRS030<!-- Only content is rendered above the emission ceiling --> / SRS032<!-- Readable text is carried at full emission --> / SRS033<!-- Text holds a minimum size against the display, at every resolution --> / SRS034<!-- The laid-out regions keep clear of the display edge --> / SRS035<!-- The masked edge band is the deployment's to declare --> | Every commit, in CI |
| **Contract** | Upstream APIs still return what the shaping libraries expect | this document | Fixtures every commit, in CI; a live run on a schedule, off the merge path |

The Boundary row enumerates the value classes deliberately: "payload shape and parameter name" reads
narrower than SRS015<!-- One schema, all boundary value classes -->, and an error body or a status
code left out of the schema is exactly the value that crosses unproven.

### Where the Contract tier runs, and how it reaches upstream

**Decided 2026-07-28 by the owner: shapes 1 and 3, composed.** Recorded here because this is the
tier designer's decision and this document is where tier strategy lives. What the tier must prove is
unchanged: **an upstream API still returns what the shaping library expects.**

- **Recorded fixtures, replayed in CI, on every commit.** Each upstream's response is captured and
  the shaping library asserted against it. No credential anywhere, and it gates every change like
  every other tier. Its limit is inherent: a fixture is a snapshot, so it detects drift only when
  someone re-records.
- **A scheduled live run, off the pull-request gate.** Credentialed, against the real APIs. This is
  what catches the drift fixtures cannot — and because it is off the merge path, an upstream having
  a bad afternoon fails a nightly rather than somebody's change.

They compose deliberately, and neither alone is sufficient: fixtures decide merges, and the
scheduled run decides whether the fixtures still describe reality.

**Rejected: an encrypted CI secret scoped to one workflow, running live on every pull request.** It
costs quota against a rate limit nobody watches, and it inherits upstream availability on the merge
path, which trains an author to ignore red. Few upstream sources need a credential at all — which
ones is the [module roster](../README.md)'s and each module's registration entry — so this would have
been a general solution to a narrow case. Confining the credentialed job to the schedule, off the merge
path, is the narrower answer to the nested module
[ADR 0010 rev 1](decisions/0010-runtime-materialised-gate-fixtures.md) found leaky.

**Decided 2026-07-28 by the owner: no requirement.** Nothing WiseKiosk does can violate "an upstream
still returns what we expect" — that obligation is on somebody else's API. The half that *is* ours,
what the product does when an upstream returns what the shaping library did not expect, is already
**SRS001<!-- A failed module shows why, and only that module -->**, whose
`TST001`<!-- Pending: upstream-failure error payload test --> names malformed payload as a failure
class, so a tree item here would restate it. What is left is machinery — recording a fixture is a
procedure an author follows, a scheduled credentialed job is a repository-facing check — so both sit
in [`CI.md § Upstream contract checks`](CI.md#upstream-contract-checks)
([ADR 0011 rev 1](decisions/0011-requirement-or-convention.md)).

---

## The Boundary tier is generated, not hand-written

The backend is Go and the frontend is TypeScript, so they share no types
([ADR 0001 rev 1](decisions/0001-backend-language-go.md)). The tier is therefore not a pair of
hand-maintained type declarations checked for agreement by a test — it is **one schema, with both
sides generated from it**, and the tier's job in CI is to prove the generation is real and current:

- Generation from the one schema by the codegen mechanism
  ([ADR 0008 rev 2](decisions/0008-boundary-contract-openapi-codegen.md)), the CI drift gate failing
  on committed output that differs from a fresh regeneration, and version-pinned generators so
  regeneration is deterministic. Generation is
  **SRS015<!-- One schema, all boundary value classes -->**, the drift gate is verified under
  **SRS016<!-- Both sides consume the generated types -->**, and the version pin is no requirement's
  — a repository convention, in [`CI.md § Publishing and
  provenance`](CI.md#publishing-and-provenance).
- That the generated types are the ones actually *used* on both sides, including the per-module
  error-render path, rather than shadowed by a hand-declared twin —
  **SRS016<!-- Both sides consume the generated types -->**, under
  **SYS005<!-- Single-definition internal contract -->**.
- That the frontend adds no second, runtime validator over proxied payloads, so agreement rests on
  the schema and the drift gate rather than a bundled re-check —
  [ADR 0008 rev 2](decisions/0008-boundary-contract-openapi-codegen.md), which carries the decision
  and its premise. No requirement states this: it was deleted as a prohibition against a case that
  does not exist.

A value that must agree across the boundary but can be *neither* generated from the schema *nor*
proven to agree by a test is **a finding about the architecture**, not something to paper over with
a comment.

---

## Standing obligations

Gate on these — they name what must be proven. Not on a coverage number. Each is stated in the short
form a test author needs and cited to whatever governs it: the [requirements
tree](requirements/README.md) where the obligation is on the running software, the module contract
or [`DEPLOYMENT.md`](DEPLOYMENT.md) where it is not
([ADR 0011 rev 1](decisions/0011-requirement-or-convention.md)).

- **Every value crossing the frontend/backend boundary is generated from one definition** →
  SYS005<!-- Single-definition internal contract --> /
  SRS015<!-- One schema, all boundary value classes --> /
  SRS016<!-- Both sides consume the generated types -->, and
  [above](#the-boundary-tier-is-generated-not-hand-written).
- **Every module supplies a render test for its component, and — where it registers against an
  external source — unit tests for its shaping library.** A module with no registration entry is a
  local module and is not expected to have one. A module missing either is an incomplete module, not
  a passing one. What they must cover is stated here; that the files exist and sit where the runner
  reaches them is gated by [`CI.md § Module and framework
  structure`](CI.md#module-and-framework-structure).
- **Every config schema rejects a realistic malformed input, in a test** →
  SRS002<!-- A module-scoped configuration error is reported at that module -->. The operator is not
  the author, so validation failing correctly and legibly is a product feature and is tested as one.
- **Repo-wide checks live at repo level** — see [Where a check belongs](#where-a-check-belongs).
- **A verification item's fit against its parent is re-read when the item is activated.** Every
  `TST` item is `active: false` until the code it checks exists, and Doorstop skips inactive items
  entirely, so the suspect-link mechanism that normally flags a check whose parent moved beneath it
  is inert across the whole tier. `check-suspect-links.py` restores that one signal
  ([`requirements/README.md § Running the gate`](requirements/README.md#running-the-gate)): a parent
  rewritten under a pending check fails a gate in the commit that rewrites it. What it cannot decide
  is the question activation exists to ask, and that stays a human read — does this check still
  assert a clause its parent still states?
- **Every test and check in the repository is executed by CI** — the whole-tree discovery and
  verify/CI wiring gates are [`CI.md § Gate wiring`](CI.md#gate-wiring)'s, not the tree's. A test no
  runner reaches is a false signal, so a new test is wired in by its location alone.

---

## On coverage

Coverage is **diagnostic, never evidence.** A line can be fully covered while the invariant that
matters — that two things agree, that a control functions where deployed — is untested by
construction, so a high number buys confidence it has not earned.

Report it, read it to find untested areas, and gate on the standing obligations above. No gate fails
a merge on a coverage percentage treated as a quality threshold; the coverage gate, where one
exists, fails only on uncovered source that is neither exempted nor justified — coverage as
traceability closure, gate 3 of [ADR 0005 rev 1](decisions/0005-traceability-gating.md), never as a
chosen quality bar.

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
transport** (the OpenAPI schema / codegen mechanism,
[ADR 0008 rev 2](decisions/0008-boundary-contract-openapi-codegen.md)) **changes**. This is
scheduled deliberately: removing or reshaping a test feels like a regression even when the test
proves nothing, so without a scheduled review the suite silently becomes permanent architecture
nobody revisits. Code gets that review by default; tests must be given it explicitly.