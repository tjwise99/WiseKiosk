---
name: module-spec
description: >-
  Author a WiseKiosk display module's specification — its one `SYS` need, the `SRS` decomposition
  bounded by the framework universals, a pending `TST` stub per requirement, and the module drawn in
  the architecture model. Sequences the work and points at the contract that decides its content.
  Invoke when adding a module to the requirements tree, before any of that module's code is written.
---

# Specify a module

**A module reaches the requirements tree before it reaches the repository.** This skill is the
sequence; what each item must *say* is
[`docs/contracts/module-contract.md` § Writing the module's requirements](../../../docs/contracts/module-contract.md),
and it is authoritative. Do not re-derive its rules from here — read it. Read
[§ A module is its capability, not its supplier](../../../docs/contracts/module-contract.md) with it:
a module is identified by what a viewer gets from it and never by the service it happens to read, so
**no requirement names a supplier** — not the need, not anywhere in the decomposition. The supplier is
named in the architecture model's external system and in the route key, and nowhere in the tree.

That a module is a need at all is
[ADR 0012 rev 2](../../../docs/decisions/0012-module-requirements-in-tree.md). A module not on the
roster in [`README.md`](../../../README.md) has nothing authorising a need for it.

## Which shape

**Upstream-backed** or **local**, and it changes the size of the job. A local module renders from
something already present, fetches nothing, and has no shaping library, no route registration and no
boundary-schema fragment — so no source, parameter-pattern, payload or timing items, and one drawn
element. Settle this first; most of the contract's clauses are marked with the shape they apply to.

## The sequence

1. **One `SYS` need.** What a viewer gets, one sentence, one `shall`, enumerating nothing — a need
   listing its own decomposition is a hat over its children. Header an indicative noun-phrase claim,
   not the sentence beneath it repeated. Written for a reader with no stake in the code.
   **It obliges a capability** — *shall be capable of showing …* — because a module is configured in
   or left out; the contract says why.
2. **The `SRS` decomposition.** What is true of this module and nothing else. Each names its module —
   beneath a module need that is the item's correct form, not an instance to triage away.
3. **One `Pending:` `TST` stub per active `SRS`** — [pending-stub](../pending-stub/SKILL.md).
4. **Draw the module** — [arch-model](../arch-model/SKILL.md). Every module gains a component under the
   frontend; an upstream-backed one also gains a backend component, an external system and the edge to
   it. This lands in the **same change** as the items, because they land accepted and active and every
   accepted active item must bind to something drawn.

Item mechanics throughout — creating, linking, the two stamps, the per-item checklist — are
[tree-item](../tree-item/SKILL.md)'s.

## Commit granularity, and a red step 2

**Steps 2 and 3 are gate-complete only together.** An active `SRS` with no child link errors the
strict gate, so a commit holding step 2 alone reds `just check-reqs` until step 3's stubs land, and a
commit holding steps 1–3 without step 4 reds `check-arch-trace` until the model does. Both are
expected rather than a mistake.

**Either shape is fine, and the choice is the change's, not this skill's.** One commit per step
reviews the reasoning in the order it was made and leaves intermediate commits red; one commit for
steps 2 and 3 together leaves every commit green and merges two arguments into one message. **Only
the PR head is gated** — CI runs against the merge result, not each commit — so a red intermediate
commit blocks nothing. Where a step is red in isolation, say so in that commit's message, so the next
reader meets the reason rather than a mystery.

## The boundary, and its second stage

The decomposition stops where the framework universals begin — what is obliged of every module
already, which a module restating has written twice.

**Do not check a draft against a list of them.** The boundary is categorical and a roster was
explicitly refused, because a list is wrong the moment the framework gains an item and an author
working down it stops thinking. The test is what a draft leaves once its module is taken out of it,
and **it runs over rewording and over abstraction — an author is done only when both have been
tried.** Rewording swaps the module named and keeps everything else. Abstraction goes a step further
and drops what is particular to the module, leaving the shape underneath: *the weather module shall
report on the location its configuration names* abstracts to *a module reports on the subject its
configuration names*. Rewording alone misses the item most worth catching, because an item whose
every clause names its own subject survives it untouched while the sentence beneath it is a
universal; abstraction alone runs the other way, since abstracted far enough every item reduces to *a
module does what it is for*, so the abstraction that counts is the one that drops the module and
keeps the obligation. Where the two disagree, the abstracted reading is the one that goes to the
second stage.

**And if what the test leaves is a sentence the framework *would* say but does not — stop.** That is
not the same answer and the first stage cannot tell them apart, and dropping it loses a real
obligation silently.

**So the second stage asks two questions rather than one, and it has three outcomes.** Does a
framework item say it — if yes, drop the draft. Does the contract itself say it — if yes, the draft
cites that clause in its own `rationale`, and nothing is promoted and nothing is escalated: the
contract states structure directly and what it states binds without a tree item behind it
([ADR 0011 rev 2](../../../docs/decisions/0011-requirement-or-convention.md)). Only when neither says
it is the sentence homeless, and only then is it the owner's: it becomes a framework item, or this
module's against a recorded trigger for promoting it — and **which one is the owner's call**. Surface
it; do not choose. **Search both before raising one.**

## Escalate rather than invent

A module spec is where invented interfaces are cheapest to write and most expensive to find. A
configuration key's name and default are the configuration schema's, not a requirement's — an item
states what the choice *does*. Where the specification is silent on something observable, halt and
ask.

## Closing

`just check-reqs`, `just check-citations`, `just check-arch-trace`, `just check-arch`. Those four are
what this work can fail, and all four run from `docs/requirements/.venv` and
`docs/architecture/node_modules`, which the module-spec path already needs.

Then `just verify` — with two caveats, because **it halts at the first failing recipe**, so a stop
early in the list means every gate after it did not run and the change was not measured:

- **`check-branch` needs the GitHub API.** It resolves the branch's issue over HTTPS; a sandbox
  without a usable trust store, or no network, fails it on the environment rather than on the branch.
- **`check-site` needs `docs/site/.venv`**, which nothing on this path installs. Create it with
  `just site-install` once, or expect the stop.

Neither failure says anything about the module spec. When `verify` stops on one, run the rest by
name rather than reading the stop as a verdict — the recipe list is in the `verify` line of the
[justfile](../../../justfile). **CI is the source of truth either way**, and it has both.

Adding a module is a test-architecture review trigger
([`docs/TESTING.md` § Review cadence](../../../docs/TESTING.md)).
