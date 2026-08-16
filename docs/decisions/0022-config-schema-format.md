# 0022 — The configuration schema is authored as JSON Schema 2020-12, per-module fragments composed and enforced by one in-page validator

**Status:** accepted
**Decided:** 2026-08-15 (#8 config schema format)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-15 — first written (#8 config schema format).

## Context

The configuration schema is the operator-facing artifact that states what a deployment may be
parameterised with (SYS003<!-- A deployment is parameterised from outside the image -->). Two
earlier decisions bound its neighbours but not its language: [ADR 0007 rev 2](0007-config-validation-allocation.md)
settled *where* validation runs — one TypeScript engine in the page, the backend config-blind — and
[ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) settled the *boundary* contract as a
separate OpenAPI schema that never carries configuration. Neither names the format the configuration
schema is written in. That format is stated nowhere in the tree; this ADR decides it.

The demand is for a tooling ecosystem, not for an elegant type. The schema has more than one reader:

- **One enforcer, in the page.** [ADR 0007 rev 2](0007-config-validation-allocation.md) forbids a
  second validator, and validation runs at apply time — page load — not per render. The
  per-render-cost argument that ruled a runtime validator off the boundary in
  [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) does not reach a validator that runs
  once a load.
- **Machine-enumerable.** SRS024<!-- Every offered configuration key is exercised at a non-default value -->
  ranges *over the schema* to enumerate every offered key — "the schema is the finite
  machine-readable statement of what is offered" — so the format must be introspectable as data, not
  only executable as a check.
- **Composed from per-module fragments.** [The module contract](../contracts/module-contract.md)
  puts a configuration-schema fragment under each module, recomposed into the one schema the page
  validates; the format must let a per-module fragment be authored on its own and composed into that
  single schema.
- **Read by tools that are not the page.** The configuration generator (#70 configuration generator)
  and any future config editor read the schema as data to produce or drive a form over a valid
  configuration.

SYS005<!-- Single-definition internal contract --> does not bind here: it scopes itself out of the
configuration explicitly — the configuration format is shared with the operator and governed by
SYS003<!-- A deployment is parameterised from outside the image --> — so the internal
define-once-and-generate rule is not imposed on this artifact.
[ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) already names the direction — JSON
Schema 2020-12 is the dialect the configuration schema and the boundary schema would share once
OpenAPI reaches 3.1.

(The ticket's older framing — a boot gate and a standalone desk validator — is stale:
[ADR 0007 rev 2](0007-config-validation-allocation.md) dropped both, and the surviving obligation is
the one-in-page-enforcer this ADR builds on.)

## Decision

- **The configuration schema is authored as JSON Schema, draft 2020-12** — a data document, not
  TypeScript code and not emitted from a code-level schema builder. This is the ecosystem the readers
  above need: a standard the generator, a future editor, the docsite renderer, and validators in any
  language can consume without executing the project's own code.
- **Per-module fragments recompose into one schema.** Each module authors its configuration-schema
  fragment as a JSON Schema document; the fragments recompose into the one configuration schema under
  `src/config/` ([ADR 0021 rev 1](0021-repository-layout.md)) — a committed artifact a drift gate
  regenerates and checks unchanged, the same regenerate-and-compare shape the boundary schema's
  generated code is held to
  ([`docs/CI.md` § Module and framework structure](../CI.md#module-and-framework-structure)). This is
  the file-per-module composition [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) rejected
  for the boundary — there, to keep the single OpenAPI file authored rather than recomposed. The
  configuration schema accepts it: its fragments belong beside the modules that declare them, with no
  single authored file to keep, and the recomposition drift gate is the cost of that placement. The
  authored unit is the fragment; the composed schema is derived from the fragments, not hand-edited.
- **Exactly one validator enforces it, bundled and in the page**, 2020-12-capable, run at apply
  time. This ADR fixes the *format*, not the library: the concrete validator — a 2020-12 runtime
  such as ajv's 2020 build or `@cfworker/json-schema`, or a build-time standalone-compiled
  validation function to hold the bundle down on a Pi-Zero-class browser
  ([ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md)) — is chosen when the frontend skeleton
  (#10) is built, against a bundle that does not exist yet. Whatever is chosen, there is one of it
  ([ADR 0007 rev 2](0007-config-validation-allocation.md)).
- **The configuration-object TypeScript types are generated from the schema**, drift-gated, so the
  schema is the one source of the configuration's shape and that shape lives as data rather than as
  code.

A fragment is an ordinary 2020-12 document — a good configuration validates, a malformed one is
rejected:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://wisekiosk.example/config/modules/clock.schema.json",
  "title": "clock module configuration fragment",
  "type": "object",
  "additionalProperties": false,
  "required": ["region"],
  "properties": {
    "region": { "type": "string", "enum": ["top-left", "top-right", "centre"] },
    "twentyFourHour": { "type": "boolean", "default": true }
  }
}
```

`{ "region": "centre", "twentyFourHour": false }` validates; `{ "region": "middle" }` is rejected —
`region` is not one of the allowed values, and `additionalProperties: false` rejects an unknown key
the same way. This is the acceptance property demonstrated, not a wired product test: that test
enumerates the composed schema's keys and lands with the frontend skeleton
(TST016<!-- Pending: every schema key is varied by a fixture and renders -->, #10), and the
malformed-input obligation is already recorded against
SRS002<!-- A module-scoped configuration error is reported at that module -->.

## Alternatives considered

- **A TypeScript-native schema library (Zod, Valibot).** The schema is authored as TypeScript and
  yields runtime validation and static types from one source, with no generation step — genuinely
  elegant, and Valibot is small enough for the bundle. Rejected because the schema would be *code*:
  the generator and a future editor would have to execute the project's TypeScript to read it, the
  key enumeration SRS024<!-- Every offered configuration key is exercised at a non-default value -->
  needs would rest on a library's internal introspection rather than on a portable document, and the
  docsite would render from a lossy code-to-JSON-Schema conversion. It also diverges from the
  2020-12 dialect [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) is heading toward. The
  ticket asks for the tooling ecosystem over the elegant type, and this is the type over the
  ecosystem.
- **TypeBox.** Authored in TypeScript, emitting a real JSON Schema document *and* static types *and*
  a validator from one source — the data document without the generation step Zod lacks. Rejected
  because it makes the schema generated rather than authored, which is the same cost
  [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) used to reject TypeSpec for the
  boundary: an authoring layer whose only consumer is a handful of small schemas, generality ahead
  of a second use.
- **Folding the configuration into the boundary (OpenAPI) schema.** Foreclosed upstream: the
  configuration never crosses the boundary ([ADR 0007 rev 2](0007-config-validation-allocation.md)),
  and [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) keeps it a separate artifact. A
  shared *dialect* when OpenAPI reaches 3.1 is a shared vocabulary, not a merged schema.

## Consequences

- One data document with a broad ecosystem: the generator (#70 configuration generator), a
  future editor, and the docsite all read it as data, and the key enumeration
  SRS024<!-- Every offered configuration key is exercised at a non-default value --> asks for is a
  walk over a standard document rather than over a library's internals.
- It converges with the boundary schema on JSON Schema 2020-12 — the shared *vocabulary*
  [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) names, and a candidate for a shared
  docsite render — while staying a separate schema that never crosses the wire.
- A validator ships in the bundle. Weight is owned under
  [ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) and is addressable by compiling the
  schema to a standalone validation function at build, so the full runtime need not ship; the
  library choice is deferred to #10 rather than pinned here against a build that does not exist.
- Generating the configuration-object TypeScript types from the schema adds a drift gate, the same
  generated-not-hand-written pattern the boundary contract carries — one more pinned generator to
  keep current.
- JSON Schema is authored data, not a new authored language: it is a format a tool consumes, which
  [ADR 0017 rev 5](0017-authored-language-set.md) counts as invoking rather than authoring, so the
  authored-language set is unchanged.
- The `additionalProperties: false` discipline the sample shows is what lets an unknown key be a
  rejection an operator sees, rather than a silently ignored typo — the schema is the finite
  statement of what is offered, and everything outside it is refused.
