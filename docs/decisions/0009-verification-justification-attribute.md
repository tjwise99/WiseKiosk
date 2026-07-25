# 0009 — Record why a verification method is not `test`

**Status:** accepted
**Decided:** 2026-07-24 (closing review pass of the requirements rewrite #18)

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

A fourth stored attribute, `verification-justification`, free text. **Required when
`verification-method` is not `test`**, empty otherwise: it names what specifically blocks a
mechanically-decidable check — human judgment, live credentials, physical hardware, a wall-clock
window, an unbounded search space, a property true only of the whole corpus.

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
  is why that channel is in use at all. An item at `inspection` owes both, and gate 4's file-claim
  mechanism is untouched.

The gate asserting that every non-`test` item carries a non-empty justification is **explicitly left
open**, to be built with ADR 0005's gates 2–4 under #25. Until it exists the obligation is held by
review, as 0005's axiom tier already is.

## Alternatives considered

- **Fold it into `rationale` as a trailing convention.** Rejected: it conflates two questions in one
  field, so neither can be gated independently — a check asserting "every non-`test` item states its
  blocker" cannot tell a justification paragraph from the surrounding prose without parsing English.
  It also breaks [SYS037](../requirements/README.md)'s one-fact-one-home rule that the corpus was
  reconciled against under #42, inside the very tree that states it.
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

- **The asymmetry is deliberate: promotion is cheap, weakening must be argued in writing.** Moving an
  item to `test` deletes a field. Moving it away from `test` requires composing a defensible sentence
  and re-passing review.
- **Adding the attribute cost no fingerprint churn.** Doorstop's `stamp()` hashes only attributes
  present in an item's own file and does not write defaults back retroactively, so the 236 existing
  items were untouched by the schema change; only items that gain a justification re-flag.
- **A per-item audit trail replaces a per-pass one.** Any future reader can ask why the tree is only
  half machine-checked and get 115 specific answers instead of a policy statement.
- **The docs site gains a column** — the justification renders in needtables beside the method, so
  the weak half of the tree is browsable rather than discoverable only by grep.
- **It adds an authoring obligation to every non-`test` item**, including pending ones. An item
  written before its blocker is understood must either state the blocker or claim `test`; "unsure"
  has no representation, which is intended.
