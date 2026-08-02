# 0009 — Record what a verification settles, and what it does not

**Status:** accepted
**Decided:** 2026-07-24 (closing review pass of the requirements rewrite #18)

> **Scope widened, 2026-07-25 (#69); grounds restated, 2026-07-28 (#69).** As first written the
> attribute was required only below `test`, and the Context below argues that narrower case. **The
> tree no longer has it.** The #69 rebuild left every item at `test`, so the residue this decision
> was taken to describe — items resting on human judgement with no record of why — is empty, and the
> original grounds no longer reach anything.
>
> The attribute is nonetheless **required on every item**, on grounds the original did not state: at
> `test` it records **the limit of the check — what a green result does not prove.** That is not the
> same claim as the original, and it is the one that now carries the decision. Below `test` the
> original reading still applies if an item ever sits there again.
>
> **The evidence is the 2026-07-28 audit.** Three reviewers, filing blind against opposed briefs,
> produced two of their strongest convergent findings by reading justifications:
> `SRS027`'s <!-- The display page holds no device capability it does not use --> admission that no
> check settles *"whether an entry on that allowlist is justified"* is what exposed a check
> asserting over a set no artifact defines, and
> `SRS028`'s <!-- Served responses declare their type, and forbid the browser inferring one -->
> *"whether a declared type is the correct one for the bytes beneath it"* scoped all three readings
> of a requirement that obliged the browser rather than the product. Fourteen items carried the
> attribute at the time. Both findings came from that fourteen.

> **Note, 2026-07-25.** The counts below describe the tree as it stood when this decision was taken,
> partway through #18's closing pass. That pass then promoted most of those items: at merge the tree
> holds 255 items, 41 of them non-`test` — 16%, not half. The decision stands and the attribute
> exists for those 41; only the figures motivating it are of their moment. The Consequences section's
> docs-site column is likewise not yet rendered — `docs/site/doorstop_to_needs.py` emits no
> verification fields, and doing so needs a `needs_extra_options` declaration; tracked on #25.

## Context

[ADR 0005](0005-traceability-gating.md) gave every item a `verification-method` and routed the gates
on it. What it never captured is *why* an item sits below `test`. At the close of #18 the tree holds
236 items, 115 of them at `inspection`, `analysis`, or `demonstration` — that is not a rounding
error, it is half the specification resting on human judgment with no record of what made human
judgment necessary.

Two failures follow. An item weak because proving a negative is genuinely undecidable is
indistinguishable, in the file, from one weak because nobody tried; so a promotion pass has nothing
to audit against and must re-derive every verdict from scratch. And the weakening direction is
unguarded: a method downgraded under deadline pressure reads exactly like one that was always
correct. The method attribute records a conclusion and discards the argument.

#18's closing pass pushes every item to the strongest method it honestly supports. The residue needs
its blocker stated, or the pass cannot be checked and cannot be repeated.

## Decision

A fourth stored attribute, `verification-justification`, free text. **Required on every item**, it
records what that item's verification settles and what it does not:

- **Below `test`** — what specifically blocks a mechanically-decidable check: human judgment, live
  credentials, physical hardware, a wall-clock window, an unbounded search space, a property true
  only of the whole corpus.
- **At `test`** — what the mechanical check leaves unproven. A check asserting a schema's key set
  against a committed allowlist decides set equality, not that no key is secret-bearing; a check
  asserting a render under emulation decides that the page renders on that architecture, not that it
  renders fast enough on the device. Both pass while the obligation above them is unmet, and the
  field is where that gap is stated.

It is fenced by the review fingerprint alongside `verification-method` and `rationale`, so weakening
a method cannot land without re-review.

This partially supersedes ADR 0005's three-attribute set. 0005's method values, its four gates, its
derived-verification model, and its tree-as-backlog stance all stand unchanged.

Two distinctions the attribute depends on:

- **`rationale` answers why the obligation exists; `verification-justification` answers why a machine
  cannot settle it.** Different questions with different lifetimes — an obligation's reason for
  existing survives a change in how it is checked, and a blocker can dissolve the moment a tool
  appears without the obligation moving at all.
- **It is not the reference channel.** 0005 closes analysis and demonstration items through a
  referenced artifact; that reference is the *evidence the weaker method produced*. The justification
  is why that channel is in use at all. An item at `inspection` owes both.

The gate asserting that every item carries a non-empty justification is
`scripts/check-method-consistency.py`. The remaining gates it was to be built alongside — ADR 0005's
gates 2 and 3 — are still open under #25.

## Alternatives considered

- **Fold it into `rationale` as a trailing convention.** Rejected: it conflates two questions in one
  field, so neither can be gated independently — a check asserting "every non-`test` item states its
  blocker" cannot tell a justification paragraph from the surrounding prose without parsing English.
  It also breaks the one-fact-one-home rule the corpus was reconciled against under #42, held today
  by [`CI.md`](../CI.md)'s documentation-integrity gates, inside the very tree that states it.
- **State it in the `TST` item's `text`.** Rejected: the 115 non-`test` items span all three tiers,
  and the `SYS` tier — where `analysis` and `inspection` concentrate, and where there is no parent to
  inherit an argument from — would stay uncovered entirely. It also puts a claim about verification
  method inside a field reserved for the obligation.
- **Add the attribute but leave it outside the review fingerprint.** Cheaper, and measurably so:
  populating a fenced attribute across 115 items costs 115 re-reviews plus 76 suspect-link clears
  cascading from the 34 items that have baselined children. Rejected anyway — an unreviewed
  justification is precisely the rot the attribute exists to prevent, and the cost is paid once
  during a pass that re-reads those items regardless.
- **Derive it from the method and the item's references.** Rejected: the blocker is not recoverable
  from either. Two items can share a method and a reference shape and be weak for unrelated reasons.

## Consequences

- **Neither direction is free.** Moving an item away from `test` requires naming the blocker; moving
  it to `test` requires stating what the mechanical check leaves unproven. A method change always
  rewrites the field and re-passes review, so a weakening cannot arrive as a silent deletion and a
  promotion cannot arrive as an unexamined win.
- **Adding the attribute cost no fingerprint churn.** Doorstop's `stamp()` hashes only attributes
  present in an item's own file and does not write defaults back retroactively, so the 236 existing
  items were untouched by the schema change; only items that gain a justification re-flag.
- **A per-item audit trail replaces a per-pass one.** Any future reader can ask why the tree is only
  half machine-checked and get 115 specific answers instead of a policy statement.
- **The docs site gains a column** — the justification renders in needtables beside the method, so
  the weak half of the tree is browsable rather than discoverable only by grep.
- **It adds an authoring obligation to every item**, including pending ones. An item written before
  its blocker is understood must state the blocker; one claiming `test` must state what the check
  leaves unproven. "Unsure" has no representation, which is intended.
