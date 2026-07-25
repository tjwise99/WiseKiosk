# Module contract

A display module is added by following this contract by hand. There is no plugin mechanism to
register with — no dynamic loading, no discovery, no runtime registry, no third-party extension API
(SYS024). The obligations are normative in the [requirements tree](../requirements/README.md); this
page is the author-facing procedure that satisfies them and states no obligation of its own.

The concrete locations — which directory holds a module's files, and where the registration list
lives — are fixed by the repository layout (#5). This page names the parts, not their paths.

## The five parts

1. **A shaping library.** Builds the module's upstream request URL and parses and reshapes the
   upstream response into the frontend payload. Pure functions, no I/O, exercisable in isolation
   against a known upstream response without network access (SRS033).
2. **A route registration.** Exactly one entry in the static, compile-time list, binding
   `GET /api/<source>` to that library and carrying the route's parameter validation and cache TTL
   (SRS034, SRS023, SRS022).
3. **A Svelte component.** Receives the module's configuration and its payload as props and renders
   them into the module's region; it fetches no data, parses no configuration, and validates no
   payload (SRS040). The payload type it consumes is generated from the boundary schema, never
   hand-declared (SRS031).
4. **A configuration-schema fragment.** Declares what this module accepts, composed into the one
   configuration schema and enforced by the single validation implementation — at apply time in the
   page and by the standalone desk validator, per
   [ADR 0007](../decisions/0007-config-validation-allocation.md) (SRS035, SRS014). The fragment
   does not cross the frontend/backend boundary.
5. **Tests.** Unit tests for the shaping library and a render test for the component, both wired into
   CI (SRS037). Their tier placement and the standing obligations they discharge are in
   [`TESTING.md`](../TESTING.md).

## The confinement invariant

Adding or removing a module touches that module's own files — shaping library, component,
configuration-schema fragment, tests — plus the single registration entry of part 2, and no shared
framework file. No shared framework source names a specific module except that one registration list
(SRS036).

A module is also subject to the system-wide constraints: it introduces no abstraction or extension
point with a single implementation and no second consumer (SYS041, SRS086).

## Cadence and TTL are chosen together

The route's response-cache TTL (part 2; SRS022) and the module's poll cadence (SRS043) are picked as
a pair, not independently — SRS043's rationale records why. Both are constants in code; neither is
an operator-tunable configuration key.

## Adding a module

1. Write the shaping library as pure functions, with its unit tests against a captured upstream
   response (SRS033, SRS037).
2. Add the configuration-schema fragment and check an example configuration with the standalone
   validator (SRS035, SRS008).
3. Add the registration entry: parameter validation and the route's cache TTL (SRS034, SRS023,
   SRS022).
4. Write the component against the generated payload type, plus its render test (SRS031, SRS040,
   SRS037). **No step above produces that type.** A module's payload has to reach the one boundary
   schema, but SRS036 confines a module's edits to the five locations listed here and the schema is
   not among them. Logged as a tree gap on #18; do not resolve it by hand-declaring the type, which
   SRS031 forbids.
5. Set the module's poll cadence against that route's TTL (SRS043).
6. Confirm no shared framework file was edited beyond the registration entry (SRS036).
7. Adding a module is a test-architecture review trigger — run it, per
   [`TESTING.md` § Review cadence](../TESTING.md#review-cadence) (SYS034, SRS071).
