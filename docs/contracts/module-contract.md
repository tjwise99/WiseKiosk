# Module contract

A **display module** is one unit of the kiosk display, fed by one data source, added and removed as a
unit. It renders into a region the configuration names for it; regions are the page's and a region
may carry several modules
(SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->). This page is the contract: what a module is made of, and what an author does to add one. It
is the canonical statement, not a summary of one — where a module shape arrives that this contract
does not fit, the contract is amended to describe it.

A module is added by editing the repository: writing the module's files and adding one registration
entry. There is no mechanism to register with at runtime.

The concrete locations — which directory holds a module's files, and where the registration list
lives — are fixed by the repository layout
([ADR 0021 rev 1](../decisions/0021-repository-layout.md)). This page names the parts, not their
paths.

## Two module shapes

A module is **upstream-backed** or **local**. An upstream-backed module fetches an external data
source and has all six parts below. A local module — the clock and compliments — renders from the
browser or from its own configuration, fetches nothing, and has three: the component, the
configuration-schema fragment, and tests. It has no shaping library, no route registration and no
boundary-schema fragment, because it has no upstream to shape, no route to register and nothing
crossing the boundary.

Parts 1, 2 and 5 apply to upstream-backed modules only. Parts 3, 4 and 6 apply to every module.

## The six parts

1. **A shaping library.** Builds the module's upstream request URL, and parses and reshapes the
   upstream response into the frontend payload. Pure functions, no I/O, exercisable in isolation
   against a captured upstream response without network access — which is what the Unit tier in
   [`TESTING.md`](../TESTING.md) rests on.
2. **A route registration.** Exactly one entry in the static, compile-time list, binding
   `GET /api/<source>` to that library and carrying every policy governing that route: parameter
   validation, success cache TTL, negative cache TTL, rate limit, outbound timeout, and maximum
   accepted upstream response size. Those values live in the entry and nowhere else.
