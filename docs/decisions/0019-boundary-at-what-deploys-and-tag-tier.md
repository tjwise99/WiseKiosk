# 0019 — Draw the boundary at what deploys, earn every element a place, and tag it at the tier its level answers to

**Status:** accepted
**Decided:** 2026-08-04 (C4 phase 1 design discussion, #96 C4 phase 1 System Context; the Container
level the same day, #97 C4 phase 2 Container; the Component level 2026-08-05, #98 C4 phase 3
Component; the binding rule 2026-08-08, #121 allocation completeness; the Deployment level
2026-08-09, #123 C4 phase 4 Deployment)
**Rev:** 3

## Revisions

- **rev 3** — 2026-08-09 — absorbs the Container, Component and Deployment level decisions and the
  requirement-binding completeness rule, which were four records written one slice at a time and each
  correcting the one before it; the amendment blocks and the grounds they reversed are gone, and every
  argument illustrated by the retired SRS005<!-- One validation implementation --> is re-grounded
  (#124 merge the C4 ADRs).
- **rev 2** — 2026-08-09 — corrects a consequence that named a desk validator retired by #129 retire
  the desk configuration validator and a tooling document since deleted; the boundary and the tag-tier
  rule are unchanged (#71 release artifact set).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

[ADR 0003 rev 2](0003-architecture-as-code-likec4.md) makes the LikeC4 model
([`../architecture/README.md`](../architecture/README.md)) the single source of truth for the
architecture. It settles the tooling and leaves the model's own rules unwritten, which means they are
answered differently each time an element is added.

**Which side of the boundary something falls on.** The project builds things that never enter the
published image: the provisioning material shipped with the release artifact set
([ADR 0020 rev 1](0020-release-artifact-set-and-operator-tooling.md)) is authored here and runs
nowhere the system runs. Without a criterion each such case is a fresh argument, and each reaches a
different answer depending on whether "the system" is taken to mean what runs or what the project
owns.

**Which requirement tier an element's tag names.** The tag is the architecture → requirements link,
and ADR 0003 rev 2 states its tier as `SRS` unconditionally. That does not survive contact with the
Context level, where the only element inside the boundary is the system itself and every `SRS` item
allocates below it.

**Who serves the frontend bundle had never been argued.**
[ADR 0001 rev 1](0001-backend-language-go.md) lists static file serving among the backend's duties as
a bootstrap given. [ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) states "served as files
by the Go backend" in its decision but weighs only frameworks against each other.
[ADR 0007 rev 2](0007-config-validation-allocation.md) reasons *from* it — "the page runs in a browser
on the display host, so config bytes reach it only over HTTP, from the origin that already serves the
SPA bundle." Three records lean on the arrangement and none argues it, which is the shape
[ADR 0015 rev 2](0015-container-toolchain-and-image-annotations.md) caught with the container
toolchain. A Container level draws that arrangement, so it either argues it or presumes it a fourth
time.

**Where a relationship is declared decides which levels can see it.** LikeC4 renders every level from
one set of relationships, aggregating each to the nearest ancestor a view does not expand. The
committed scaffold demonstrated it: a relationship declared between a container and an external
system rendered at the Context level as an edge from the system. There is therefore no such thing as
restating an edge one level down — an edge belongs to its endpoints, and the levels are projections
of it.

**The levels above the Component level had a physical test and it does not.** A system is what has its
own owner; a container is an execution context. C4's component has no such test — a grouping of
related functionality behind a well-defined interface, whose only crisp half is the negative one, that
it is not separately deployable or it would be a container. Left there, the level draws whatever the
source tree happens to look like: the folder listing, the layer cake, a box per type. Each is true of
the system and of ten thousand others.

**A second seam is already written down, and its vocabulary collides with the Component level's.**
[`../contracts/module-contract.md`](../contracts/module-contract.md) states a module's six parts, the
direction modules and framework depend in, and that a route's parameter validation, both cache TTLs,
its rate limit, its outbound timeout and its maximum response size live in one registration entry
*and nowhere else*. That is structure in prose. The level either adopts it or derives boundaries
beside it — and it must do so in a repository where *module* is the product's unit, *component* is
already a Svelte file, and *container* already needed disambiguating once.

**Whether the artifact the containers ship in is a subject at all.** C4's deployment diagram maps
containers onto the infrastructure they run on; that much the notation settles. What it does not
settle is whether the published image appears, and the obligations that name the image rather than
anything running turn on the answer.

**Completeness was never on the table beside discrimination.**
[ADR 0005 rev 1](0005-traceability-gating.md) rejected requirement→source design-allocation refs and
routed the duty here in one sentence: "Design allocation, where wanted, belongs to the architecture
model, not the gate system." The model then built a mechanism answering a different question. Every
rule above argues **which** element a tag belongs on, and none of them concerns whether every
requirement lands anywhere at all. Nothing could have noticed: `check-arch-trace` walked tags→tree, so
a requirement the model represents nowhere was invisible to it by construction. The state that reading
met was **31 accepted items, 26 tagged**, five bound nowhere —
SRS005<!-- One validation implementation -->,
SRS007<!-- Configuration schema offers no secret-bearing key -->,
SRS015<!-- One schema, all boundary value classes -->,
SRS020<!-- Non-root container user --> and
SRS025<!-- No secret material in the published image -->. Each absence was defensible and none was
recorded.

## Decision

### The boundary, and the Context level

**The boundary is what deploys** — the published container image and what it serves. The provisioning
material shipped beside it falls outside.

The corollary does the work: **an element appears in the model only where the system exchanges
something with it.** Something outside the boundary that the system never communicates with is not an
external system, it is absent — being built by this project earns nothing. Scope of project and
context of system are different sets, and the model draws the second.

**An upstream data source is modelled individually, and only once the module that reads it has a need
in the tree.** The corollary above does not reach this on its own:
SYS004<!-- Upstream data reaches the display only through the backend --> is accepted and obliges
precisely such an exchange, so "exchanges something with it" would admit an upstream element today.
What defers it is that an upstream belongs to the module that reads it —
[ADR 0012 rev 1](0012-module-requirements-in-tree.md) decomposes a module need by *its upstream* — and
no module need is written, so nothing yet names one. The Context level therefore carries no external
system and gains one per upstream as each module's need lands.

### Two containers behind one origin

**Two containers: `Backend` and `Frontend`.** A C4 container is an execution context, not a shipping
artifact. One published image holds both, but the frontend's code executes in a browser on the display
host — a separate process, and by
SRS019<!-- The backend runs on both supported architectures --> and
SRS021<!-- Frontend runs on a Pi Zero-class browser host --> potentially a separate machine of a
different architecture. They are named for the vocabulary of the prose they are spliced beside rather
than the tree's *display page*, which stays as it is; renaming accepted items is a specification
change and would trade an observable noun for an organisational one.

**The backend serves the bundle and the configuration, and there is exactly one origin.** The system
cannot not have an HTTP server —
SYS004<!-- Upstream data reaches the display only through the backend --> and
SRS009<!-- Every source reachable through the backend, statelessly --> require the proxy to exist — so
the question is never *server or no server* but *one origin or two*.
SRS010<!-- The display page reaches no origin but the backend's --> is enforced by a policy naming one
origin, and every arrangement that serves the page from somewhere else makes the page's own origin
that other host and the backend a second one. Serving is not knowing: a static handler has no rewrite
path and cannot tell the configuration from a script asset, so the config-blindness
[ADR 0007 rev 2](0007-config-validation-allocation.md) holds is preserved exactly by the bytes
transiting the component forbidden to interpret them.

**Each relationship is declared once, at its true endpoints.** The Context level's two actor
relationships are therefore replaced by their container-depth decomposition rather than kept alongside
it, which would assert one fact twice under two labels that can drift. The same rule reaches the
Component level: the boundary-crossing relationships are re-declared at their component endpoints —
the configuration and bundle exchanges terminating at static serving, each module payload at the route
handler, and the operator's secret supply at the upstream client.

**Where two relationships share endpoints, the view asks for them separately.** A view renders
parallel relationships as one edge labelled `[...]`, losing every label, and that merge happens in the
computed view rather than in a renderer — Mermaid, D2, PlantUML and the image export all show it. The
view predicate `multiple true` is the request to render each separately, and a `title` overrides the
label of a merge deliberately left in place. Both are used: the Container level asks for the operator's
two supplies and the frontend's two fetches separately, and the Context level keeps one operator edge
under the label that level authors, since naming a container in a view draws it and would cost the
Context level its abstraction.

### What earns a component

**A component is a responsibility with a nameable interface** — what it exposes, and who calls it.
This is Brown's own test, applied as a test for what earns a place rather than quoted, and it is what
decides the one candidate the module contract most loudly suggests: **the route registry is not a
component.** The contract's "those values live in the entry and nowhere else" is a real and
load-bearing commitment, but nothing calls the registry. It is data the other components read, built
into handlers at startup, and drawing it would put the source tree's shape on a diagram of what runs.
The commitment is recorded in the contract and in [`../ARCHITECTURE.md`](../ARCHITECTURE.md), which is
where a fact about where policy is *written* belongs.

**What executes that entry is a component, and it is the one the registry's absence obscured.** The
same test that excludes the data admits the code reading it: a route handler answers
`GET /api/<source>`, which is what SRS009<!-- Every source reachable through the backend,
statelessly --> obliges and what the frontend's payload fetch terminates on. **Each container has
exactly one such owner** — the route handler in the backend, the page shell in the frontend — and the
remaining components are asked, never asking. Without one, a level has no subject for a relationship
label and its parts appear to call each other, which is a sequence no document states.

The backend's owner carries a second load the frontend's does not: it is where framework code calls
the module's shaping functions, before the upstream request to build it and after to parse the answer.
**So the framework half of the backend cannot serve a payload alone** — a fact this level would
otherwise leave invisible, since the module half it reaches is undrawn.

**The framework/module seam is the contract's, not this record's judgement.** A module's half of a
container is code a module author writes *that runs in that container*: part 1's shaping library in
the backend, part 3's Svelte component in the frontend. Everything else is shared framework,
parameterised per route by part 2's entry. Those six policy values are per-route **data**, and treating
per-route configuration as per-module structure would make request validation, the response cache and
the upstream client all module-owned and leave the framework half empty — against the contract's own
dependency direction, under which framework code "is shared code from the moment it is written". Parts
4 and 5 earn no component either: the boundary-schema fragment belongs to the one schema, which
[ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md) gives to neither side, and the
configuration-schema fragment composes into the one schema the frontend validates against. Part 6 is
tests, which run nowhere in either container and are [`../TESTING.md`](../TESTING.md)'s.

**Only the framework half is drawn.** [ADR 0012 rev 1](0012-module-requirements-in-tree.md) makes a
module a need, and the tree holds no module need, so nothing obliges a module component. This is the
ground for deferring an upstream element, reached one level down and by the same route: the roster in
[`../../README.md`](../../README.md) names all five modules, and naming them is not what earns them a
place.

### What the Deployment level draws

**The Deployment level draws three kinds of subject: hosts, the processes on them, and the files
placed beside them.** Those three are the model's node kinds — `host`, `process`, `artifact` — so a
contributor adding a node chooses from the categories this record names rather than inventing one. The
running container and the browser are both processes; the published image, the configuration file and
the secret files are all artifacts. The nodes are a container host holding the operator's configuration
file, the secret files and the running container; a display host holding the browser; and the published
image. The Backend instance runs in the container, the Frontend instance in the browser.

**The published image is a subject, and it is not the running container.** The obligations on it are
obligations on the artifact as published, and the requirements say so in their own text:
SRS020<!-- Non-root container user -->'s `verification-justification` states that "a deployment can
override the user, and no property of the image prevents it", and
SRS025<!-- No secret material in the published image --> and
SRS018<!-- One generic published image --> are settled by exporting the image rather than by observing
anything running. Binding them to the running container would assert precisely what those items
disclaim.

**The configuration file and the secret files are nodes.** A mounted file is not a running unit, which
is why the Container level refuses the configuration a container element — but that is a
container-level objection, a container being an execution context, and it does not reach a level whose
subject is what sits at the deployment site. Without them the level draws nothing the Container level
does not, and SYS003<!-- A deployment is parameterised from outside the image --> has no observable
here.

**The provisioning tooling gains no element.** The test is the one the boundary states: a tool that
acted on the running deployment would gain an element. The test returns no, and the release artifact
set ([ADR 0020 rev 1](0020-release-artifact-set-and-operator-tooling.md)) is why it does not even need
arguing — that decision ships **no operator tooling program at all**, only a deployment recipe and an
example configuration file. A recipe an operator runs to bring a deployment into existence is not a
tool acting on one that is running, and there is no second candidate to weigh.

**One view, not one per node.** A view per host carries three boxes, and each view costs a generated
artifact and a splice marker in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

**The two hosts are roles.** They have different floors, and one machine meeting both may carry both.
In the configuration being built for it cannot: the display host was read before this was argued —
`armv6l`, one core, 432 MB — and while a container runtime is packaged for it, the one that is
predates the image format and the `HEALTHCHECK` the published image declares. So it is below the floor
for running *this image*, which is the floor that matters, and the two roles are necessarily separate
machines there. Stating it as "that host cannot run containers" would be false and is the sort of
host-capability claim SRS019<!-- The backend runs on both supported architectures --> declines to
make. The frontend runs "potentially a separate machine of a different architecture"; for at least one
supported configuration that is stronger than *potentially*, and the node descriptions carry it rather
than the model asserting two machines as a rule.

### Where a tag sits

**A tag carries the Doorstop id of the requirement obliging the element or relationship it sits on, at
the tier its level answers to.** The Context level answers to `SYS`; the Container, Component and
Deployment levels answer to `SRS`. An `SRS` item allocates to a container, which is the reason for
refusing that tier at the Context level and the argument for it at every level below — and at the
Deployment level for the same reason read outward, an obligation on a host or an artifact being
`SRS`-shaped.

**An element or relationship also carries any coarser item it discharges observably at that level.**
Restricting `SYS` to relationships that cross the boundary — the shape the actor edges suggest, since
those are the ones rendered at both levels — leaves
SYS004<!-- Upstream data reaches the display only through the backend --> and
SYS005<!-- Single-definition internal contract --> with no home at any level: both name things inside
the boundary, so neither fits the Context level, and the restriction bars them from the level that
does draw them. Both are discharged observably on one edge, the frontend fetching each module payload,
which is the boundary contract itself; SRS010<!-- The display page reaches no origin but the
backend's --> and SRS016<!-- Both sides consume the generated types --> are their children and sit
there too. At the Deployment level the mount edges are where
SYS003<!-- A deployment is parameterised from outside the image --> is watched rather than argued.

The widening runs in one direction only: a coarser item names something a finer level can still show,
where a finer item names something the coarser level does not draw. The aggregate an actor edge
renders at the Context level is not a counter-example — the relationship's endpoints are an actor and a
container, so its `SRS` tags sit on a container-depth relationship, and the Context view is a
projection of it rather than a place a tag was applied. **The tier is a property of the level, not of
the mechanism**, and a relationship spanning two levels answers to two.

**A tag binds where the obligation is observable at that level**, which at the Context level is on the
relationships rather than on the system element — that element owes every `SYS` item, so tagging it
distinguishes none of them. Depth does not make the finer placement the right one: an item quantifying
over every output a container produces belongs on the container even where components are drawn
beneath it.

**A tag is applied where an accepted item obliges the thing it sits on, and nowhere else.** Three
consequences follow.

- An item obliging every exchange an element has belongs on the element rather than on one of its
  edges — SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->
  obliges every response the backend serves, so it sits on the backend.
- An element or relationship no accepted item obliges carries none: the bundle-serving edge has no
  tag, because who serves the bundle is a decision under
  [ADR 0011 rev 1](0011-requirement-or-convention.md) rather than a property of the running software.
  Static serving carries no tag at all for the same reason, what it does being obliged of the backend
  generally or of the image.
- An item whose obligation reaches something **permanently** outside the model is not a tag here,
  because it would point past the diagram carrying it. **No item in the tree has that shape**: the one
  that did, SRS005<!-- One validation implementation -->, retired with the desk validator it obliged
  (#129 retire the desk configuration validator). The clause is kept because permanence is what it
  turns on, not absence — an upstream is *deferred* rather than excluded, and the model gains one per
  upstream as each module's need lands, so SRS009<!-- Every source reachable through the backend,
  statelessly --> stays on the backend and gains the edges its obligation names when they arrive.

**An item whose observable is composed carries a binding at each depth** — on the component determining
it in part, and at container depth where the assembled whole determines it. Which container-depth
subject takes the second is the item's to say, not a rule.

**Tags discriminate rather than inventory**: the bar is against stamping an element with everything it
owes, which distinguishes nothing, not against a count. A subject accumulating tags is the signal to
argue the next addition rather than assume it.

### Every accepted item binds

**Every accepted, active `SYS` or `SRS` item binds to at least one element or relationship in the
architecture model. Where an item can bind nowhere, the model grows to draw what it obliges — the rule
does not bend, and there is no exemption record.**

**The population is the obliging tiers, `accepted` and `active`, and each of those three words is
load-bearing rather than a convenience.** `check-arch-trace` resolves a tag only to an accepted item,
so a `proposed` item cannot be tagged and a rule reaching it would be unsatisfiable. A retired item
obliges nothing — and retirement here is `active: false` with `status` untouched
([ADR 0005 rev 1](0005-traceability-gating.md)), so a retired item stays `accepted` and the second word
does not imply the third. **`TST` is out of the population**, which the tree's third document makes
worth saying: a verification item states how an obligation is settled, not an obligation on the running
software, so it allocates to nothing in a model of what runs. `check-arch-trace`'s identifier pattern
admits `TST` because it judges resolution rather than allocation; this rule does not inherit that reach.

**This adds completeness to discrimination and changes neither the tier rules nor the placement
rules.** Where a tag sits is settled above; this says only that the set of items bound nowhere is
empty. Discrimination and completeness are orthogonal, and the levels won the first before the second
was put on the table.

### The contested placements

The judgements below are the ones that were argued, not an inventory of every tag: nothing compares a
list here against the model, so a complete one would be wrong the moment a tag moves. Each is a
placement no check can decide.

**What a Viewer sees.** SRS001<!-- A failed module shows why, and only that module -->,
SRS002<!-- A module-scoped configuration error is reported at that module --> and
SRS026<!-- The display says when the backend is gone --> name what a Viewer sees, so their second
binding is the relationship that renders.
SRS004<!-- Page renders a legible error state for every configuration failure class --> sits at two
depths for the same reason — a plain-language error state naming which failure occurred is what a
Viewer sees, and a page shell that loads without requiring a valid configuration is a property of one
component. SYS001<!-- Failure is legible and proportionate -->'s `verification-justification` names
those four items as one set, and they sit on that relationship together.

**The layout pair.** SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at
narrower widths --> names a property of the assembled page rather than of what it shows anyone, so its
second binding is the container element, while its parent
SYS002<!-- The display's rendering keeps nothing from a viewer --> sits on the render relationship.
Read as a contradiction twice, so the distinction is recorded. It bites only if the two are
co-extensive, and they are not: **the parent is under-decomposed** (owner, 2026-08-08). The child
covers the geometry half — regions that do not overlap, content that is not clipped, reflow rather
than horizontal scrolling — and what the parent obliges beyond that is how the assembled display reads
to the person in front of it. **The parent therefore sits where its decomposition will land, rather
than as a coarser copy of the child.** What that decomposition contains is #132 under-decomposition of
the layout need's to settle, and a ruling there that the parent is *not* under-decomposed reopens this
placement — by arguing a different subject, not by removing the binding.

A ground that reads well and is wrong, recorded because two readers reached it: not *the child is
decidable geometry while the parent is what a person sees*. SYS002's<!-- The display's rendering keeps
nothing from a viewer --> own `rationale` absorbs no-overlap, no-clipping and no-scrollbars "as one
property rather than three observables", and its `verification-justification` opens "Geometry is
decidable" — so the parent is geometry too, and measurable too. The axis is what each obliges, not
whether anyone has to watch.

**The boundary crossing.** SRS010<!-- The display page reaches no origin but the backend's --> stays
on the payload relationship, being a property of the whole page rather than of the component that
fetches. SRS015<!-- One schema, all boundary value classes --> sits there too, where its parent
SYS005<!-- Single-definition internal contract --> and its only sibling
SRS016<!-- Both sides consume the generated types --> already are: its middle clause quantifies over
"every value crossing the boundary, including those a module contributes", and that relationship is
the boundary being crossed. SRS003<!-- A configuration change applies no later than the next page
load --> is a timing property of an exchange that either endpoint can satisfy while the obligation
fails, so it sits on that exchange alone.

**The request path.** SRS011<!-- Upstream request rate is bounded, and the bound is not
operator-tunable -->, SRS012<!-- Request parameters validated against known-good per-source
patterns --> and SRS013<!-- Client-facing contract for rejected requests --> bind at the Component
level. Two reject a request "without issuing any upstream request" and "before making any upstream
call", and they sit on request validation. A rate limit is one of the six per-route values the
registration entry carries, which the seam above rules to be data read by framework components, so it
binds where its two neighbours in that entry — the timeout and the response-size ceiling — already do:
twice, because its distinguishing clause is "regardless of how many clients it serves or how often
they ask", and what decouples client rate from upstream rate is the response cache while what bounds
the residual is the upstream client. SRS013<!-- Client-facing contract for rejected requests --> also
binds twice, keeping request validation and gaining the payload relationship: its text is a boundary
obligation asserted at the boundary, which is the composed-observable rule rather than a second
subject for one observable.

SRS009<!-- Every source reachable through the backend, statelessly --> is the same shape read the other
way: reachability by the endpoints the boundary contract defines is the route handler's, and holding no
per-client or session state is true of every endpoint, so it sits on both.
SRS008<!-- No secret value in any backend output --> and
SRS028<!-- Served responses declare their type, and forbid the browser inferring one --> quantify over
every output and every response, so they sit on the container.

**The operator's supplies.** SRS007<!-- Configuration schema offers no secret-bearing key --> binds on
the operator's configuration supply. Its second clause obliges delivery — "the delivered configuration
shall be secret-free by construction, not by a redaction step" — and that relationship is the delivery.
It discriminates, because the operator's *other* supply is where a secret does travel, and this is the
item saying the two cannot be one. The strongest counter is that its first clause obliges the
configuration *schema's key set*, and its `verification-justification` settles that against a committed
allowlist rather than against anything a delivery shows. **That objection mistakes verification for
observability: a tag records where an obligation is observable, not where it is settled.** The
distinction is recorded because it is the general answer rather than this item's detail — without it,
the next close call is argued from an item's `verification-justification` and this trade is walked
again.

SRS035<!-- The masked edge band is the deployment's to declare --> binds on the configuration file: its
first clause obliges the deployment's configuration to supply the band depth, and that file is the
deployment supplying it. Its second clause — the page assuming no band where none is supplied — is a
Frontend observable, and #135 bind the mirror and legibility requirements places it if that ticket
judges the split real.

**The published image.** SRS020<!-- Non-root container user -->,
SRS025<!-- No secret material in the published image --> and
SRS018<!-- One generic published image --> bind on the published image.
SRS019<!-- The backend runs on both supported architectures --> binds there too, and not on any host:
it obliges WiseKiosk rather than a host — its own `rationale` forbids reading it "as a fact about the
host, because a host's capabilities are not ours to require" — its `verification-justification` settles
it by "building for both architectures", which is an observation of the artifact, and **"both" cannot
be witnessed on a host at all**, any one host being of one architecture. The container host carries no
tag: the architectures it must be one of are the image's property, not an obligation this project
places on the operator's hardware (owner, 2026-08-09).

SRS021<!-- Frontend runs on a Pi Zero-class browser host --> binds at both depths, on the Frontend
container and on the display host. The bundle must be built for what that device's browser and
compatibility layers accept, which is a property of the Frontend; the device being Pi Zero-class is a
property of the deployment.

## Alternatives considered

### The boundary

**Boundary at what the project authors and ships**, putting the provisioning material inside. It would
make the whole of what this project produces visible in one model, which is what a reader who came
looking for the release artifact set would expect. Rejected: it costs a Container level holding
something that is not in the image and does not run on the display host, so "one published container
image" would stop being what the system element means — and a level of execution contexts would carry
a recipe and an example file, which execute nowhere.

**One aggregate external system for the upstreams**, as the committed scaffold carried. Rejected:
configuration selects which of the shipped modules render and where, and never names an upstream, so
the set is specification rather than deployment configuration and is bounded by the module roster in
[`../../README.md`](../../README.md). An aggregate element also belongs to no module, so it can carry
no module's identifier — which forecloses the binding the tag mechanism exists for.

### The containers

**A reverse proxy in front** — nginx or Caddy serving the bundle and proxying the API. This is the
strongest rival and the one the origin argument does *not* refute: it is single-origin, so
SRS010<!-- The display page reaches no origin but the backend's --> survives it intact, and it is a
common shape in self-hosted deployments. It is refused on delivery. Reaching it means either publishing
several images and a compose file, against the single image [`../../README.md`](../../README.md) states
the product ships — no requirement forbids a second image, so this leg rests on the product definition
rather than on the tree — or supervising a second process inside one container. Either buys a
separation of concerns with no consumer at one display on a LAN, and adds a configuration surface to a
deployment whose operator is frequently not the author. **Premise that would reopen it:** WiseKiosk
grows independently deployed pieces, at which point the proxy arrives with them. Nothing here stops an
operator putting their own proxy in front of the container; what is refused is shipping one.

**A separate static host or a CDN.** Rejected on the second origin it creates — a widened `connect-src`
and cross-origin requests to the API, against
SRS010<!-- The display page reaches no origin but the backend's --> — and on deployment: it puts an
internet dependency in front of a display that runs unattended on a LAN, and files on a host
[`../../README.md`](../../README.md) states WiseKiosk does not own.

**One container, the image as the unit.** The literal reading of the boundary sentence, and it erases
what the Container level exists to draw: SYS005<!-- Single-definition internal contract --> has no
boundary to be a contract across, SRS010<!-- The display page reaches no origin but the backend's -->
has no page and no origin, and config-blindness has no second party to be blind to.

**The configuration as a third container.** It would make config-blindness structural rather than
something a label states. Rejected: a mounted file is not a running unit, and inventing an element to
carry what a relationship can carry is what the aggregate external system was refused for. The
Deployment level draws that file, where the subject is what sits at the deployment site rather than
what executes.

**Deferring the operator's secret supply until a module needs a secret**, as an upstream is deferred.
Rejected because what defers an upstream is individuation: an upstream belongs to the module that
reads it and cannot be drawn honestly as one box, whereas
SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> and
SRS007<!-- Configuration schema offers no secret-bearing key --> specify one delivery mechanism
generically today, and the first module that uses a secret adds an upstream element and a route without
changing that relationship. Drawing the configuration and omitting the secrets would also leave the
level answering SYS003<!-- A deployment is parameterised from outside the image --> wrongly rather than
partially, in the direction that invites a credential into the configuration file.

**Keeping every decomposed relationship and accepting `[...]`.** The model would stay maximally
decomposed and each tag precisely bound. Rejected because the committed artifact — what a reader meets
on the repository and the documentation site — would say less than before the decomposition, and the
model is authored to be read.

### The components

**Mirror the module contract's six parts as the components.** The strongest rival: model and contract
would be one statement and could never drift. Rejected because the six parts describe *a module*, not
*a container*. The framework machinery the tree spends most of its backend obligations on —
SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable -->,
SRS012<!-- Request parameters validated against known-good per-source patterns -->,
SRS013<!-- Client-facing contract for rejected requests --> and
SRS014<!-- No single upstream exchange can stall or exhaust the backend --> — would have no box to sit
on, and the level would draw the half of the backend the specification says least about.

**Per-module components immediately.** Architecturally these are real components and they will be
drawn: five modules, five payload shapes, five configuration fragments, and the contract states their
interface precisely. Rejected on sequencing.
[ADR 0012 rev 1](0012-module-requirements-in-tree.md) makes a module a need and none is written, so each
box would trace to nothing — the same position the upstreams met, answered the same way. **Premise that
would reopen it:** the first module need lands.

**A generic module or shaping placeholder box**, one per container, replaced by the real ones later.
Rejected on the argument against the aggregate external system: it belongs to no module, so it can
carry no module's identifier, which forecloses the binding the tag mechanism exists for. Replacing it
later is also restructuring, which is the one thing ADR 0003 rev 2 authored this model to avoid.

**The frontend as one unit, with no component view** — answered for the container where the
terminology collides worst. Rejected because the tree partitions the page itself:
SRS004<!-- Page renders a legible error state for every configuration failure class --> obliges a page
shell that "shall load and render this state without requiring a valid configuration", which is a
component named by an accepted item and distinguished from everything that needs the configuration
first.

### The deployment

**Bind the three image items to the running container**, with a description saying it runs an instance
of the image, and draw no image node. The strongest rival: it keeps the level to things that run, which
is what a deployment diagram is usually taken to be. Rejected on the requirements' own text — the
sentence in SRS020<!-- Non-root container user --> quoted above exists precisely to say the running
process is not the subject. The description cannot carry the difference either: `check-arch-trace` reads
tags, so the model would assert the false claim and the check would agree. That is the cheap failure the
binding rule names — the plausible tag on an element that already exists — arrived at by exactly the
reasoning it predicted.

**Draw the image with its contents inside it**, a node each for the backend binary and the frontend
bundle, so that one image reaching two destinations is visible on the page rather than carried by edge
labels. Genuinely better at the one thing it was built to do, and it was built and rendered before
being rejected (owner, 2026-08-09). Rejected as clutter, and because structure drawn inside a thing
that does not run invites the node to grow into a packing list of the image — an inventory kept in step
by nothing, which is the failure [`../ARCHITECTURE.md`](../ARCHITECTURE.md) already argues against in
the other direction. What survives is the content: the image's `description` enumerates what it
carries.

**Leave SRS018<!-- One generic published image --> on the operator's configuration edge**, where it sat
for want of an image element, and give it no second home. Rejected: that placement's stated reason was
the absence of an image, and drawing one removes it. Its binding therefore **moves** rather than
doubling — a second home would leave two subjects where the item has one — and keeping it would leave
the record asserting a workaround as a positive choice.

**Bind SRS019<!-- The backend runs on both supported architectures --> to the container host.** Held for
most of that slice, on the ground that the width floor belongs to the container runtime rather than to
the backend: a runtime needs 64 bits, no 32-bit image is published, and the backend never runs outside
the container. Rejected once that ground was tested. It is not generally true — 32-bit container
runtimes exist and are packaged for `armhf`, including on the display host this project deploys to —
and the version that is installable there predates OCI images, manifest lists and the `HEALTHCHECK` the
published image declares, so what it establishes is that the *image* cannot be run by it rather than
that the host cannot run a runtime. That is the item's own distinction, and a host node cannot witness
"both" in any case. Binding it there would also have made it the only one of the six whose sole subject
lies outside the boundary, where SYS007<!-- The declared minimum host, and staying within it --> puts
the hosts.

What the rejected ground does establish is a question this record does not answer: whether amd64 and
arm64 are the right set for that item to name. That is the requirement's content, changed by a
specification change with its own verification, not by where a tag sits.

**Wait for the release artifact set to define what ships**, before drawing a level that draws what
ships. Rejected: what a release carries is material a registry and a release tag hold rather than
anything that runs on a host, the level draws what runs where, and the one real coupling — whether
provisioning tooling appears — is decided by the boundary test rather than by the artifact set. The set
[ADR 0020 rev 1](0020-release-artifact-set-and-operator-tooling.md) defined ships no operator tooling
program, so waiting would have changed nothing drawn.

### The tag rules

**`SRS` at every level**, as ADR 0003 rev 2 assumes. Rejected: at the Context level it forces a choice
between attaching every `SRS` id to the single system element and picking an arbitrary few, and neither
is a link a reader can trust. Binding `SRS` to a *relationship* does not escape it either, which is the
form this record's own mechanism would otherwise invite: an `SRS` item allocates to a container, so
tagging an edge at the Context level with one names an obligation on something that level does not
draw — the link points past the diagram carrying it, and nothing a reader of that level can see either
confirms or contradicts it.

**One strict tier per level**, the tidier rule, under which a tag's tier is a property of declaration
depth alone. Rejected: it leaves
SYS004<!-- Upstream data reaches the display only through the backend --> and
SYS005<!-- Single-definition internal contract --> homeless. Both name things inside the boundary, so
neither fits the Context level, and a strict reading bars them from the level that does draw them. The
same rule read at the Container level drops the `SYS` binding entirely, and then
SYS003<!-- A deployment is parameterised from outside the image --> — the requirement naming
configuration *and* secrets as the two things arriving from outside the image — has nowhere to record
that the supplies drawn there are one obligation.

**Tagging an element with every id it owes.** Rejected: true, and it carries no information — the system
element owing all seven `SYS` items restates that the `SYS` tier is the tier about the system.

### The binding rule

**An exemption record: every unbound item carries an entry naming a category and a reason.** The
strongest rival, and what #122 close check-arch-trace's second direction was scoped to build. Rejected
on its population. The candidate vocabulary was *enabling system*, *design-time artifact*, *deployment
artifact* and *deferred*; walking the five items emptied three of those four.
SRS007<!-- Configuration schema offers no secret-bearing key --> and
SRS015<!-- One schema, all boundary value classes --> bind, so *design-time artifact* has no member.
*Deferred* has none and arguably never could — the module and upstream deferrals this record makes are
deferred **elements**, not unbound requirements, and no accepted item is unbound because a module
component is undrawn. SRS005<!-- One validation implementation --> retires, so *enabling system* has
none. What remained was two items that bind the moment the Deployment level lands, and none of the five
`proposed` items looks unbindable either.

So the mechanism would have been built to hold two entries for the length of one slice. The deciding
argument is the owner's: **the gap is an artefact of a specification that has not yet defined its
modules, not a permanent class of unbindable requirement**, and building a mechanism around scaffolding
is how scaffolding becomes load-bearing. Against it stands the honest cost — an escape hatch is the
pressure valve that lets a reviewer record *this obliges something the model should not draw* instead of
drawing it badly, which is a real risk given how hard this record works to refuse inventing an element.
That risk is answered by the reopen premise below rather than dismissed. The hatch never built cannot
rot into an allowlist, which was that ticket's own first-named trap and
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s narrowed-guards question.

**No completeness obligation**, on the ground that the model is a communication artifact and C4 supplies
no such rule. Honest, and it is the position the repository held. Rejected because it leaves
ADR 0005 rev 1's routed duty discharged by nobody: that record rejected design-allocation refs partly
*because* the model would carry the link, and a model that owes nothing carries it in name only. It also
declines the only reading under which the five absences were a finding rather than a preference.

**Draw the Deployment level first, then write this rule**, so it is true of the tree the moment it is
written. Rejected on sequencing: the rule is what tells that level which requirements it must
accommodate, and deciding the rule after the level that answers it would let the level's convenience
choose the rule. The order taken is decide, make true, enforce.

**Bind SRS020<!-- Non-root container user --> to the Backend container**, on the argument that the thing
running under a uid is that container. Rejected: it is the image's property, not the running process's,
and the Deployment level would then either move the tag or argue why it stayed — this effort writing
itself a correction, which is the one outcome the integration branch exists to prevent.

## Consequences

### The model

**A tool the project ships is not thereby in the model.** Something this project builds that the system
never exchanges anything with is absent rather than external. A tool that acted on the running
deployment would gain an element; the provisioning material shipped with the release artifact set does
not, and what ships beside the image is [`../DEPLOYMENT.md`](../DEPLOYMENT.md)'s.

**The model carries a subject that does not run**, and a reader meeting the published image node needs
the reason. It is in the node's `description` and in this record; nothing gates it.

**The model gains one component per module as each module's need lands** — one shaping library in the
backend per **upstream-backed** module, and one Svelte component in the frontend per module. On the
current roster that is three and five, because a local module "has no shaping library, no route
registration and no boundary-schema fragment". The trigger is #76 module-spec procedure, which writes
the first module need. This is scope recorded, not an omission, exactly as the deferred upstream
elements are.

**The frontend view names the Viewer explicitly.** What that container exists to do terminates at the
Viewer, and that relationship's endpoint is the module component this record leaves undrawn, so
`include *` reaches neither and the level would otherwise render without its purpose. A view predicate
compensating for an undrawn element is a seam, and it closes when the module components land.

**No element carries a `link`.** No source exists and the repository layout is #5 repo layout; each
container and component gains one when the code it describes is written, which is the review obligation
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) carries as its architecture-links question.

**The Context level renders the labels of the container-depth relationships**, since that is where they
are declared — except the operator edge, which the view labels itself. **That label is the one thing
here not coupled to what it describes.** A view title overrides a merged connection whether or not a
merge remains, so the relationships beneath it can change, or reduce to one, while it goes on reading
as before. No gate compares them: the generated artifact and the committed one agree, because both are
produced from the same override. It is the drift the declare-once rule exists to prevent, displaced one
layer up, and it is accepted because the alternatives are worse — naming a container at the Context
level draws it, and `[...]` says nothing at all. **Nothing prompts a re-read of that title; a change to
the operator's supplies requires one.** No review question carries that obligation, which
[ADR 0011 rev 1](0011-requirement-or-convention.md) would route to
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist: one override in one view does not earn a
question every change is walked through. A second view taking a title is the point at which it does.

**The levels above a re-declared edge render byte-identically.** LikeC4 aggregates a component-depth
edge to the nearest ancestor a view does not expand, so `index.mmd` and `containers.mmd` are unchanged
by the boundary-crossing relationships terminating deeper. That is the declare-once rule producing the
property it was adopted for, and it is checked by the staleness gate rather than asserted here.

**The Mermaid artifact is the poorer of the two renderings.** `codegen mermaid` drops element
descriptions and the icons, which the PNG export keeps, and at the Component level those descriptions
are the whole responsibility statement. Images stay outside every gate (ADR 0003 rev 2); what the
browser-free artifact cannot show is carried by the prose in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

### The requirements tree

**Two requirements were baselined by the Container level's work, by the owner.**
SRS026<!-- The display says when the backend is gone --> and
SRS028<!-- Served responses declare their type, and forbid the browser inferring one --> were
`proposed`, and `check-arch-trace` refuses a tag on an unbaselined item. Binding a requirement to an
element is the act of reading it and judging what it obliges, so the review happened there: both items
were put in front of the owner in full and accepted (owner, 2026-08-04). That decision is the record —
[ADR 0005 rev 1](0005-traceability-gating.md) reserves acceptance to a human, and no property of an
item can stand in for one. In particular the presence of a fingerprint, a rationale and a verification
method cannot: every `SYS` and `SRS` item still `proposed` carries all three, so a criterion built from
them would baseline those too and leave `proposed` unreachable. The untouched items were not read and
so were not accepted. `status` sits outside the `reviewed` attribute set, so no fingerprint moved —
which is also why the tree carries no trace of the act, and this paragraph is where it is recorded. The
Component and Deployment levels baselined nothing: every item they bound was already `accepted`.

**Acceptance carries an allocation obligation.** Baselining an item is already the act of reading it and
judging what it obliges; it also requires deciding where that obligation is observable, or that the
model must grow first. Five `SYS` and `SRS` items are `proposed` and each acquires this when accepted;
the `TST` tier acquires nothing, being outside the population.

**The model's element set answers to the tree, in one narrow way.** An accepted item whose subject
nothing draws is a reason to extend the model. That pressure is bounded — the rule requires each item to
bind to *something*, not to have an element of its own, and existing elements and relationships absorb
almost everything — but it is real, and it is the opposite of the direction this record pushes when it
refuses an aggregate external system and a placeholder module box.

**The Deployment level is where a host obligation goes, and that is a new pull.** No item exercises it —
SRS019<!-- The backend runs on both supported architectures --> looked like one and turned out to oblige
the artifact instead, which is the pull's first test and a useful one. An item naming a host, a mount or
an artifact has somewhere to sit, and the pressure to bind it to a container is gone. The opposite
pressure arrives with it: an item genuinely about an execution context can be parked on a host because
the host is the more concrete-sounding subject.

**Premise that would reopen the binding rule:** an accepted item whose subject the model cannot draw
without inventing an element that earns no place under the interface test. At that point the exemption
record is back on the table, argued against a real case rather than an anticipated one.

### What no check sees

**The tags are gated on resolution, not on judgement.** `check-arch-trace` reads the model through
`likec4 export json` and fails a tag naming no item, a retired or unaccepted one, or a mis-cased
identifier; its second direction fails an accepted, active obliging item tagged nowhere. Whether the
tagged element is the one that requirement obliges, and whether the tier suits the level, are review's —
the ordinary division here, not an exception for this gate.

**No tag renders, so no tag reaches the staleness gate.** Moving every tag in this model from one
element to another leaves each `.mmd` artifact and [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
byte-identical, and `check-arch` compares exactly those. The architecture → requirements link is
therefore held by review alone, and by nothing else in the repository. It is recorded as a property of
the artifact, because a level that multiplies the elements a tag can sit on multiplies the placements
no check can see.

**The completeness rule's cheap failure is invisible for the same reason, and it is the likelier of the
two.** Inventing an element is the visible way to satisfy a rule that cannot be satisfied honestly; the
cheap way is a plausible-but-wrong tag on an element that already exists. An exemption record would have
surfaced that situation as a written entry someone reads; this rule surfaces it as a green check. **No
question in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist asks it**, so review here means
a reader who happens to look rather than one who is prompted. That gap is named rather than left for the
first person to find it; a rule creating two pressures and answering one has not been thought through.
Closing it is a checklist edit, and it is not made here because inserting a question renumbers the ones
below it, and [`../requirements/README.md`](../requirements/README.md),
[`../../scripts/README.md`](../../scripts/README.md),
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) itself and open tickets all cite question numbers.

**The completeness direction needs no seeded defect fixture.** It fails on the tree's real state
wherever an accepted, active item is bound nowhere, which is better evidence than a seed. The legal
direction still needs one, and
[ADR 0010 rev 1](0010-runtime-materialised-gate-fixtures.md) is the mechanism.

### The record this one corrects

**ADR 0003 rev 2 is corrected in part and superseded in part.** Its reservation of tags as the
architecture → requirements mechanism stands; the assumption that the tier is always `SRS` falls. Its
ruling that the Component level would not be built is reversed rather than re-grounded, and is therefore
superseded by this record — recorded by revving that document, which is what
[`README.md`](README.md) requires of a supersession. The ground it gave was that building the level
early is an abstraction with a single implementation and no second consumer, citing
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s generality question. That question asks whether an
*interface or extension point* has a second consumer, because an abstraction built for one caller
constrains the code that must satisfy it. A view constrains nothing: it is a description, it compiles to
a picture, and deleting it changes no behaviour. Applying a generality rule to a drawing would bar every
design document in this repository from preceding its implementation, which is the order
`CONTRIBUTING.md` opens by requiring. **The Code level's deferral is untouched** — nothing built it —
and the rest of ADR 0003 rev 2, the tooling and the staleness gate, stands.
