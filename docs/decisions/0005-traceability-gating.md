# 0005 — Trace all work to the requirements tree with in-repo gates

**Status:** accepted; stored-attribute set superseded by
[ADR 0009 rev 2](0009-verification-justification-attribute.md); traceability scope narrowed and gate 4 retired
by [ADR 0011 rev 2](0011-requirement-or-convention.md)
**Decided:** 2026-08-23 (rev 2's evidence-channel pivot, in the #25 traceability gates planning
session; the surrounding model was taken 2026-07-22 at the traceability-gating design discussion,
under the requirements rewrite #18)
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-23 — walks back the bespoke per-test attribution channel. Forward evidence for
  Test-method items is native Doorstop `references` carrying a `keyword`, which reaffirms
  [ADR 0002 rev 3](0002-requirements-management-doorstop.md)'s mechanism rather than superseding it;
  content drift is caught by Doorstop's own `item_sha_required` plus its `item_validator` hook; gate
  2 is dropped, because a declaration-anchored keyword closes the gap it was to cover and a blocking
  reverse gate would price structural tests out of the suite; and gate 3 moves to #190 coverage
  closure gate (#25 traceability gates).
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

**What rev 2 reopened.** Rev 1 displaced Doorstop's `references` channel for Test-method items with a
per-test in-code attribution convention and a scanner to read it. The scanner was never built, the
tree went on using the native channel rev 1 said it had replaced, and read against the pinned
Doorstop 3.2 source two of the three objections that displaced it do not hold. The evidence channel
below is stated against what the tool actually offers, so that what is bespoke here is only what
Doorstop cannot do.

**And what rev 2 answers differently.** The reverse arrow the Context opens with is two claims, not
one: that every item's evidence exists in the repo and is current, and that every test in the repo
names an item. Rev 2 holds the first mechanically and declines the second, for the reason given
against the third objection below. The record's answer to its own opening question is therefore
narrower than rev 1's, and deliberately so.

## Decision

Every requirement carries a `verification-method` attribute (`test` | `inspection` | `analysis` |
`demonstration`); gates route on the method. `rationale` is required at the `SYS` tier, where there
is no parent to inherit from; lower items may carry one but are not gated on it.

**The forward evidence channel is Doorstop's native `references`, one entry per verifying site,
each carrying the `keyword` of the test that discharges it** (owner, 2026-08-23). The keyword is the
test's **declaration as the source writes it** — `func TestXxx` for Go, `test('<title>'` or
`` test(`<title>` `` for Playwright — so Doorstop resolves the entry to a file *and a line*, the
line being the one that declares the test. Anchoring on the declaration rather than on the bare name
is what makes a deletion visible: Doorstop returns the first line matching the keyword anywhere in
the file, so a bare name also matches the doc comment this repo writes above every Go test, and a
deleted test stays resolvable through its own obituary.

**Anchoring does not reach a parameterized test's cases.** Where the `test(` call sits inside a loop
over a data array, as three render-tier specs do, the keyword is the template as written, which is
none of the titles the runner prints; deleting a *row* of the array retires runtime tests while the
`test(` line, and so the entry, still resolves, and emptying the array leaves an entry resolving
over zero running tests. What catches that is the whole-file drift sha below, and the human
re-review it forces — not an unresolvable reference. Stated rather than designed around, on the
same terms as the drift hook's whole-file granularity.

**A reference to a whole-file check artifact that no runner discovers may omit `keyword`.** Where
the verifying site is a script invoked as one command, every assertion of which discharges the one
item — the `scripts/image/*.py` harnesses — there is no declaration to anchor on and no runner title
to name; drift is still carried by the entry's file `sha`. Every reference to a runner-discovered
test carries a declaration-anchored keyword.

This reaffirms
[ADR 0002 rev 3](0002-requirements-management-doorstop.md): a `TST` item's `references` point at the
real verifying files, for every verification method, and rev 1's partial supersession of that
mechanism is withdrawn.

Rev 1 rejected the native channel on three objections. Their disposition, each settled against the
pinned tool rather than against recollection:

- **Granularity** — *a file holds many tests, so a file-grain reference smuggles untraced siblings
  past the gate*. **Does not hold.** A `references` entry takes a `keyword`, and Doorstop resolves it
  to a file and line number. The channel is line-grain; rev 1 was written as though `keyword` did not
  exist. Anchored on the declaration, the entry vouches for one test rather than for the file holding
  it, so a sibling is neither smuggled nor claimed.
- **Multiplicity** — *one reference cannot carry the relation the tree needs*. **Does not hold.**
  `references` is a validated many-to-many list: an item may name several sites, several items may
  name one site, and every entry is checked rather than only the first. That is exactly the relation
  [`../requirements/README.md`](../requirements/README.md) states, where a `TST` item is a
  verification obligation rather than a test function.
- **Reverse direction** — *nothing proves that no sibling test is untraced*. **Survives as a fact
  about the tool, and is rejected as a gate** (owner, 2026-08-23). Doorstop's traceability is
  item-anchored: it asks whether this item's reference resolves, never whether every test in a file
  is claimed by some item. What that observation was carrying was the granularity objection above,
  and the declaration-anchored keyword settles that natively. What is left is the demand that every
  test the runner discovers name a `TST`, and that is refused: a suite holds requirements-based tests
  *and* structural ones — a table-driven boundary case, a regression pinning a fixed bug, a fuzz
  seed — and obliging each to carry a verification obligation either invents items that state no
  want or prices the test out of the suite. Degrading the test protocol to satisfy a gate is the
  wrong trade. What is left after that refusal is a **deliberately accepted, non-gated gap**: no
  gate and no report measures the tests no item claims, and #192 verification-debt report is not
  that report — it runs the other way, over accepted Test-method items with no resolving reference.
  The two populations are complements, and #192 says so in its own body.

**Drift on the evidence channel is caught natively too.** The `TST` document sets
`item_sha_required` in its `.doorstop.yml`, so `doorstop review` records a SHA256 of each referenced
file in its entry, and the document's `item_validator` hook — Doorstop's documented per-document
extension, described in its scripting guide and dogfooded on upstream's own tree under `reqs/ext/`,
though not carried in the installed package — compares the recorded hash against the file on every
validation run. The copy this repo runs, `tst/.req_sha_item_validator.py`, is authored here. A
referenced test whose content changed fails `doorstop --error-all` until the item is re-reviewed.
This is the suspect-link discipline the tree already applies to parent requirements, extended to the
files that verify them, and it runs inside the existing `check-reqs` rather than as another sibling
script. Granularity is whole-file: any edit to a referenced test re-reviews every item
referencing it, and that churn is accepted rather than designed around; hashing only the keyword's
region is a possible refinement if it bites. The extension is per-document, so `sys/` and `srs/` are
untouched.

Two gates, both in-repo, each run by `just verify` and mirrored byte-identically in CI. The numbering
is historical, so a retired gate's number is not reused:

| # | Gate | Proves |
|---|---|---|
| 1 | `check-reqs` (exists) | Tree integrity: parent links, no suspect/unreviewed/orphan items; every `TST` reference resolves to a file, and to the declaration its `keyword` names where it carries one; no referenced test drifted since review |
| 3 | Coverage closure (when source exists) | Uncovered source is unjustified source (visible exemptions) |

Gate 2, a reverse-direction claim over every discovered test, is dropped for the reason given against
the third objection above. Gate 4, an inspection file-claim over non-code silos, is retired by
[ADR 0011 rev 2](0011-requirement-or-convention.md) for having no possible subject.

- **Both surviving gates run forward, from the tree outward.** Gate 1 proves each item's evidence
  exists, at the line that declares it, and has not drifted. Coverage then makes the closure
  transitive: source → test → `TST` → `SRS` → `SYS`, so coverage is traceability closure here, not a
  quality threshold — and it reaches source a structural test covers without any item naming that
  test, which is the closure gate 2 was reached for.
- **Analysis and demonstration items close through referenced artifacts** — the item references the
  analysis document or demonstration procedure, and derived verification is that reference resolving
  plus the item's `reviewed` fingerprint. Human judgment stays in the sign-off; only the linkage is
  mechanized. The channel is the same one Test-method items use; what differs is what sits at the
  other end of it.
- **Stored state records human decisions only**: `status: proposed | accepted`, where acceptance is
  the review act (fingerprint, rationale, method present). Verified/implemented is **derived** from
  evidence and is never stored. Retirement is Doorstop's existing `active: false`.
- **The tree is the backlog.** `proposed` items live on `main`; accepted-but-unverified items are
  reported as the work queue, never a blocking failure — a scoping-only session stays green.
  Implementing against a `proposed` item fails: that is building on unbaselined spec.
- **The axiom tier is the parentless `SYS` items**, fenced by Doorstop's `reviewed` fingerprints and
  suspect-link propagation — editing a `SYS` item fails `check-reqs` until every child is
  re-reviewed. No prose document sits above the tree. ADR links are optional provenance where a
  decision genuinely drove a requirement; a mandatory source field at the axiom tier would force
  boilerplate over the honest "because the owner decided".

Trace direction depends on the work: implementation traces down to accepted items through the
`references` its `TST` items carry; requirements-authoring self-traces up via parent links in its own
diff; `SYS`-tier work traces to nothing by design, gated by review.

The four stored attributes — `verification-method`, `status`, `verification-justification` and
`rationale` — are untouched by this rev and are not reopened by it.

## Alternatives considered

- **A bespoke per-test in-code attribution convention, read by an authored scanner** — rev 1's
  choice, in which a test names the `TST` item it verifies in its own source and `TST` `references`
  are reserved for inspection, analysis and demonstration artifacts. Rejected: it re-implements what
  the tool already does, and does it worse. Doorstop validates that a referenced path is tracked and
  that its keyword is present, carries the reference inside the item's `reviewed` fingerprint, and
  renders it in published output; a parallel convention gets none of that, and a renamed or deleted
  test file breaks nothing. Two of the three objections that justified the replacement do not hold
  against the tool as shipped, and the third asks for a gate this rev declines to build.
- **Requirement IDs in PR bodies, and a PR→issue link gate.** Rejected by a partition argument:
  every file a PR touches falls to exactly one of the gates, so its trace is fully derivable
  from the diff against the tree — a PR-body ID either restates that or contradicts it, and in a
  contradiction the diff is the truth. PR metadata lives outside the checked zone: no scanner reads
  it, no page renders it, nothing fails when it rots. Issues remain as scheduling views over the
  backlog; branch shape is process-gated by [ADR 0006 rev 4](0006-process-gates.md) but stays outside the
  traceability evidence channel — the rejection here stands.
  The partition once obliged gate 4's claim mechanism to reach files Doorstop references cannot —
  paths under dot-directories, a limit 0002 records — but that gate is retired, so the obligation
  lapsed with it.
- **A stored `implemented`/`verified` state.** Rejected: it is derivable from evidence the gates
  already have, and a hand-set flag survives the deletion of the test that justified it — the same
  hand-declared-in-two-places defect class the boundary-contract rule exists to kill.
- **Requirement→source design-allocation refs.** Rejected: coverage closure supersedes them for the
  orphan-work invariant, and refs into a volatile source tree churn on every rename. Design
  allocation, where wanted, belongs to the architecture model, not the gate system. This is about
  references into the *source* tree and is untouched by rev 2, which concerns the test evidence
  channel alone.
- **`item_sha_required` without the validator hook.** Rejected: Doorstop writes the hash at review
  time and no core command ever re-derives it, so the recorded shas would sit in every item's YAML,
  ride its fingerprint, and be compared by nothing. The extension supplies the data for a drift
  check, not the check; adopting the writer without the reader buys noise.
- **A "needs re-verification" state.** Rejected: Doorstop's suspect-link machinery already fails
  `check-reqs` when a parent changes until children are re-reviewed; a parallel state would
  duplicate an existing enforcement. With the drift hook above, the same machinery also covers a
  changed test file.

## Consequences

- **Verification debt is visible, not blocking.** The docs site renders a verification matrix from
  derived status (sphinx-needs `status` + `needtable`); unverified accepted items are backlog rows,
  not red CI. If a release gate is ever wanted, it blocks there, not at merge. Building that matrix
  is #191 verification matrix.
- **Editing a verified test costs a re-review.** The drift hook hashes whole files, so a comment, an
  import reorder or a lint fix in a referenced spec unreviews every item referencing it, and
  `doorstop review <UID>` is the only way to clear it. That is deliberate pressure in the direction
  [ADR 0002 rev 3](0002-requirements-management-doorstop.md) warns about — re-blessing is a human act
  and must not become a reflex — and it is the cost this rev accepts in exchange for the tree
  noticing when its evidence moves.
- **No gate in the table is authored here.** Gate 1 is the tool's, configured — the drift hook is
  the extension point Doorstop documents, not a sibling script — and gate 3 is the coverage tool's.
  That is the answer [ADR 0016 rev 5](0016-maintained-tools-for-standard-artifacts.md) asks for
  before a check is written, and dropping gate 2 is what leaves the table with no exception. What is
  authored is a guard on the *configuration* rather than on the tree: Doorstop validates nothing
  under `extensions`, so a misspelt key disarms the hook in silence and the tree then reports clean
  over drifted evidence. That obligation is this repository's own rule about its own config, which
  is where ADR 0016 rev 5 puts an authored check; it proves no requirement and is not a row above.
- **An unclaimed test is not a build failure.** Nothing fails when a test the runner discovers is
  named by no item, so a structural test lands without inventing a `TST` for it. What that costs is
  visibility into that population, and nothing here buys it back — the gap is accepted rather than
  mitigated, and saying so is the honest state. #192 verification-debt report is a *separate*
  forward-direction report over items with no evidence, not a substitute for it.
- **Coverage implies a near-100% bar** with a visible exemption mechanism — deliberate, because it
  gates an invariant (no unjustified source), not a chosen number. Coverage proves execution, not
  specification: a line covered incidentally counts. That residue is held by review and test
  quality, and no gate pretends otherwise.
- **The ungated surfaces are named rather than counted.** The axiom tier, held by human review and
  mechanized by fingerprints. The reverse direction, accepted above. And source no test reaches,
  until gate 3 lands under #190 coverage closure gate. What the gates do reach, they reach
  mechanically; nothing else is claimed.
- The exemption mechanism's shape is deferred to #190 coverage closure gate **explicitly marked
  open**, not resolved silently here.
