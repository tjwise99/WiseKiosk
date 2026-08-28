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
and it is authoritative. Do not re-derive its rules from here — read it.

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
2. **The `SRS` decomposition.** What is true of this module and nothing else. Each names its module —
   beneath a module need that is the item's correct form, not an instance to triage away.
3. **One `Pending:` `TST` stub per active `SRS`** — [pending-stub](../pending-stub/SKILL.md).
4. **Draw the module** — [arch-model](../arch-model/SKILL.md). Every module gains a component under the
   frontend; an upstream-backed one also gains a backend component, an external system and the edge to
   it. This lands in the **same change** as the items, because they land accepted and active and every
   accepted active item must bind to something drawn.

Item mechanics throughout — creating, linking, the two stamps, the per-item checklist — are
[tree-item](../tree-item/SKILL.md)'s.

## The boundary, and its second stage

The decomposition stops where the framework universals begin — what is obliged of every module
already, which a module restating has written twice.

**Do not check a draft against a list of them.** The boundary is categorical and a roster was
explicitly refused, because a list is wrong the moment the framework gains an item and an author
working down it stops thinking. The test is one question: **would rewording this to name a different
module leave a sentence the framework already says?** If yes, drop it.

**And if rewording leaves a sentence the framework *would* say but does not — stop.** That is not the
same answer and the first stage cannot tell them apart. The obligation is real and homeless; dropping
it loses it silently. It becomes a framework item now, or this module's with the next module needing it
as the promote-later trigger — and **which one is the owner's call**. Surface it; do not choose.

## Escalate rather than invent

A module spec is where invented interfaces are cheapest to write and most expensive to find. A
configuration key's name and default are the schema fragment's, not a requirement's — an item states
what the choice *does*. Where the specification is silent on something observable, halt and ask.

## Closing

`just check-reqs`, `just check-citations`, `just check-arch-trace`, `just check-arch`, then
`just verify`. Adding a module is a test-architecture review trigger
([`docs/TESTING.md` § Review cadence](../../../docs/TESTING.md)).
