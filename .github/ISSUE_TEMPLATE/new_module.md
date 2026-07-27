---
name: New module proposal
about: Propose a sixth (or later) module
labels: module
---

A module is a **contract**, not a plugin. The parts, the two module shapes, and the order to build
them in are defined once, in
[the module contract](../../docs/contracts/module-contract.md) — follow it there rather than a copy
here. Adding a module must never require changing the framework (module contract, § Dependency
direction).

**What it displays, and from which upstream API — or none**

<!-- The data source, its refresh cadence, and whether it needs a key. A module that fetches nothing
     — a clock, a local list — is a local module and has three of the six parts. -->

**Shape**

- [ ] Upstream-backed (six parts) — or —
- [ ] Local, fetches nothing (component, configuration fragment, tests)

**Before opening a PR**

- [ ] Every part its shape requires is present, per the module contract.
- [ ] No shared framework file was edited beyond the registration entry (module contract,
      § Dependency direction).
- [ ] The test-architecture review trigger was run — adding a module is one, per
      [TESTING.md § Review cadence](../../docs/TESTING.md#review-cadence).

**Does it need anything new from the framework?** If yes, that is a finding to discuss first — the
answer is usually no.
