# 0021 — Earn a component by its interface, and draw only the framework half of each container

**Status:** accepted
**Decided:** 2026-08-05 (C4 phase 3 design discussion, ticket #98 C4 phase 3 Component)

## Context

[ADR 0003](0003-architecture-as-code-likec4.md) authored the model so the Component level "can be
added later without restructuring", and [ADR 0019](0019-boundary-at-what-deploys-and-tag-tier.md) and
[ADR 0020](0020-two-containers-one-origin-and-dual-tier-tags.md) settled the boundary, the containers
and the tier a tag answers to. This is that addition.

**It arrives before the code, and ADR 0003 gave a reason it should not.** That decision holds, in the
same breath as the sentence above, that these levels "are not built now: no application code exists,
so building them would be an abstraction with a single implementation and no second consumer", citing
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s generality question. The ground is unchanged — no
source exists today either — so it is answered rather than outlived. That question asks whether an
*interface or extension point* has a second consumer, because an abstraction built for one caller
constrains the code that must satisfy it. A view constrains nothing: it is a description, it compiles
to a picture, and deleting it changes no behaviour. Applying a generality rule to a drawing would bar
every design document in this repository from preceding its implementation, which is the order
`CONTRIBUTING.md` opens by requiring.

**That clause is reversed, not re-grounded, so it is superseded rather than amended.** ADR 0003 ruled
the levels would not be built and this builds them, which
[`README.md`](README.md) routes to supersession; its status names the superseded clause, and the rest
of that decision — LikeC4, the browser-free codegen, the staleness gate — stands untouched.

**The levels above had a physical test and this one does not.** A system is what has its own owner; a
container is an execution context, which is how ADR 0020 settled two containers behind one origin
against the image that ships them. C4's component has no such test — a grouping of related
functionality behind a well-defined interface, whose only crisp half is the negative one, that it is
not separately deployable or it would be a container. Left there, the level draws whatever the source
tree happens to look like: the folder listing, the layer cake, a box per type. Each is true of the
system and of ten thousand others, which is the objection ADR 0019 raised against tagging the system
element with every `SYS` item.

**A second seam is already written down, and its vocabulary collides with this level's.**
[`../contracts/module-contract.md`](../contracts/module-contract.md) states a module's six parts, the
direction modules and framework depend in, and that a route's parameter validation, both cache TTLs,
its rate limit, its outbound timeout and its maximum response size live in one registration entry
*and nowhere else*. That is structure in prose. This level either adopts it or derives boundaries
beside it — and it must do so in a repository where *module* is the product's unit, *component* is
already a Svelte file, and *container* already needed disambiguating once.

## Decision

**A component is a responsibility with a nameable interface** — what it exposes, and who calls it.
This is Brown's own test, applied as a test for what earns a place rather than quoted, and it is what
decides the one candidate the module contract most loudly suggests: **the route registry is not a
component.** The contract's "those values live in the entry and nowhere else" is a real and
load-bearing commitment, but nothing calls the registry. It is data the other components read, built
into handlers at startup, and drawing it would put the source tree's shape on a diagram of what runs.
The commitment is recorded in the contract and in [`../ARCHITECTURE.md`](../ARCHITECTURE.md), which
is where a fact about where policy is *written* belongs.

**What executes that entry is a component, and it is the one the registry's absence obscured.** The
same test that excludes the data admits the code reading it: a route handler answers
`GET /api/<source>`, which is what SRS009<!-- Every source reachable through the backend,
statelessly --> obliges and what the frontend's payload fetch terminates on. **Each container has
exactly one such owner** — the route handler in the backend, the page shell in the frontend — and the
remaining components are asked, never asking. Without one, a level has no subject for a relationship
label and its parts appear to call each other, which is a sequence no document states.

The backend's owner carries a second load the frontend's does not: it is where framework code calls
the module's shaping functions, before the upstream request to build it and after to parse the
answer. **So the framework half of the backend cannot serve a payload alone** — a fact this level
would otherwise leave invisible, since the module half it reaches is undrawn.

**The framework/module seam is the contract's, not this level's judgement.** A module's half of a
container is code a module author writes *that runs in that container*: part 1's shaping library in
the backend, part 3's Svelte component in the frontend. Everything else is shared framework,
parameterised per route by part 2's entry. Those six policy values are per-route **data**, and
treating per-route configuration as per-module structure would make request validation, the response
cache and the upstream client all module-owned and leave the framework half empty — against the
contract's own dependency direction, under which framework code "is shared code from the moment it is
written". Parts 4 and 5 earn no component either: the boundary-schema fragment belongs to the one
schema, which [ADR 0008](0008-boundary-contract-openapi-codegen.md) gives to neither side, and the
configuration-schema fragment composes into the one schema the frontend validates against. Part 6 is
tests, which run nowhere in either container and are [`../TESTING.md`](../TESTING.md)'s.

**Only the framework half is drawn.** [ADR 0012](0012-module-requirements-in-tree.md) makes a module
a need, and the tree holds no module need, so nothing obliges a module component. This is ADR 0019's
ground for deferring an upstream element, reached one level down and by the same route: the roster in
[`../../README.md`](../../README.md) names all five modules, and naming them is not what earns them a
place.

**A tag sits where its obligation is observable**, which is ADR 0019's rule and not a new one. A
component depth does not make the finer placement the right one.
SRS008<!-- No secret value in any backend output --> and
SRS028<!-- Served responses declare their type, and forbid the browser inferring one --> quantify over
every output and every response, so they sit on the container.
SRS018<!-- One generic published image --> obliges the image, which is neither component nor
relationship, and stays where what is observable of it is — the configuration arriving from outside.
SRS003<!-- A configuration change applies no later than the next page load --> is a timing property of
an exchange that either endpoint can satisfy while the obligation fails, so it sits on that exchange
alone. SRS010<!-- The display page reaches no origin but the backend's --> stays on the payload
relationship, being a property of the whole page rather than of the component that fetches.
SRS005<!-- One validation implementation --> stays untagged for ADR 0020's reason: it reaches the
desk validator, which is outside the boundary for good.

**An item whose observable is composed carries a binding at each depth** — on the framework component
determining it in part, and at container depth where the assembled whole determines it. Which
container-depth subject takes the second is the item's to say, not a rule.
SRS001<!-- A failed module shows why, and only that module -->,
SRS002<!-- A module-scoped configuration error is reported at that module --> and
SRS026<!-- The display says when the backend is gone --> name what a Viewer sees, so theirs is the
relationship that renders.
SRS017<!-- Full-screen assembly at kiosk; reflow, not overlap, at narrower widths --> names a property
of the assembled page rather than of what it shows anyone, so its second binding is the container
element. SRS009<!-- Every source reachable through the backend, statelessly --> is the same shape read
the other way: reachability by the endpoints the boundary contract defines is the route handler's, and
holding no per-client or session state is true of every endpoint, so it sits on both.

**Static serving carries no tag at all.** What it does
is obliged of the backend generally or of the image, and who serves the bundle is a decision under
[ADR 0011](0011-requirement-or-convention.md) rather than a property of the running software —
ADR 0020's reason for leaving the bundle-serving relationship untagged, reaching its endpoint.

**The boundary-crossing relationships are re-declared at their component endpoints**, which is
ADR 0020's declare-once rule applied here exactly as that decision applied it to phase 1's actor
edges. The configuration and bundle exchanges terminate at static serving, each module payload at the
route handler, and the operator's secret supply at the upstream client.

## Alternatives considered

**Mirror the module contract's six parts as the components.** The strongest rival, and the one the
ticket named first: model and contract would be one statement and could never drift. Rejected because
the six parts describe *a module*, not *a container*. The framework machinery the tree spends most of
its backend obligations on —
SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable -->,
SRS012<!-- Request parameters validated against known-good per-source patterns -->,
SRS013<!-- Client-facing contract for rejected requests --> and
SRS014<!-- No single upstream exchange can stall or exhaust the backend --> — would have no box to
sit on, and the level would draw the half of the backend the specification says least about.

**Per-module components now.** Architecturally these are real components and they will be drawn:
five modules, five payload shapes, five configuration fragments, and the contract states their
interface precisely. Rejected on sequencing. ADR 0012 makes a module a need and none is written, so
each box would trace to nothing — the same position ADR 0019 met with the upstreams and answered the
same way. **Premise that would reopen it:** the first module need lands.

**A generic module or shaping placeholder box**, one per container, replaced by the real ones later.
Rejected on ADR 0019's own argument against the aggregate external system: it "belongs to no module,
so it can carry no module's identifier", which forecloses the binding the tag mechanism exists for.
Replacing it later is also restructuring, which is the one thing ADR 0003 authored this model to
avoid.

**The frontend as one unit, with no component view** — the ticket's question of which containers get
none, answered for the container where the terminology collides worst. Rejected because the tree
partitions the page itself:
SRS004<!-- Page renders a legible error state for every configuration failure class --> obliges a
page shell that "shall load and render this state without requiring a valid configuration", which is
a component named by an accepted item and distinguished from everything that needs the configuration
first.

## Consequences

**The model gains one component per module as each module's need lands** — one shaping library in the
backend per **upstream-backed** module, and one Svelte component in the frontend per module. On the
current roster that is three and five, because a local module "has no shaping library, no route
registration and no boundary-schema fragment". The trigger is #76 module-spec procedure, which writes
the first module need. This is scope recorded, not an omission, exactly as ADR 0019 records the
upstream elements it defers.

**All three of ADR 0020's parked items bind here, and its ground for parking them was wrong.** That
decision held that SRS011<!-- Upstream request rate is bounded, and the bound is not
operator-tunable -->, SRS012<!-- Request parameters validated against known-good per-source
patterns --> and SRS013<!-- Client-facing contract for rejected requests --> all "want a relationship
to an upstream" that does not exist. Two are internal by their own text, rejecting a request "without
issuing any upstream request" and "before making any upstream call", and they sit on request
validation. The third is not an upstream's property either: a rate limit is one of the six per-route
values the registration entry carries, and the seam above rules those to be data read by framework
components — so it binds where its two neighbours in that entry, the timeout and the response-size
ceiling, already do. It binds twice, because its distinguishing clause is "regardless of how many
clients it serves or how often they ask", and what decouples client rate from upstream rate is the
response cache while what bounds the residual is the upstream client.

This is a stated ground being found wrong rather than a deferral maturing, so ADR 0020 carries a
dated amendment saying so. Its decision is untouched; only the paragraph parking those three is.

**`index.mmd` and `containers.mmd` are unchanged by the re-declaration.** LikeC4 aggregates a
component-depth edge to the nearest ancestor a view does not expand, so the two levels above render
byte-identically from relationships that now terminate deeper. That is the declare-once rule
producing the property it was adopted for, and it is checked by the staleness gate rather than
asserted here.

**No requirement was baselined by this work.** Every item bound here was already `accepted`, unlike
phase 2, so nothing about the level's arrival asked the owner to accept an item under time pressure.

**The frontend view names the Viewer explicitly.** What that container exists to do terminates at the
Viewer, and that relationship's endpoint here is the module component this decision leaves undrawn,
so `include *` reaches neither and the level would otherwise render without its purpose. A view
predicate compensating for an undrawn element is a seam, and it closes when the module components
land.

**No component carries a `link`.** No source exists and the repository layout is #5 repo layout; each
gains one when the code it describes is written, which is the review obligation
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) carries as its architecture-links question.

**The Mermaid artifact still drops the descriptions**, as ADR 0020 records, and at this level those
descriptions are the whole responsibility statement. What the browser-free artifact cannot show is
carried by the prose in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

**No tag renders, so no tag reaches the staleness gate.** Moving every tag in this model from one
element to another leaves each `.mmd` artifact and `../ARCHITECTURE.md` byte-identical, and
`check-arch` compares exactly those. `check-arch-trace` reads the model rather than the artifact, but
its scope is resolution — that an identifier names an accepted item — which a tag on the wrong element
satisfies completely. The architecture → requirements link is therefore held by review alone, and by
nothing else in the repository. ADR 0019 states this as the ordinary division between a gate and a
reviewer; it is recorded here as a property of the artifact, because a level that multiplies the
elements a tag can sit on multiplies the placements no check can see.
