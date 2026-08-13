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
   payload. Where the module has a payload, the component consumes the type generated from the
   boundary schema rather than one declared by hand
   ([ADR 0008 rev 1](../decisions/0008-boundary-contract-openapi-codegen.md)).
4. **A configuration-schema fragment.** Declares what this module accepts, composed into the one
   configuration schema and enforced at apply time in the page, which is where validation runs, per
   [ADR 0007 rev 2](../decisions/0007-config-validation-allocation.md). The fragment does not cross the
   frontend/backend boundary.
5. **A boundary-schema fragment.** Declares the payload this module returns across the boundary, as a
   named component in the one boundary schema — a section of that schema rather than a file of its own,
   and nothing recomposes it
   ([ADR 0008 rev 1](../decisions/0008-boundary-contract-openapi-codegen.md)). This is what makes the
   module's generated payload type exist.
6. **Tests.** Unit tests for the shaping library and a render test for the component, both wired into
   CI. What they must cover, where they sit, and the standing obligation they discharge are
   [`TESTING.md`](../TESTING.md)'s — a per-module test obligation is stated there, not here.

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

## Adding a module

First, write the module's need and its decomposition in the requirements tree — one `SYS` for the
user-facing want, `SRS` items for what is specific to this module
([ADR 0012 rev 1](../decisions/0012-module-requirements-in-tree.md)). The steps below build against it.

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
   against the generated type rather than hand-declaring it.
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
