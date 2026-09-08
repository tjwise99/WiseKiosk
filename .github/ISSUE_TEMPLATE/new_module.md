---
name: New module (epic)
about: Propose a sixth (or later) module, as the epic its three phases decompose into
labels: module
---

A module is a **contract**, not a plugin. The parts, the two module shapes, and the order to build
them in are defined once, in
[the module contract](../../docs/contracts/module-contract.md) — follow it there rather than a copy
here. Adding a module must never require changing the framework (module contract, § Dependency
direction).

**This ticket is the epic, not the work.** A module is authored in three phases, each one session's
worth and each its own `task` sub-issue filed against this ticket, on a shared integration branch —
the branch shape and the merge rules are the module contract's
([§ How a module is tracked](../../docs/contracts/module-contract.md)), not restated here. This
ticket carries only what the module *is*; the phase tickets carry the work.

**What it displays, and from which upstream API — or none**

<!-- The data source, its refresh cadence, and whether it needs a key. A module that fetches nothing
     is a local module and has three of the six parts. Do not settle the source, cadence, config keys
     or freshness/rate bounds here — those are the requirements phase's. -->

**Shape**

- [ ] Upstream-backed (six parts) — or —
- [ ] Local, fetches nothing (component, configuration-schema section, tests)

**The three phase sub-issues** *(file each as a `task`, attach to this ticket, order UI → requirements → implementation)*

- [ ] **UI design spec** — the module's on-screen composition, colocated as
      `frontend/src/modules/<module>/README.md`
      ([module contract, § The module's UI design spec](../../docs/contracts/module-contract.md)).
- [ ] **Requirements & architecture** — the module's `SYS` need, its `SRS` decomposition, a pending
      `TST` stub per requirement, and the module drawn in the architecture model
      ([module contract, § Writing the module's requirements](../../docs/contracts/module-contract.md);
      the `module-spec` skill sequences it). The source, key, cadence, config keys and
      freshness/rate bounds are decided here.
- [ ] **Implementation** — the parts the shape requires, built against the frozen spec, every TST
      active and green ([module contract, § Building the module](../../docs/contracts/module-contract.md)).

**Does it need anything new from the framework?** If yes, that is a finding to discuss first — the
answer is usually no.
