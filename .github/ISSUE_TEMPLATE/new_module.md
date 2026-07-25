---
name: New module proposal
about: Propose a sixth (or later) module
labels: module
---

A module is a **contract**, not a plugin — see
[the module contract](../../docs/contracts/module-contract.md). Adding one means adding five things
in five known places, and it must never require changing the framework. Confirm each is thought
through:

**What it displays and from which upstream API**

<!-- The data source, its refresh cadence, and whether it needs a key. -->

**The five parts**

- [ ] **Shaping library** — pure functions turning the upstream response into the render payload
      (`SRS033`).
- [ ] **Route registration** — one `/api/<source>` entry, with parameter validation and cache TTL
      (`SRS034`).
- [ ] **Svelte component** — renders the payload (`SRS040`); its type is *generated from the boundary
      schema* (`SRS031`).
- [ ] **Config schema fragment** — what this module accepts, validated at apply time and by the
      standalone validator (`SRS035`).
- [ ] **Tests** — shaping-library unit tests, a component render test, and a malformed-input
      rejection test (`SRS037`, TESTING.md).

**Does it need anything new from the framework?** If yes, that is a finding to discuss first — the
answer is usually no.
