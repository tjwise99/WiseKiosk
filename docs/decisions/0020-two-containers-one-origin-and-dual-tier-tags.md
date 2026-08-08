# 0020 — Divide WiseKiosk into two containers behind one origin, and tag a boundary-spanning relationship at both tiers

**Status:** accepted
**Decided:** 2026-08-04 (C4 phase 2 design discussion, ticket #97 C4 phase 2 Container)
**Rev:** 1

> **Parking ground corrected, 2026-08-05
> ([ADR 0021 rev 1](0021-component-earns-its-interface-and-framework-half-only.md),
> #98 C4 phase 3).** The Consequences below hold that
> SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable -->,
> SRS012<!-- Request parameters validated against known-good per-source patterns --> and
> SRS013<!-- Client-facing contract for rejected requests --> have nowhere to bind because all three
> "want a relationship to an upstream". That ground is wrong about every item it names. Two reject a
> request before any upstream call is made and never involve an upstream at all; the third names a
> bound carried in a route's registration entry, which the Component level rules to be data read by
> framework components rather than a property of an upstream edge.
>
> **All three bind at the Component level**, and the word *yet* qualified the timing rather than the
> ground. Nothing else here changes: the two containers, the one origin, the declare-once rule and the
> dual-tier tags stand exactly as argued below.

## Revisions

- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

[ADR 0019 rev 1](0019-boundary-at-what-deploys-and-tag-tier.md) settled the boundary and the Context level,
and deliberately left the tier at each level below to the phase that models it. Authoring the
Container level then surfaced two more questions, one of them older than this ticket.

**Who serves the frontend bundle had never been argued.** [ADR 0001 rev 1](0001-backend-language-go.md)
lists static file serving among the backend's duties as a bootstrap given.
[ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) states "served as files by the Go backend" in its
decision but weighs only frameworks against each other.
[ADR 0007 rev 1](0007-config-validation-allocation.md) reasons *from* it — "the page runs in a browser on
the display host, so config bytes reach it only over HTTP, from the origin that already serves the
SPA bundle." Three records lean on the arrangement and none argues it, which is the shape
[ADR 0015 rev 1](0015-container-toolchain-and-image-annotations.md) caught with the container toolchain. A
Container level draws that arrangement, so it either argues it or presumes it a fourth time.

**Where a relationship is declared decides which levels can see it.** LikeC4 renders every level from
one set of relationships, aggregating each to the nearest ancestor a view does not expand. The
committed scaffold demonstrated it: a relationship declared between a container and an external
system rendered at the Context level as an edge from the system. There is therefore no such thing as
restating an edge one level down — an edge belongs to its endpoints, and the levels are projections
of it.

## Decision

**Two containers: `Backend` and `Frontend`.** A C4 container is an execution context, not a shipping
artifact. One published image holds both, but the frontend's code executes in a browser on the
display host — a separate process, and by
SRS019<!-- The backend runs on both supported architectures --> and
SRS021<!-- Frontend runs on a Pi Zero-class browser host --> potentially a separate machine of a
different architecture. They are named for the vocabulary of the prose they are spliced beside rather
than the tree's *display page*, which stays as it is; renaming accepted items is a specification
change and would trade an observable noun for an organisational one.

**The backend serves the bundle and the configuration, and there is exactly one origin.** The system
cannot not have an HTTP server —
SYS004<!-- Upstream data reaches the display only through the backend --> and
SRS009<!-- Every source reachable through the backend, statelessly --> require the proxy to exist —
so the question is never *server or no server* but *one origin or two*.
SRS010<!-- The display page reaches no origin but the backend's --> is enforced by a policy naming
one origin, and every arrangement that serves the page from somewhere else makes the page's own
origin that other host and the backend a second one. Serving is not knowing: a static handler has no
rewrite path and cannot tell the configuration from a script asset, so the config-blindness
[ADR 0007 rev 1](0007-config-validation-allocation.md) holds is preserved exactly by the bytes transiting
the component forbidden to interpret them.

**Each relationship is declared once, at its true endpoints.** The Context level's two actor
relationships are therefore replaced by their container-depth decomposition rather than kept
alongside it, which would assert one fact twice under two labels that can drift.

**Where two relationships share endpoints, the view asks for them separately.** A view renders
parallel relationships as one edge labelled `[...]`, losing every label, and that merge happens in
the computed view rather than in a renderer — Mermaid, D2, PlantUML and the image export all show it.
The view predicate `multiple true` is the request to render each separately, and a `title` overrides
the label of a merge deliberately left in place. Both are used: the Container level asks for the
operator's two supplies and the frontend's two fetches separately, and the Context level keeps one
operator edge under the label that level authors, since naming a container in a view draws it and
would cost the Context level its abstraction.

**The Container level answers to `SRS`, and anything here also carries the `SYS` item it discharges
observably at this level.** An `SRS` item allocates to a container, which is what ADR 0019 rev 1 gave as
its reason for refusing that tier at the Context level, and is the argument for it here.

The second clause is what makes the tier usable rather than a trap. Restricting `SYS` to
relationships that cross the boundary — the shape the actor edges suggest, since those are the ones
rendered at both levels — leaves SYS004<!-- Upstream data reaches the display only through the
backend --> and SYS005<!-- Single-definition internal contract --> with no home at any level: both
name things inside the boundary, so neither fits the Context level, and the restriction bars them
here. Both are discharged observably on one edge, the frontend fetching each module payload, which is
the boundary contract itself; SRS010<!-- The display page reaches no origin but the backend's --> and
SRS016<!-- Both sides consume the generated types --> are their children and sit there too.

**This widens ADR 0019 rev 1 rather than exercising it**, and that record carries a dated amendment saying
so. Its rule was one tier per level; a relationship may now also carry a coarser item, where that
item's obligation is visible in what this level draws. Its rejection of `SRS` at the Context level is
untouched and is why the widening runs in one direction only: a coarser item names something a finer
level can still show, where a finer item names something the coarser level does not draw. The
aggregate an actor edge renders at the Context level is not a counter-example — the relationship's
endpoints are an actor and a container, so its `SRS` tags sit on a container-depth relationship, and
the Context view is a projection of it rather than a place a tag was applied.

**A tag is applied where an accepted item obliges the thing it sits on, and nowhere else.** Three
consequences follow. An item obliging every exchange an element has belongs on the element rather
than on one of its edges — SRS028<!-- Served responses declare their type, and forbid the browser
inferring one --> obliges every response the backend serves, so it sits on the backend. An element or
relationship no accepted item obliges carries none: the bundle-serving edge has no tag, because who
serves the bundle is a decision under [ADR 0011 rev 1](0011-requirement-or-convention.md) rather than a
property of the running software. And an item whose obligation reaches something **permanently**
outside the model is not a tag here — SRS005<!-- One validation implementation --> binds the page to
the desk validator, which ADR 0019 rev 1 keeps outside the boundary for good, so tagging the frontend with
it points past the diagram in the way ADR 0019 rev 1 rejects. Permanence is what that turns on, not
absence: an upstream is *deferred* rather than excluded, and the model gains one per upstream as each
module's need lands, so SRS009<!-- Every source reachable through the backend, statelessly --> stays
on the backend and gains the edges its obligation names when they arrive.

Tags discriminate rather than inventory: the bar is against stamping an element with everything it
owes, which distinguishes nothing, not against a count.

## Alternatives considered

**A reverse proxy in front** — nginx or Caddy serving the bundle and proxying the API. This is the
strongest rival and the one the origin argument does *not* refute: it is single-origin, so
SRS010<!-- The display page reaches no origin but the backend's --> survives it intact, and it is a
common shape in self-hosted deployments. It is refused on delivery. Reaching it means either
publishing several images and a compose file, against the single image
[`../../README.md`](../../README.md) states the product ships — no requirement forbids a second
image, so this leg rests on the product definition rather than on the tree — or supervising a second
process inside one container. Either buys a separation of concerns with no
consumer at one display on a LAN, and adds a configuration surface to a deployment whose operator is
frequently not the author. **Premise that would reopen it:** WiseKiosk grows independently deployed
pieces, at which point the proxy arrives with them. Nothing here stops an operator putting their own
proxy in front of the container; what is refused is shipping one.

**A separate static host or a CDN.** Rejected on the second origin it creates — a widened
`connect-src` and cross-origin requests to the API, against
SRS010<!-- The display page reaches no origin but the backend's --> — and on deployment: it puts an
internet dependency in front of a display that runs unattended on a LAN, and files on a host
[`../../README.md`](../../README.md) states WiseKiosk does not own.

**One container, the image as the unit.** The literal reading of ADR 0019 rev 1's boundary sentence, and it
erases what this level exists to draw: SYS005<!-- Single-definition internal contract --> has no
boundary to be a contract across, SRS010<!-- The display page reaches no origin but the backend's -->
has no page and no origin, and config-blindness has no second party to be blind to.

**The configuration as a third element.** It would make config-blindness structural rather than
something a label states. Rejected: a mounted file is not a running unit, and ADR 0019 rev 1 already
refused to invent an element — the aggregate "Public APIs" — to carry what a relationship can carry.

**Deferring the operator's secret supply until a module needs a secret**, as ADR 0019 rev 1 defers an
upstream. Rejected because what defers an upstream is individuation: an upstream belongs to the
module that reads it and cannot be drawn honestly as one box, whereas
SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> and
SRS007<!-- Configuration schema offers no secret-bearing key --> specify one delivery mechanism
generically today, and the first module that uses a secret adds an upstream element and a route
without changing that relationship. Drawing the configuration and omitting the secrets would also
leave the level answering SYS003<!-- A deployment is parameterised from outside the image --> wrongly
rather than partially, in the direction that invites a credential into the configuration file.

**Keeping every decomposed relationship and accepting `[...]`.** The model would stay maximally
decomposed and each tag precisely bound. Rejected because the committed artifact — what a reader
meets on the repository and the documentation site — would say less than before the decomposition,
and the model is authored to be read.

**`SRS` alone, dropping the `SYS` binding.** The tidier rule, and the tier becomes a strict property
of declaration depth. Rejected: SYS003<!-- A deployment is parameterised from outside the image --> is
the requirement naming configuration *and* secrets as the two things arriving from outside the image,
and the model would then record nowhere why the supplies
it draws are one obligation.

## Consequences

**Two requirements were baselined by this work, by the owner.** SRS026<!-- The display says when the
backend is gone --> and SRS028<!-- Served responses declare their type, and forbid the browser
inferring one --> were `proposed`, and `check-arch-trace` refuses a tag on an unbaselined item.
Binding a requirement to an element is the act of reading it and judging what it obliges, so the
review happened here: both items were put in front of the owner in full and accepted (owner,
2026-08-04). That decision is the record — [ADR 0005 rev 1](0005-traceability-gating.md) reserves
acceptance to a human, and no property of an item can stand in for one. In particular the presence of
a fingerprint, a rationale and a verification method cannot: every `SYS` and `SRS` item still
`proposed` carries all three, so a criterion built from them would baseline those too and leave
`proposed` unreachable.
The five untouched items were not read here and so were not accepted. `status` sits outside the
`reviewed` attribute set, so no fingerprint moved — which is also why the tree carries no trace of
the act, and this paragraph is where it is recorded.

**The Context level renders the labels of the container-depth relationships**, since that is where
they are declared — except the operator edge, which the view labels itself.

**That label is the one thing here not coupled to what it describes.** A view title overrides a
merged connection whether or not a merge remains, so the relationships beneath it can change, or
reduce to one, while it goes on reading as before. No gate compares them: the generated artifact and
the committed one agree, because both are produced from the same override. It is the drift the
declare-once rule above exists to prevent, displaced one layer up, and it is accepted because the
alternatives are worse — naming a container at the Context level draws it, and `[...]` says nothing
at all. **Nothing prompts a re-read of that title; a change to the operator's supplies requires one.**
No review question carries that obligation, which [ADR 0011 rev 1](0011-requirement-or-convention.md) would
route to [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist: one override in one view does
not earn a question every change is walked through. A second view taking a title is the point at
which it does.

**Some obligations have nowhere to bind yet.** SRS011<!-- Upstream request rate is bounded, and the
bound is not operator-tunable -->, SRS012<!-- Request parameters validated against known-good
per-source patterns --> and SRS013<!-- Client-facing contract for rejected requests --> want a
relationship to an upstream, and no upstream element exists until a module need does (ADR 0019 rev 1).

**Neither container carries a `link`.** No source exists and the repository layout is #5 repo layout;
the model gains one per container when it does.

**ADR 0019 rev 1 is exercised, not amended.** It delegated the tier below Context to the phase that models
that level, and this is that phase answering. Its rule that the tier is a property of the level
stands — a relationship spanning two levels answers to two.

**The Mermaid artifact is the poorer of the two renderings.** `codegen mermaid` drops element
descriptions and the icons, which the PNG export keeps, and the descriptions are where each
container's responsibility is written. Images stay outside every gate
([ADR 0003 rev 1](0003-architecture-as-code-likec4.md)); what the browser-free artifact cannot show is
carried by the prose in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