3. **A Svelte component.** Receives the module's configuration and its payload as props and renders
   them into the module's region; it fetches no data, parses no configuration and validates no
   payload. It receives one prop more, `reachable` — the page shell's answer about whether the backend
   is serving. Every module is handed it and only an upstream-backed one acts on it: that module
   stands down and renders nothing while the signal is false, and a local module ignores the prop and
   keeps rendering, per
   [§ An unavailable module and an unreachable backend are different states](#an-unavailable-module-and-an-unreachable-backend-are-different-states)
   below. Where the module has a payload, the component consumes the type generated from the
   boundary schema rather than one declared by hand
   ([ADR 0008 rev 3](../decisions/0008-boundary-contract-openapi-codegen.md)).
4. **A configuration-schema fragment.** Declares what this module accepts, composed into the one
   configuration schema and enforced at apply time in the page, which is where validation runs, per
   [ADR 0007 rev 2](../decisions/0007-config-validation-allocation.md). The fragment does not cross the
   frontend/backend boundary.
5. **A boundary-schema fragment.** Declares the payload this module returns across the boundary, as a
   named component in the one boundary schema — a section of that schema rather than a file of its own,
   and nothing recomposes it
   ([ADR 0008 rev 3](../decisions/0008-boundary-contract-openapi-codegen.md)). This is what makes the
   module's generated payload type exist.
6. **Tests.** A render test for the component, and — for an upstream-backed module — unit tests for
   the shaping library. What they must cover and the standing obligation they discharge are
   [`TESTING.md`](../TESTING.md)'s — a per-module test obligation is stated there, not here; that
   they exist and sit where the runner reaches them is gated
   ([`CI.md § Module and framework structure`](../CI.md#module-and-framework-structure)).

## Dependency direction

Modules depend on the shared framework; the framework does not depend on a module. No shared
framework source names a specific module, except the single registration entry of part 2, and no
shared package imports a module's package.

That is the property that keeps a module removable: deleting its files and its registration entry
leaves nothing behind that referred to it. It is a statement about direction, not about the size of
a diff — framework code that a new module needs may be added, and it is shared code from the moment
it is written, so it is written to serve every module rather than that one.

## Cadence and TTL are chosen together

The route's response-cache TTL (part 2) and the module's poll cadence are picked as a pair, not
independently: the display refreshes no faster than the cache can answer differently, and the cache
holds no longer than the display's tolerance for stale data. Both are constants in code; neither is
an operator-tunable configuration key.

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

Reachability reaches the component the way its configuration and payload do (part 3): as a prop,
threaded from the page shell through the frame to every module. The frame forwards it to every module
alike and makes no coverage decision from it, so nothing between the shell and the module decides
which modules an outage covers — that is each module's own question, not a placement one. The frame
reads the signal for one thing only, and it is the frame's own: dropping the top inset it would
otherwise hold below a report that already holds that edge.
A local module ignores the prop — it fetches nothing, so a backend that is gone takes nothing from it
and it keeps rendering beneath the page's report.

## Adding a module

A module reaches the requirements tree before it reaches the repository: one `SYS` for the
user-facing want, decomposed by `SRS` items carrying what is specific to this module
([ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md)). Writing those is the first part
of adding a module, and the eight steps below build against what it produces.

The need states what a viewer gets from this module, in one sentence carrying one `shall`, and it
enumerates nothing: a need listing its own decomposition is a hat over its children rather than a
want of its own. Its header is an indicative claim in noun-phrase form, the way the rest of the need
tier reads — SYS008<!-- The surface carrying no content is a mirror -->, not an imperative and not
the sentence beneath it said again. Write it for a reader with no stake in the code: a module need is
the first item in the tree a non-technical reader can validate the product against, which is why a
module is a need at all rather than a note on an implementation ticket.

The decomposition beneath it carries what is true of this module and of nothing else — the source it
fetches, the pattern its parameters must match, the payload it puts across the boundary, its timing.
It stops at the framework universals. Secret delivery, caching and upstream rate, the rejection of a
request that does not conform, and how a failure renders are already obliged for every module by
framework items, so a module restating one has written it twice;
[ADR 0012 rev 2](../decisions/0012-module-requirements-in-tree.md) names the items that carry them,
and the boundary is read there rather than re-derived per module. The test on a draft `SRS` is
whether rewording it to name a different module would leave a sentence the framework already says.

One overlap is legitimate, and it is the parameter pattern. The backend validates each request
against the known-good pattern its source declares and rejects what does not conform
(SRS012<!-- Request parameters validated against known-good per-source patterns -->); which pattern
that is — a code format, an enumerated identifier set — is handed to the module by that item's own
rationale, and is stated as a module `SRS`. The framework obliges the validating and the rejecting;
the module supplies the thing being validated against.

A module requirement names one module, and that is its correct form rather than a defect to be
triaged away. The instinct it meets — that a requirement naming a single instance is implementation
detail — is aimed at the framework tiers, where an item stating one module's behaviour sits among
items obliging all of them and cannot be told from a universal by position. Beneath a module need,
position already says which module the item is about, and naming it is what the item is for.

Two of the decomposition's items are about timing, and each carries a value together with the
rationale that produced it. Freshness states how stale the data a viewer sees may be, argued from how
often the source itself changes: refetching faster than the source moves buys a viewer nothing.
Upstream rate states a politeness bound — how often this module may ask its source, chosen so a
display left running for months is not throttled or cut off for asking too often. The registration
entry's constants are read out of those two rather than picked at the keyboard: the success and
negative cache TTLs, the poll cadence and the rate limit of part 2 are what the two values come to in
code, which is what writing them down was for
([§ Cadence and TTL are chosen together](#cadence-and-ttl-are-chosen-together)). What a module does
not restate is that the rate is bounded at all and not left for an operator to tune
(SRS011<!-- Upstream request rate is bounded, and the bound is not operator-tunable -->) — the
framework obliges that there be a bound, and the module says what it is.

Two test tiers guide the decomposition. The Unit tier reads the shaping library of part 1 — the
upstream URL it builds and the payload it reshapes a response into, pure and without network — so the
items stating this module's parameters and its payload are written precisely enough for that tier to
assert them. The Contract tier replays a recorded fixture to catch an upstream that changed beneath
the library, and it earns no `SRS`: the owner ruled it carries no requirement, because an upstream
still returning what was expected is an obligation on somebody else's API, and the half that is ours
is already SRS001<!-- A failed module shows why, and only that module -->
([`TESTING.md` § Where the Contract tier runs, and how it reaches upstream](../TESTING.md#where-the-contract-tier-runs-and-how-it-reaches-upstream)).
The fixture and the scheduled run against it are machinery, not a module obligation.

The module's `TST` items are written with the rest of the decomposition, as pending stubs:
`active: false`, header and text both prefixed `Pending:`, stating what will be asserted and what it
lands with — the shape the framework's own pending items already have
(TST002<!-- Pending: module error-state render test -->). A verification item stays inactive until the
code it checks exists, and a module's directories and test files do not exist until the first
vertical slice creates them; the items are activated, given a references entry and re-read against
their parent then.

Steps 1, 3, 4 and 6 apply to upstream-backed modules only. Steps 2, 5, 7 and 8 apply to every
module — a local module's component renders from configuration or the browser rather than from a
payload prop, but it still has a configuration fragment, a component, the dependency-direction check
and the review trigger.

1. Write the shaping library as pure functions, with its unit tests against a captured upstream
   response.
2. Add the configuration-schema fragment and check an example configuration by loading it in the
   page.
3. Add the registration entry, carrying all six of that route's policies — parameter validation,
   success TTL, negative TTL, rate limit, outbound timeout, maximum response size.
4. Add the module's payload to the boundary schema as a named component; the generated type the
   component consumes is emitted from it.
5. Write the component, plus its render test. Where the module has a payload, write the component
   against the generated type rather than hand-declaring it. Where the module is upstream-backed,
   declare the `reachable` prop and honour the stand-down it signals
   ([§ An unavailable module and an unreachable backend are different states](#an-unavailable-module-and-an-unreachable-backend-are-different-states)):
   a component that leaves it undeclared draws its own unavailable state beneath the page's outage
   report, and nothing says so — Svelte ignores a prop the component does not declare, and the render
   tier reads the stand-down against a module it supplies rather than against this one.
6. Set the module's poll cadence against that route's TTL.
7. Confirm the dependency direction still runs modules → framework, and that no shared framework
   source names the new module beyond its registration entry.
8. Adding a module is a test-architecture review trigger — run it, per
   [`TESTING.md` § Review cadence](../TESTING.md#review-cadence).

## A shape this contract does not fit

A module fed by a push or real-time transport — a socket the backend writes to rather than a route
the frontend polls — needs a connection manager, a lifecycle and reconnect handling. That is shared
framework code, and it has no place in parts 1–6 as written.

Such a module is accommodated by amending this contract to describe its shape, not by forcing it
into the pull-based one. The same event is a trigger for reviewing the test architecture
([`TESTING.md` § Review cadence](../TESTING.md#review-cadence)); whoever acts on one reads both.
