# 0028 — The configuration validator is ajv's 2020-12 build, compiled to a standalone function at build time

**Status:** accepted
**Decided:** 2026-08-18 (#10 frontend skeleton, the change that builds the bundle this was deferred
against)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-18 — first written (#10 frontend skeleton).

## Context

[ADR 0022 rev 1](0022-config-schema-format.md) fixed the configuration schema's format — JSON Schema
2020-12 — and deliberately left the library open: *"the concrete validator … is chosen when the
frontend skeleton (#10) is built, against a bundle that does not exist yet."* That bundle is what
#10 frontend skeleton builds, so the deferral closes here.

Three constraints decide it, and none of them is about validation features.

- **There is exactly one enforcer, and it runs in the page.**
  [ADR 0007 rev 2](0007-config-validation-allocation.md) forbids a second implementation of the
  schema's rules anywhere — a desk tool, a container entrypoint, a generator checking its own output.
  So whatever is chosen is the only thing in the repository that knows what the schema means.
- **It runs once per page load, not per render.** Validation gates the *application* of a
  configuration, and page load is today's only apply point, so compile time is paid once and
  per-validation speed is not a differentiator between the candidates.
- **Weight is the live cost.** The frontend runs on a Pi Zero-class browser host
  (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->), and
  [ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) is a stack chosen against exactly that.
  ADR 0022 rev 1 names the remedy without picking it: *"addressable by compiling the schema to a
  standalone validation function at build, so the full runtime need not ship."*

## Decision

**ajv's 2020-12 build compiles the schema at build time, and only the code it emits ships.**

- `frontend/src/config/schema.json` is compiled by ajv's 2020-12 build during the Vite build, through
  ajv's standalone code generation, and the emitted ES module — a plain function over a value — is
  what the bundle carries.
- **ajv is a devDependency and no source imports it.** It is part of building the bundle, not part of
  the bundle, so the emitted module graph carries no schema evaluator and no copy of the schema
  document. The npm allowlist manifest [`../CI.md`](../CI.md) § *Module and framework structure*
  gates that module graph against is what holds this mechanically rather than by intent.
- **Every error is collected, not the first.** The page renders the full validation report in
  operator language ([ADR 0007 rev 2](0007-config-validation-allocation.md)), so a validator that
  stopped at the first failure would make the operator's second problem invisible until they had
  fixed the first.
- **The compiled function is the one enforcer.** The configuration-object TypeScript types
  ADR 0022 rev 1 requires are generated from that same file, so the types and the enforcement have
  one source and neither is a second statement of the rules.

## Alternatives considered

- **ajv's 2020-12 build shipped as a runtime dependency**, compiling the schema in the browser at
  load. The ordinary way to use it, and it keeps the schema loadable as data at run time. Rejected on
  weight against SRS021<!-- Frontend runs on a Pi Zero-class browser host -->: it ships a
  general-purpose schema compiler *and* the schema document to a device that will compile one known
  schema, once, every time it boots. Every byte of the compiler's generality is spent on a
  configurability the deployment does not have.
- **`@cfworker/json-schema`.** 2020-12 capable and far smaller than ajv, which is what makes it the
  honest rival — it was the candidate ADR 0022 rev 1 named beside ajv. Rejected because it is a
  runtime *evaluator*: it walks the schema document to decide each value, so the bundle carries the
  evaluator and the document both. That is smaller than shipping ajv and still strictly more than
  shipping neither, which is what compiling to a function buys. Its real advantage — validating a
  schema not known until run time — is a capability this product does not have, the schema being
  built into the bundle beside the code.
- **Hand-written validation, no library at all.** The smallest possible bundle, no dependency, and
  the page would still be the one enforcer. Rejected because the schema is authored as data precisely
  so that readers other than the page consume it
  ([ADR 0022 rev 1](0022-config-schema-format.md) names the configuration generator, a future editor
  and the docsite): hand-written checks are a second statement of the rules that no gate compares
  against the document, and the first divergence is a configuration the operator's tooling accepts
  and the display rejects. Compiling from the document is what makes the code and the data one thing.

## Consequences

- **The device never sees a validator.** What ships is a function specialised to one schema; ajv's
  compiler, its dialect machinery and the schema document all stay on the build machine.
- **A schema that cannot compile fails the build**, not the display. Compilation moves from page load
  to `check-build`, which is the earliest point it can be found and the only one where nobody is
  standing in front of a wall.
- **The bundle stops tracking the schema's size in the way a runtime validator would.** A schema that
  grows as per-module fragments arrive (#12 first module end-to-end, #156 config-schema fragment
  composer) grows the emitted function rather than adding a second copy of itself beside an evaluator.
- **ajv joins the frontend's devDependencies**, so it is inside the npm dependency gate #67 security
  and supply-chain CI gates builds, and outside the allowlist the module-graph gate holds the bundle
  to. Those are two different populations on purpose: a build-time dependency is reviewed for what it
  is, and refused entry to the device.
- **The reopen route is a reopen, not a workaround.** Anything that wants to validate a configuration
  outside the page is the second enforcer
  [ADR 0007 rev 2](0007-config-validation-allocation.md) forbids, and reaching for a runtime validator
  to serve it is the same decision taken quietly.

**Premise that would reopen this:** a consumer that must validate a schema it does not have at build
time — a configuration editor loading a schema from a running deployment is the named case. A runtime
evaluator earns its weight the moment the schema stops being known when the bundle is built, and not
before.
