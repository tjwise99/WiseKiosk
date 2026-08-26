# Module contract

A **display module** is one unit of the kiosk display, added and removed as a unit. It renders into a
region the configuration names for it; regions are the page's and a region may carry several modules
(SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->). This
page is the contract: what a module is made of, and what an author does to add one.

A module is added by editing the repository: writing the module's files, and — where it is
upstream-backed — adding one registration entry. There is no mechanism to register with at runtime.

The concrete locations — which directory holds a module's files, and where the registration list
lives — are fixed by the repository layout
([ADR 0021 rev 1](../decisions/0021-repository-layout.md)). This page names the parts, not their
paths.

## Two module shapes

A module is **upstream-backed** or **local**. An upstream-backed module fetches an external data
source and has all six parts below. A local module renders from something already present — the
browser's own state, or its configuration — fetches nothing, and has three: the component, the
configuration-schema fragment, and tests. It has no shaping library, no route registration and no
boundary-schema fragment — there is no upstream to shape and nothing crossing the boundary.

Parts 1–3 apply to every module; parts 4–6 are what an upstream-backed module adds.

## The six parts

1. **A Svelte component** *(every module).* Receives the module's configuration and its payload as
   props and renders them into the module's region; it fetches no data, parses no configuration and
   validates no payload. It receives one prop more, `reachable` — the page shell's answer about
   whether the backend is serving — and what a module does with it is
   [§ An unavailable module and an unreachable backend are different states](#an-unavailable-module-and-an-unreachable-backend-are-different-states).
   Where the module has a payload, the component consumes the type generated from the boundary schema
   rather than one declared by hand
   ([ADR 0008 rev 3](../decisions/0008-boundary-contract-openapi-codegen.md)).
2. **A configuration-schema fragment** *(every module).* Declares what this module accepts, composed
   into the one configuration schema and enforced at apply time in the page, which is where validation
   runs, per [ADR 0007 rev 2](../decisions/0007-config-validation-allocation.md). The fragment does not
   cross the frontend/backend boundary.
3. **Tests** *(every module).* A render test for the component, and — for an upstream-backed module —
   unit tests for the shaping library. What they must cover is [`TESTING.md`](../TESTING.md)'s, not
   this document's; that the tests exist and sit where the runner reaches them is gated
   ([`CI.md § Module and framework structure`](../CI.md#module-and-framework-structure)), and the
   pending `TST` items they land against are written with the module's decomposition
   ([§ Writing the module's requirements](#writing-the-modules-requirements)).
4. **A shaping library** *(upstream-backed only).* Builds the module's upstream request URL, and
   parses and reshapes the upstream response into the frontend payload. Pure functions, no I/O,
   exercisable in isolation against a captured upstream response without network access — which is
   what the Unit tier in [`TESTING.md`](../TESTING.md) rests on.
5. **A route registration** *(upstream-backed only).* Exactly one entry in the static, compile-time
   list, binding `GET /api/<source>` to that library and carrying every policy governing that route:
   parameter validation, success cache TTL, negative cache TTL, rate limit, outbound timeout, and
   maximum accepted upstream response size. Those values live in the entry and nowhere else in code;
   the timing ones are read out of the module's requirements, which carry each value with its
   rationale ([§ Writing the module's requirements](#writing-the-modules-requirements)).
6. **A boundary-schema fragment** *(upstream-backed only).* Declares the payload this module returns
   across the boundary, as a named component in the one boundary schema — a section of that schema
   rather than a file of its own, and nothing recomposes it
   ([ADR 0008 rev 3](../decisions/0008-boundary-contract-openapi-codegen.md)). This is what makes the
   module's generated payload type exist.

## An unavailable module and an unreachable backend are different states

A module renders an unavailable state of its own for one cause and no other: its own source failed
while the backend was reachable — the module's route answered, and the structured failure body it
answered with is what the module renders in its own place, distinct to that cause
(SRS001<!-- A failed module shows why, and only that module -->).

Where the backend itself is unreachable, no module reports anything. The page shell asks whether the
backend is still serving and reports an outage once for the whole display, so a module handed a false
reachability signal stands down and renders nothing — no unavailable state, no placeholder, no
last-known content. A module that reported for itself here would restate the one outage once per
region, which is what the display is obliged not to do
(SRS026<!-- The display says when the backend is gone -->).

Reachability reaches the component the way its configuration and payload do (part 1): as a prop,
threaded from the page shell through the frame to every module. The frame forwards it to every module
alike and makes no coverage decision from it, so nothing between the shell and the module decides
which modules an outage covers — that is each module's own question, not a placement one. The frame's
own use of the signal is spacing: it drops the top inset beneath a report that already holds that
edge.

A local module ignores the prop — it fetches nothing, so a backend that is gone takes nothing from it
and it keeps rendering beneath the page's report. An upstream-backed component that leaves the prop
undeclared draws its own unavailable state beneath the page's outage report, and nothing says so:
Svelte ignores a prop the component does not declare, and the render tier reads the stand-down
against a module it supplies rather than against this one.

## Dependency direction

Modules depend on the shared framework; the framework does not depend on a module. No shared
framework source names a specific module, except the single registration entry of part 5, and no
shared package imports a module's package.

That is the property that keeps a module removable: deleting its files and its registration entry
leaves nothing behind that referred to it. It is a statement about direction, not about the size of
a diff — framework code that a new module needs may be added, and it is shared code from the moment
it is written, so the next module inherits it. It may be built for a second consumer known to be
coming; it is never generalised for a module that does not exist
([`CONTRIBUTING.md`](../../CONTRIBUTING.md)).

## Writing the module's requirements

A module reaches the requirements tree before it reaches the repository: one `SYS` for the
user-facing want, decomposed by `SRS` items carrying what is specific to this module
([ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md)). Writing those comes first, and
the build steps work against what they produce.

Adding a module is one procedure rather than two, and the difference between the shapes is additive:
every module has a need, a component that renders and behaves as this module does, and a
configuration it accepts; an upstream-backed module adds the backend beneath that — a source to
fetch, a payload to put across the boundary, and the timing that governs both. Which of what follows
applies is the shape's to decide ([§ Two module shapes](#two-module-shapes)).

The need states what a viewer gets from this module, in one sentence carrying one `shall`, and it
enumerates nothing: a need listing its own decomposition is a hat over its children rather than a
want of its own. Its header is an indicative claim in noun-phrase form, the way the rest of the need
tier reads — SYS008<!-- The surface carrying no content is a mirror -->, not an imperative and not
the sentence beneath it said again. Write it for a reader with no stake in the code — that is what a
module need is for ([ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md)).

The decomposition beneath it carries what is true of this module and of nothing else — what it
renders in the region it is given and how it behaves there, and what it accepts as configuration;
and, where the module is upstream-backed, the source it fetches, the pattern its parameters must
match, the payload it puts across the boundary, its timing. It stops where the framework universals
begin ([ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md) names them): a module
restating one has written it twice. The boundary is categorical rather than a roster of items to
check a draft against: the test on a draft `SRS` is whether rewording it to name a different module
would leave a sentence the framework already says.

A module `SRS` names its module, and that is its correct form: beneath a module need, position
already says which module the item is about
([ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md)).

One overlap with the framework is legitimate, and it is an upstream-backed module's parameter
pattern. The framework obliges the validating and the rejecting
(SRS012<!-- Request parameters validated against known-good per-source patterns -->); which pattern
that is, that item's own rationale hands to the module, and it is stated as a module `SRS`.

Two of an upstream-backed module's items are about timing, and each carries a value together with
the rationale that produced it. Freshness states how stale the data a viewer sees may be, argued
from how often the source itself changes: refetching faster than the source moves buys a viewer
nothing. Upstream rate states a politeness bound — how often this module may ask its source, chosen
so a display left running is not throttled or cut off for asking too often. What those two settle is
read out of them rather than picked at the keyboard
([§ Cadence and TTL are chosen together](#cadence-and-ttl-are-chosen-together)). What a module does
not restate is that the rate is bounded at all and not left for an operator to tune
(SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable -->) — the
framework obliges that there be a bound, and the module says what it is.

Test tiers guide the decomposition, and one of them guides every module's. The Render tier reads the
component of part 1, which is what [`TESTING.md`](../TESTING.md) states that tier by, so the items
saying what this module renders in the region it is given are written precisely enough for that tier
to assert them. The other two are an upstream-backed module's. The Unit tier reads the shaping
library of part 4 — the upstream URL it builds and the payload it reshapes a response into, pure and
without network — so the items stating this module's parameters and its payload are written
precisely enough for that tier to assert them. The Contract tier is machinery rather than a module
obligation and earns no `SRS`
([`TESTING.md` § Where the Contract tier runs, and how it reaches upstream](../TESTING.md#where-the-contract-tier-runs-and-how-it-reaches-upstream)).

The module's `TST` items are written with the rest of the decomposition, as pending stubs:
`active: false`, header and text both prefixed `Pending:`, stating what will be asserted and what it
lands with — the shape the framework's own pending items already have
(TST002<!-- Pending: module error-state render test -->). Every module's render test is among them,
and an upstream-backed module's unit tests as well. A verification item stays inactive until the
code it checks exists, and a module's directories and test files do not exist until the first
vertical slice creates them; the items are activated, given a references entry and re-read against
their parent then.

## Drawing the module in the architecture model

The architecture model is drawn in the same change that accepts the module's `SYS` and `SRS` items —
they are written active, so the `status` flip is what the model waits on — because every accepted,
active `SYS` or `SRS` item binds to something the model draws
([ADR 0019 rev 6](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). The `TST` stubs are
outside that rule, and activating one later owes the model nothing. Every module gains a component
under the frontend for its Svelte component; an upstream-backed module gains one under the backend
for its shaping library, one external system for the upstream it reads, and the relationship from
the upstream client to that system — the edge that carries the source-reachability obligation as the
module lands ([ADR 0019 rev 6](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md) § Where a
tag sits), and without which the drawn system is a box nothing reaches. Each new identifier is
declared as a tag in the model's `specification` block and applied as the first entry of the body it
belongs to; drawing an element also moves the generated diagrams, so the model, its generated
artifacts and `ARCHITECTURE.md` are regenerated with `just arch-export` and committed together
([`architecture/README.md § Editing the model`](../architecture/README.md#editing-the-model)), and
the prose in `ARCHITECTURE.md` that the drawing falsifies is swept in the same change.
`just check-arch-trace` is what closes the change, and it reads both directions — an accepted,
active item nothing carries fails it, and a tag naming an item still `proposed` fails it the other
way ([`CI.md § Documentation integrity`](../CI.md#documentation-integrity)) — which is why the model
lands with the status flip rather than before or after it. While the items sit `proposed`, no model
work is owed.

## Cadence and TTL are chosen together

The route's response-cache TTL (part 5) and the module's poll cadence are picked as a pair, not
independently: the display refreshes no faster than the cache can answer differently, and the cache
holds no longer than the display's tolerance for stale data. The pairing checks the two values
against each other; neither is chosen here. The success and negative cache TTLs and the rate limit
of part 5, and the module's poll cadence, are what the module's freshness and upstream-rate
obligations come to in code
([§ Writing the module's requirements](#writing-the-modules-requirements)). Both are constants in
code; neither is an operator-tunable configuration key.

## Building the module

The steps run in the order each one's inputs are produced: an upstream-backed module's component is
written against the type its boundary-schema fragment generates.

1. *(upstream-backed only)* Write the shaping library as pure functions, with its unit tests against
   a captured upstream response.
2. *(every module)* Add the configuration-schema fragment and check an example configuration by
   loading it in the page.
3. *(upstream-backed only)* Add the registration entry, carrying all six of that route's policies —
   parameter validation, success TTL, negative TTL, rate limit, outbound timeout, maximum response
   size; the two cache TTLs and the rate limit are read out of the module's freshness and
   upstream-rate items rather than chosen here.
4. *(upstream-backed only)* Add the module's payload to the boundary schema as a named component;
   the generated type the component consumes is emitted from it.
5. *(every module)* Write the component, plus its render test. Where the module has a payload, write
   the component against the generated type rather than hand-declaring it. Where the module is
   upstream-backed, declare the `reachable` prop and honour the stand-down it signals
   ([§ An unavailable module and an unreachable backend are different states](#an-unavailable-module-and-an-unreachable-backend-are-different-states)).
6. *(upstream-backed only)* Set the module's poll cadence to what its freshness obligation comes to,
   and check it against that route's TTL
   ([§ Cadence and TTL are chosen together](#cadence-and-ttl-are-chosen-together)).
7. *(every module)* Confirm the dependency direction still runs modules → framework, and that no
   shared framework source names the new module beyond its registration entry.
8. *(every module)* Adding a module is a test-architecture review trigger — run it, per
   [`TESTING.md` § Review cadence](../TESTING.md#review-cadence).

## A shape this contract does not fit

A module fed by a push or real-time transport — a socket the backend writes to rather than a route
the frontend polls — needs a connection manager, a lifecycle and reconnect handling. That is shared
framework code, and it has no place in parts 1–6 as written.

Such a module is accommodated by amending this contract to describe its shape, not by forcing it
into the pull-based one. The same event is a trigger for reviewing the test architecture
([`TESTING.md` § Review cadence](../TESTING.md#review-cadence)); whoever acts on one reads both.
