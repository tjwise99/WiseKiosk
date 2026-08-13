# 0008 — Boundary contract: one OpenAPI schema, Go and TypeScript types generated from it

**Status:** accepted
**Decided:** 2026-07-23 (boundary-contract requirements round #37; the codegen-mechanism trade
carried by #7). This ADR records the mechanism **decision**; the **build** is #7.
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-12 — the schema's location, left open here and named as another ticket's to
  take, is [ADR 0021 rev 2](0021-repository-layout.md)'s; the sentences deferring it now cite that
  record. The mechanism, the version and the drift gate are unchanged (#5 repo layout).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

The Go backend and the TypeScript frontend share no types ([ADR 0001 rev 1](0001-backend-language-go.md)),
which makes the boundary contract non-negotiable: **one schema, both sides generated from it**, CI
failing on stale generated code. Round #37 elicited the requirements for that property
(SYS005<!-- Single-definition internal contract -->;
SRS015<!-- One schema, all boundary value classes -->–SRS016<!-- Both sides consume the generated types -->)
deliberately **mechanism-agnostic** — a "shall" that names a tool churns when the tool changes. This
ADR chooses the tool, which is the decision half of #7.

#7 was gated on the repository layout — where the single schema and the two packages live. Choosing
the mechanism does not need that layout; only *building* it does, so this ADR took the decision
without one, and [ADR 0021 rev 2](0021-repository-layout.md) supplied the layout afterwards. #7's
acceptance — schema file present, both generators wired, drift gate green — is what waited.

## Decision

- **One hand-authored OpenAPI schema is the single definition**, owned by neither package (it sits at
  `boundary/openapi.yaml`, per [ADR 0021 rev 2](0021-repository-layout.md)). A module contributes its payload as a **named component inside
  that schema**: the *fragment* [the module contract](../contracts/module-contract.md) part 5 names is
  that component, a section of the one schema rather than a file of its own, so nothing recomposes and
  the schema stays authored rather than generated. Rejected — one fragment file per module, recomposed
  into the committed schema: it buys per-module file ownership at the cost of a composition stage in
  the drift gate and an OpenAPI that is generated output, which is the same cost that rules out
  TypeSpec below. The configuration schema's shape is #8's and nothing here settles it.
- **OpenAPI 3.0.3 now; 3.1 is the stated migration target.** 3.1's schema objects *are* JSON Schema
  2020-12, which would give one dialect shared with the configuration schema (open question 4) and a
  common docsite render — but `oapi-codegen` and `sphinxcontrib-openapi` have both historically
  lagged 3.1. Start on the interop-safe version; migrate once both generators and the site renderer
  handle 3.1 cleanly and the config-schema format is settled.
- **Go types via `oapi-codegen`** (standard-library `net/http` target, no router dependency).
  **TypeScript types via `openapi-typescript`** — build-time type emission, erased at compile,
  **zero runtime weight in the browser bundle** (the Raspberry-Pi-Zero-class constraint decides
  this).
- **The schema defines every value class that crosses the boundary**
  (SRS015<!-- One schema, all boundary value classes -->): request parameter names and types,
  success payloads, the structured body for the upstream failure
  SRS001<!-- A failed module shows why, and only that module --> obliges a module to render, the
  client-error rejection body SRS013<!-- Client-facing contract for rejected requests --> requires
  the frontend to be able to render, and every response status code the frontend discriminates on.
  SRS001<!-- A failed module shows why, and only that module --> and
  SRS013<!-- Client-facing contract for rejected requests --> oblige the behaviour; the shapes that
  carry it are defined here and nowhere else, because
  SRS015<!-- One schema, all boundary value classes --> admits no second definition site.
- **Drift gate:** a repo-level CI check regenerates both sides and fails on any difference
  (`git diff --exit-status`); the generators are **version-pinned** so a toolchain bump cannot read
  as schema drift (SRS016<!-- Both sides consume the generated types -->; verified by
  TST033<!-- Pending: boundary codegen drift-gate test -->). The gate is repo-level because it
  spans both packages.
- **The frontend consumes the generated types only — no runtime re-validation of proxied payloads.**
  The version-skew case a runtime validator defends against is foreclosed by single-image co-deploy,
  and a bundled validator (schema→zod/ajv) would cost weight and per-render CPU on the Pi against a
  case that does not exist. **Reopen if the two sides ever become independently deployable** — that
  is the premise the foreclosure rests on, and nothing else here survives its loss. This was once a
  requirement; it was deleted as a prohibition against a case that does not exist, and this ADR is
  its home.
- **Docsite:** `sphinxcontrib-openapi` renders the schema into the existing Sphinx site at build
  under warnings-as-errors — the same generated-not-authored, single-toolchain pattern as
  doorstop→needs and likec4→mermaid ([ADR 0004 rev 1](0004-docs-site-sphinx-needs.md)).

## Alternatives considered

- **OpenAPI 3.1 as the starting point** — rejected *for now* on tool maturity (`oapi-codegen` and
  `sphinxcontrib-openapi` both lag 3.1); adopted as the migration target rather than dropped.
- **TypeSpec → OpenAPI** — a more ergonomic authoring DSL, but it adds a Node compile hop and a
  second generation stage in the drift gate, and makes the OpenAPI itself a generated artifact. An
  authoring abstraction whose only consumer is ~5 routes — generality ahead of a second use
  ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist, generality).
- **JSON Schema only** (json-schema-to-typescript / quicktype) — models payload bodies but not
  operations, parameters, or status codes, so the request-parameter and rejection-status contract
  would live in a second definition: the exact silent-divergence defect the single-schema rule
  kills.
- **protobuf / gRPC** — a transport change disguised as a codegen choice. Browsers cannot speak gRPC
  without a gRPC-web proxy, and it replaces the REST-over-JSON proxy the design commits to — a
  transport chosen against the access pattern, which polls and needs no live channel (the pull-based
  shape [the module contract](../contracts/module-contract.md) is built against).
- **Smithy** — can emit OpenAPI, but carries a JVM toolchain and trait/projection machinery far
  beyond a five-route proxy.
- **`ogen` (Go)** — best-in-class 3.1 with generated request/response validation; kept as the
  documented fallback if 3.1 plus server-side validation are later wanted, but heavier (its own
  router, a large generated surface) than a thin proxy needs today.
- **Frontend runtime validation (schema→zod/ajv)** — rejected: bundle weight and per-render cost on
  a Pi-Zero browser against a version-skew case foreclosed by single-image co-deploy.

## Consequences

- **#7 becomes an implementation ticket**: the mechanism is settled; its build (schema file, wired
  generators, green drift gate) has the layout it waited for
  ([ADR 0021 rev 2](0021-repository-layout.md)).
- **Two pinned generators to keep current** — inherent to Go not sharing types (ADR 0001 rev 1 paid for
  this knowingly), tracked like any pinned tool.
- **Hand-authored OpenAPI YAML is verbose** — accepted for ~5 payloads; the 3.1 migration and, if it
  ever bites, an authoring layer remain open.
- **The configuration schema stays a separate artifact**, TS-owned (ADR 0007 rev 2), never crossing the
  wire. When 3.1 lands, both schemas can share the JSON Schema 2020-12 dialect and docsite
  rendering — a shared *vocabulary*, not a merged schema (that would be abstraction without a second
  consumer).
- **ARCHITECTURE.md's "boundary contract" section** (its "open question 2") is answered by this ADR;
  the fuller prose is written when the mechanism is built, under #7 boundary-contract codegen.
- **Requirement text stays mechanism-agnostic**
  (SYS005<!-- Single-definition internal contract -->,
  SRS015<!-- One schema, all boundary value classes -->–SRS016<!-- Both sides consume the generated types -->):
  this ADR is provenance, not cited inside the "shall" statements, so a later mechanism change
  touches the ADR and the generate step, not the tree.
