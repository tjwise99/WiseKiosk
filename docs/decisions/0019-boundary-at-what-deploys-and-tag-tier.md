# 0019 — Draw the architecture boundary at what deploys, and tag an element at the tier its level answers to

**Status:** accepted
**Decided:** 2026-08-04 (C4 phase 1 design discussion, ticket #96 C4 phase 1 System Context)

## Context

[ADR 0003](0003-architecture-as-code-likec4.md) makes the LikeC4 model
([`../architecture/README.md`](../architecture/README.md)) the single source of truth for the
architecture, but leaves two questions to be answered per element, which means they are answered
differently each time.

**Which side of the boundary something falls on.** The project builds things that never enter the
published image: the configuration validator that runs at a desk
([ADR 0007](0007-config-validation-allocation.md)) and the provisioning tooling shipped with the
release artifact set (#71 release artifact set). Each is a fresh argument without a criterion, and
each reaches a different answer depending on whether "the system" is taken to mean what runs or what
the project owns.

**Which requirement tier an element's tag names.** The tag is the architecture → requirements link,
and ADR 0003 states its tier as `SRS` unconditionally. That does not survive contact with the Context
level, where the only element inside the boundary is the system itself and every `SRS` item allocates
below it.

## Decision

**The boundary is what deploys** — the published container image and what it serves. Desk-side and
provisioning tooling fall outside it.

The corollary does the work: **an element appears in the model only where the system exchanges
something with it.** Something outside the boundary that the system never communicates with is not an
external system, it is absent — being built by this project earns nothing. Scope of project and
context of system are different sets, and the model draws the second.

**An upstream data source is modelled individually, and only once the module that reads it has a need
in the tree.** The corollary above does not reach this on its own: SYS004<!-- Upstream data reaches
the display only through the backend --> is accepted and obliges precisely such an exchange, so
"exchanges something with it" would admit an upstream element today. What defers it is that an
upstream belongs to the module that reads it — [ADR 0012](0012-module-requirements-in-tree.md)
decomposes a module need by *its upstream* — and no module need is written, so nothing yet names one.
The Context level therefore carries no external system and gains one per upstream as each module's
need lands.

**A tag carries the Doorstop id of the requirement obliging the element or relationship it sits on, at
the tier its level answers to.** The Context level answers to `SYS`; the tier at each level below is
settled by the phase that models it. A tag binds where the obligation is observable at that level,
which at the Context level is on the relationships rather than on the system element — that element
owes every `SYS` item, so tagging it distinguishes none of them.

## Alternatives considered

**Boundary at what the project authors and ships**, putting the desk validator inside. It would make
ADR 0007's invariant — one TypeScript engine, two build targets, so page and desk validation cannot
disagree — visible in the model. Rejected: that invariant is already held by
SRS005<!-- One validation implementation -->, and buying a second copy of it costs a Container level
holding something that is not in the image and does not run on the display host, so "one published
container image" would stop being what the system element means.

**One aggregate external system for the upstreams**, as the committed scaffold carried. Rejected:
configuration selects which of the shipped modules render and where, and never names an upstream, so
the set is specification rather than deployment configuration and is bounded by the module roster in
[`../../README.md`](../../README.md). An aggregate element also belongs to no module, so it can carry
no module's identifier — which forecloses the binding the tag mechanism below exists for.

**`SRS` at every level**, as ADR 0003 assumes. Rejected: at the Context level it forces a choice
between attaching every `SRS` id to the single system element and picking an arbitrary few, and
neither is a link a reader can trust. Binding `SRS` to a *relationship* does not escape it either,
which is the form this decision's own mechanism would otherwise invite: an `SRS` item allocates to a
container, so tagging an edge here with one names an obligation on something this level does not
draw — the link points past the diagram carrying it, and nothing a reader of this level can see
either confirms or contradicts it. The tier is a property of the level, not of the mechanism.

**Tagging an element with every id it owes.** Rejected: true, and it carries no information — the
system element owing all seven `SYS` items restates that the `SYS` tier is the tier about the system.

## Consequences

**A tool the project ships is not thereby in the model.** The desk validator has no element and no
relationship; the provisioning tooling gains one if and when it acts on the running deployment.
[`../../tools/README.md`](../../tools/README.md) remains where the desk-side story is told.

**The tags are gated on resolution, not on judgement.** `check-arch-trace` reads the model through
`likec4 export json` and fails a tag naming no item, a retired or unaccepted one, or a mis-cased
identifier. Whether the tagged element is the one that requirement obliges, and whether the tier
suits the level, are review's — which is the ordinary division here, not an exception for this gate.

**ADR 0003 is corrected, not superseded.** Its reservation of tags as the architecture → requirements
mechanism stands; only the assumption that the tier is always `SRS` falls.
