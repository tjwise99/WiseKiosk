# 0020 — Divide WiseKiosk into two containers behind one origin, and tag a boundary-spanning relationship at both tiers

**Status:** accepted
**Decided:** 2026-08-04 (C4 phase 2 design discussion, ticket #97 C4 phase 2 Container)

## Context

[ADR 0019](0019-boundary-at-what-deploys-and-tag-tier.md) settled the boundary and the Context level,
and deliberately left the tier at each level below to the phase that models it. Authoring the
Container level then surfaced two more questions, one of them older than this ticket.

**Who serves the frontend bundle had never been argued.** [ADR 0001](0001-backend-language-go.md)
lists static file serving among the backend's duties as a bootstrap given.
[ADR 0018](0018-frontend-svelte-vite-static-spa.md) states "served as files by the Go backend" in its
decision but weighs only frameworks against each other.
[ADR 0007](0007-config-validation-allocation.md) reasons *from* it — "the page runs in a browser on
the display host, so config bytes reach it only over HTTP, from the origin that already serves the
SPA bundle." Three records lean on the arrangement and none argues it, which is the shape
[ADR 0015](0015-container-toolchain-and-image-annotations.md) caught with the container toolchain. A
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
[ADR 0007](0007-config-validation-allocation.md) holds is preserved exactly by the bytes transiting
the component forbidden to interpret them.

**Each relationship is declared once, at its true endpoints.** The Context level's two actor
relationships are therefore replaced by their container-depth decomposition rather than kept
alongside it, which would assert one fact twice under two labels that can drift.

**Where two relationships share endpoints they are authored as one, carrying a two-part label.** The
view computation merges parallel relationships into a single edge labelled `[...]` in every renderer,
so a decomposition that collides is invisible in exactly the artifact it was drawn for. The tree
supports the merge rather than merely tolerating it:
SYS003<!-- A deployment is parameterised from outside the image --> states the operator's two
supplies as one obligation with two parts, and the entire content of
SRS010<!-- The display page reaches no origin but the backend's --> is that one origin exists.

**The Container level answers to `SRS`, and a relationship spanning the boundary carries both tiers.**
An `SRS` item allocates to a container, which is what ADR 0019 gave as its reason for refusing that
tier at the Context level, and is the argument for it here. A relationship declared between an actor
and a container is rendered at both levels, so it answers to both and carries the `SYS` item it
discharges beside the `SRS` item specialising it.

**A tag is applied where an accepted item obliges the thing it sits on.** Two consequences follow.
Tags discriminate rather than inventory — the bar is against stamping an element with everything it
owes, not against a count, so a merged edge carrying genuinely coupled obligations carries all of
them. And an element or relationship no accepted item obliges carries none: the bundle-serving edge
has no tag, because who serves the bundle is a decision under
[ADR 0011](0011-requirement-or-convention.md) rather than a property of the running software.

## Alternatives considered

**A reverse proxy in front** — nginx or Caddy serving the bundle and proxying the API. This is the
strongest rival and the one the origin argument does *not* refute: it is single-origin, so
SRS010<!-- The display page reaches no origin but the backend's --> survives it intact, and it is a
common shape in self-hosted deployments. It is refused on delivery. Reaching it means either
publishing several images and a compose file, which contradicts the one image
SRS018<!-- One generic published image --> and [`../../README.md`](../../README.md) describe, or
supervising a second process inside one container. Either buys a separation of concerns with no
consumer at one display on a LAN, and adds a configuration surface to a deployment whose operator is
frequently not the author. **Premise that would reopen it:** WiseKiosk grows independently deployed
pieces, at which point the proxy arrives with them. Nothing here stops an operator putting their own
proxy in front of the container; what is refused is shipping one.

**A separate static host or a CDN.** Rejected on the second origin it creates — a widened
`connect-src` and cross-origin requests to the API, against
SRS010<!-- The display page reaches no origin but the backend's --> — and on deployment: it puts an
internet dependency in front of a display that runs unattended on a LAN, and files on a host
[`../../README.md`](../../README.md) states WiseKiosk does not own.

**One container, the image as the unit.** The literal reading of ADR 0019's boundary sentence, and it
erases what this level exists to draw: SYS005<!-- Single-definition internal contract --> has no
boundary to be a contract across, SRS010<!-- The display page reaches no origin but the backend's -->
has no page and no origin, and config-blindness has no second party to be blind to.

**The configuration as a third element.** It would make config-blindness structural rather than
something a label states. Rejected: a mounted file is not a running unit, and ADR 0019 already
refused to invent an element — the aggregate "Public APIs" — to carry what a relationship can carry.

**Deferring the operator's secret supply until a module needs a secret**, as ADR 0019 defers an
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

**Two requirements were baselined by this work.** SRS026<!-- The display says when the backend is
gone --> and SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->
were `proposed`, and `check-arch-trace` refuses a tag on an unbaselined item. Binding a requirement
to an element is the act of reading it and judging what it obliges, so the review happened here;
both already met [ADR 0005](0005-traceability-gating.md)'s definition of acceptance, and `status`
sits outside the `reviewed` attribute set, so no fingerprint moved.

**The Context level's rendered labels now come from the container-depth relationships**, since that
is where they are declared. The level's content is unchanged; its wording is the decomposition seen
from further away.

**Some obligations have nowhere to bind yet.** SRS011<!-- Upstream request rate is bounded, and the
bound is not operator-tunable -->, SRS012<!-- Request parameters validated against known-good
per-source patterns --> and SRS013<!-- Client-facing contract for rejected requests --> want a
relationship to an upstream, and no upstream element exists until a module need does (ADR 0019).

**Neither container carries a `link`.** No source exists and the repository layout is #5 repo layout;
the model gains one per container when it does.

**ADR 0019 is exercised, not amended.** It delegated the tier below Context to the phase that models
that level, and this is that phase answering. Its rule that the tier is a property of the level
stands — a relationship spanning two levels answers to two.

**The Mermaid artifact is the poorer of the two renderings.** `codegen mermaid` drops element
descriptions and the icons, which the PNG export keeps, and the descriptions are where each
container's responsibility is written. Images stay outside every gate
([ADR 0003](0003-architecture-as-code-likec4.md)); what the browser-free artifact cannot show is
carried by the prose in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
