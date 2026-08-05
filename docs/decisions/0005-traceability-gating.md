# 0005 — Trace all work to the requirements tree with in-repo gates

**Status:** accepted; stored-attribute set superseded by
[ADR 0009 rev 1](0009-verification-justification-attribute.md); traceability scope narrowed and gate 4 retired
by [ADR 0011 rev 1](0011-requirement-or-convention.md)
**Decided:** 2026-07-22 (traceability-gating design discussion; implementation ticket #25, under the
requirements rewrite #18)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

A branch passed every gate while nothing mechanically tied it to a requirement. `just check-reqs`
proves the Doorstop tree is internally sound — parent links resolve, no suspect or orphan items —
but nothing checks the reverse arrow: that work entering the repo points back into the tree. The
project ethos is that no work exists without a requirement authorizing it, and an ethos nothing
enforces decays silently. Two constraints shaped the answer: all trace information must live in
code, where automation can check it and the docs site can render it (never in out-of-band metadata);
and the project's founding prose is dissolving into hard requirements under
#18, so the model must stand without a prose document as its axiom.

## Decision

Every requirement carries a `verification-method` attribute (`test` | `inspection` | `analysis` |
`demonstration`); gates route on the method. `rationale` is required at the `SYS` tier, where there
is no parent to inherit from; lower items may carry one but are not gated on it.

This partially supersedes [ADR 0002 rev 1](0002-requirements-management-doorstop.md): per-test in-code
attribution replaces `TST` `references` to verifying files as the evidence channel for Test-method
items. Doorstop `references` remain the channel for inspection, analysis, and demonstration
artifacts; 0002's adoption of Doorstop, the tree shape, and `check-reqs` stand unchanged.

Four gates, all in-repo, each run by `just verify` and mirrored byte-identically in CI:

| # | Gate | Proves |
|---|---|---|
| 1 | `check-reqs` (exists) | Tree integrity: parent links, no suspect/unreviewed/orphan items |
| 2 | Attribution scanner | Every cited requirement ID resolves; no unattributed tests; no attribution to a non-`accepted` item |
| 3 | Coverage closure (when source exists) | Uncovered source is unjustified source (visible exemptions) |
| 4 | Inspection file-claim | Every tracked file in non-code silos is claimed by an Inspection-method item or exempted visibly |

- **Attribution is per-test and in-code.** A test names the `TST` item it verifies in its own
  source; the scanner closes both directions (cited ID exists; Test-method item has evidence; no
  test cites nothing). Coverage then makes the closure transitive: source → test → TST → SRS → SYS,
  so coverage is traceability closure here, not a quality threshold.
- **Analysis and demonstration items close through referenced artifacts** — the item references the
  analysis document or demonstration procedure, and derived verification is that reference resolving
  plus the item's `reviewed` fingerprint. Human judgment stays in the sign-off; only the linkage is
  mechanized.
- **Stored state records human decisions only**: `status: proposed | accepted`, where acceptance is
  the review act (fingerprint, rationale, method present). Verified/implemented is **derived** by
  the scanner from evidence and is never stored. Retirement is Doorstop's existing `active: false`.
- **The tree is the backlog.** `proposed` items live on `main`; accepted-but-unverified items are
  reported as the work queue, never a blocking failure — a scoping-only session stays green.
  Implementing against a `proposed` item fails: that is building on unbaselined spec.
- **The axiom tier is the parentless `SYS` items**, fenced by Doorstop's `reviewed` fingerprints and
  suspect-link propagation — editing a `SYS` item fails `check-reqs` until every child is
  re-reviewed. No prose document sits above the tree. ADR links are optional provenance where a
  decision genuinely drove a requirement; a mandatory source field at the axiom tier would force
  boilerplate over the honest "because the owner decided".

Trace direction depends on the work: implementation traces down to accepted items via attribution;
requirements-authoring self-traces up via parent links in its own diff; `SYS`-tier work traces to
nothing by design, gated by review.

## Alternatives considered

- **Requirement IDs in PR bodies, and a PR→issue link gate.** Rejected by a partition argument:
  every file a PR touches falls to exactly one of the four gates, so its trace is fully derivable
  from the diff against the tree — a PR-body ID either restates that or contradicts it, and in a
  contradiction the diff is the truth. PR metadata lives outside the checked zone: no scanner reads
  it, no page renders it, nothing fails when it rots. Issues remain as scheduling views over the
  backlog; branch shape is process-gated by [ADR 0006 rev 1](0006-process-gates.md) but stays outside the
  traceability evidence channel — the rejection here stands.
  The partition also obliges gate 4's claim mechanism to reach files Doorstop references cannot —
  paths under dot-directories, a limit 0002 records — so that claim check is scanner-side or those
  paths ride the exemption manifest; the mechanism choice is open in #25.
- **A stored `implemented`/`verified` state.** Rejected: it is derivable from evidence the scanner
  already has, and a hand-set flag survives the deletion of the test that justified it — the same
  hand-declared-in-two-places defect class the boundary-contract rule exists to kill.
- **Requirement→test refs at file grain** (Doorstop `references` to test files). Rejected: a file
  can hold many tests, so one traced test smuggles untraced siblings past the gate. Attribution is
  per-test, in the test's own source.
- **Requirement→source design-allocation refs.** Rejected: coverage closure supersedes them for the
  orphan-work invariant, and refs into a volatile source tree churn on every rename. Design
  allocation, where wanted, belongs to the architecture model, not the gate system.
- **A "needs re-verification" state.** Rejected: Doorstop's suspect-link machinery already fails
  `check-reqs` when a parent changes until children are re-reviewed; a parallel state would
  duplicate an existing enforcement.

## Consequences

- **Verification debt is visible, not blocking.** The docs site renders a verification matrix from
  derived status (sphinx-needs `status` + `needtable`); unverified accepted items are backlog rows,
  not red CI. If a release gate is ever wanted, it blocks there, not at merge.
- **Coverage implies a near-100% bar** with a visible exemption mechanism — deliberate, because it
  gates an invariant (no unjustified source), not a chosen number. Coverage proves execution, not
  specification: a line covered incidentally counts. That residue is held by review and test
  quality, and no gate pretends otherwise.
- **Exactly one ungated surface remains** — the axiom tier — held by human review, mechanized by
  fingerprints. Everything below it is machine-checked.
- Open implementation decisions (attribution syntax per language, exemption mechanism shape) are
  deferred to #25 **explicitly marked open**, not resolved silently here.
