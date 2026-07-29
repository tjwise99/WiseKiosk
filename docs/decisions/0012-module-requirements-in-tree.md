# 0012 — A module is a need: module requirements live in the same tree, one `SYS` per module

**Status:** accepted
**Decided:** 2026-07-26 (`SRS` pass of the tree rebuild #69)

## Context

The need tier holds eleven items and **not one of them says what the kiosk is for.** Every need is
framework-shaped — failure legibility, the published artifact, the gate regime, the internal
contract. The product's value reaches the tree only as the framework that carries it.

That left module-specific obligations with no home. The `SRS` pass repeatedly routed content "to that
module's work" — the triage rule for an item whose content is one instance — against a destination
that does not exist. [`../contracts/module-contract.md`](../contracts/module-contract.md) defines what
a module must *supply* to plug in: six parts, a dependency direction, eight steps to add one. Nothing
states what a module must *do*.

The absence also distorted the framework tree. Items stating one module's upstream behaviour sat
among items obliging every module, and the pass could not distinguish a universal from an instance by
position.

## Decision

**A module is a need.** Each module gets one `SYS` item stating its user-facing want, decomposed by
`SRS` items carrying only what is specific to that module — its upstream, the pattern its parameters
must match, its payload shape, its cadence. It lives in the same tree as the framework needs, under
the same prefixes and the same gate.

**Framework universals are not restated per module.** Secret delivery, caching, request rejection and
failure rendering are already obliged for every module by framework items. A module need decomposes
into what is true of that module and nothing else. The decomposition list above is bounded by this:
an earlier draft named *parameters* and *failure states*, which are `SRS012` and `SRS001` — a module
author following it literally would have written both twice.

No gate can decide this. Doorstop cannot see that a module need restates `SYS001`, so the rule is
carried where every other unmachineable obligation in this project is carried: as a question on
[`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist, reached from the pull-request
template. An authoring rule with no activation path is the dead letter [ADR
0011](0011-requirement-or-convention.md) deletes items for being.

**There is no generic module need.** *"The system shall provide a set of configurable, enablable
modules"* would be a hat over its own children — the enumerates-its-own-children tell. Its
configurability half is already carried: a deployment is parameterised from outside the image, and
every configured module renders whole.

## Alternatives considered

**A separate Doorstop document per module, or one shared `MOD` document.** Rejected: it buys churn
isolation and costs a second document configuration, a second place the gate must reach, and a seam
between two trees that must then be kept consistent by hand. Owner: *"adding more doorstop artifacts
to me just feels cluttered because then you have to add more tooling."*

**One generic module need, with each module as a single `SRS` beneath it.** Rejected twice over. The
generic need is a hat, and a module is not one obligation — upstream, parameters, payload, cadence and
failure states compressed into one item is a list wearing a `shall`, which is the defect this pass
spent its length removing.

**Modules outside the requirements tree entirely, specified by the module contract and per-module
prose.** Rejected: a module's obligations are obligations on the running software — what it fetches,
what it renders, how it fails — which is exactly what
[ADR 0011](0011-requirement-or-convention.md) puts in the tree. Leaving them to prose would place
product behaviour outside the traceability claim [ADR 0005](0005-traceability-gating.md) makes over
the product. Repository conventions leave the tree under that same rule; module behaviour is not one
of them.

## Consequences

**The tree grows with content, bounded by the module roster.** Adding a module adds a need and its
decomposition. That is the work, recorded where work is recorded — [ADR 0005](0005-traceability-gating.md)
already treats the tree as the backlog, so a module's unwritten items are its scope rather than an
omission. The count is not open-ended: the roster is a product decision stated in
[`../../README.md`](../../README.md), so the need tier is the framework needs plus one per module on
it, and a need for a module nobody decided to ship has nothing authorising it.

**The first needs that state product value.** A module need is the first item in the tree a
non-technical reader can validate the product against, which is what the need tier is for.

**Until one lands, nothing in the tree says the display shows anything.** The framework needs are
satisfied by a build that fetches correctly, proxies correctly, fails legibly and renders empty
regions — `SYS002`'s *"wholly visible"* is a layout property an empty region of the right size
passes. That is scope rather than omission, and the shape is deliberate: what a module shows differs
per module, so it is stated per module, while a module's *failure* state looks the same whatever
module owns it and is therefore a framework universal (`SRS001`). Adding a framework requirement that
modules display their data would be the generic hat rejected above.

**The extensibility need stays dissolved.** *"A display module shall be addable and removable as a
self-contained unit, without change to shared framework code"* was dissolved by this pass because its
children were architecture. Module needs do not revive it: each states its own want rather than a
claim about how modules attach.

**The authoring process is not defined here.** What a module need must state, how its decomposition
is bounded, and which parts of the test architecture guide it are a procedure, filed separately.

**It reverses an answer given a day earlier.** Module-specific content was previously routed to the
module's own implementation ticket, on the stated ground that module design decisions belong there.
That ruling and this one answer the same question, and this one governs: a decision recorded only in
an implementation ticket is not in the specification, which is the condition this ADR exists to end.

**Reopen premise.** Revisit if module needs begin restating each other — three modules producing three
near-identical decompositions means the shared part is a framework obligation that was missed, not a
module one, and the repair is to lift it rather than to re-tier.
