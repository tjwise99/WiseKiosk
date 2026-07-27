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
`SRS` items carrying only what is specific to that module — its upstream, its parameters, its payload,
its cadence, its failure states. It lives in the same tree as the framework needs, under the same
prefixes and the same gate.

**Framework universals are not restated per module.** Secret delivery, caching, rejection behaviour
and failure rendering are already obliged for every module by framework items. A module need
decomposes into what is true of that module and nothing else.

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
prose.** Rejected: module tests run in the same gate as framework tests, and an obligation the gate
verifies but the tree never states is untraceable by construction — the condition
[ADR 0005](0005-traceability-gating.md) exists to prevent.

## Consequences

**The tree grows with content.** Adding a module adds a need and its decomposition. That is the work,
recorded where work is recorded — [ADR 0005](0005-traceability-gating.md) already treats the tree as
the backlog, so a module's unwritten items are its scope rather than an omission.

**The first needs that state product value.** A module need is the first item in the tree a
non-technical reader can validate the product against, which is what the need tier is for.

**The extensibility need stays dissolved.** *"A display module shall be addable and removable as a
self-contained unit, without change to shared framework code"* was dissolved by this pass because its
children were architecture. Module needs do not revive it: each states its own want rather than a
claim about how modules attach.

**The authoring process is not defined here.** What a module need must state, how its decomposition
is bounded, and which parts of the test architecture guide it are a procedure, filed separately.

**Reopen premise.** Revisit if module needs begin restating each other — three modules producing three
near-identical decompositions means the shared part is a framework obligation that was missed, not a
module one, and the repair is to lift it rather than to re-tier.
