# 0008 — Boundary contract: one OpenAPI schema, Go and TypeScript types generated from it

**Status:** accepted
**Decided:** 2026-07-23 (boundary-contract requirements round #37; the codegen-mechanism trade
carried by #7). This ADR records the mechanism **decision**; the **build** is #7.

## Context

The Go backend and the TypeScript frontend share no types
([ADR 0001](0001-backend-language-go.md)), which makes the boundary contract non-negotiable:
**one schema, both sides generated from it**, CI failing on stale generated code.
Round #37 elicited the requirements for that property (SYS006; SRS023–032) deliberately
**mechanism-agnostic** — a "shall" that names a tool churns when the tool changes. This ADR chooses
the tool, which is the decision half of #7.

#7 is gated on #5 (repo layout — where the single schema and the two packages live). Choosing the
mechanism does not need that layout; only *building* it does. So this ADR lands the decision now,
and #7's acceptance — schema file present, both generators wired, drift gate green — waits on #5.

## Decision

- **One hand-authored OpenAPI schema is the single definition**, owned by neither package (its
  repository location is #5's call).
- **OpenAPI 3.0.3 now; 3.1 is the stated migration target.** 3.1's schema objects *are* JSON Schema
  2020-12, which would give one dialect shared with the configuration schema (open question 4) and a
  common docsite render — but `oapi-codegen` and `sphinxcontrib-openapi` have both historically
  lagged 3.1. Start on the interop-safe version; migrate once both generators and the site renderer
  handle 3.1 cleanly and the config-schema format is settled.
- **Go types via `oapi-codegen`** (standard-library `net/http` target, no router dependency).
  **TypeScript types via `openapi-typescript`** — build-time type emission, erased at compile,
  **zero runtime weight in the browser bundle** (the Raspberry-Pi-Zero-class constraint decides
  this).
- **The schema defines every value class that crosses the boundary**: request parameter names and
  types, success payloads, the structured upstream-failure body (SRS001), the client-error rejection
  body (SRS022), and every response status code the frontend discriminates on (SRS023).
- **Drift gate:** a repo-level CI check regenerates both sides and fails on any difference
  (`git diff --exit-status`); the generators are **version-pinned** so a toolchain bump cannot read
  as schema drift (SRS024; verified by TST038). The gate is repo-level because it spans both
  packages.
- **The frontend consumes the generated types only — no runtime re-validation of proxied payloads**
  (SRS032). The version-skew case a runtime validator defends against is foreclosed by single-image
  co-deploy, and a bundled validator (schema→zod/ajv) would cost weight and per-render CPU on the Pi
  against a case that does not exist.
- **Docsite:** `sphinxcontrib-openapi` renders the schema into the existing Sphinx site at build
  under warnings-as-errors — the same generated-not-authored, single-toolchain pattern as
  doorstop→needs and likec4→mermaid ([ADR 0004](0004-docs-site-sphinx-needs.md)).

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
  a Pi-Zero browser against a version-skew case foreclosed by single-image co-deploy (SRS032).

## Consequences

- **#7 becomes an implementation ticket**: the mechanism is settled; its build (schema file, wired
  generators, green drift gate) waits on #5's repo layout.
- **Two pinned generators to keep current** — inherent to Go not sharing types (ADR 0001 paid for
  this knowingly), tracked like any pinned tool.
- **Hand-authored OpenAPI YAML is verbose** — accepted for ~5 payloads; the 3.1 migration and, if it
  ever bites, an authoring layer remain open.
- **The configuration schema stays a separate artifact**, TS-owned (ADR 0007), never crossing the
  wire. When 3.1 lands, both schemas can share the JSON Schema 2020-12 dialect and docsite
  rendering — a shared *vocabulary*, not a merged schema (that would be abstraction without a second
  consumer).
- **ARCHITECTURE.md's "boundary contract" section** (its "open question 2") is answered by this ADR;
  the fuller prose is written when the mechanism is built under #7/#5.
- **Requirement text stays mechanism-agnostic** (SYS006, SRS023–032): this ADR is provenance, not
  cited inside the "shall" statements, so a later mechanism change touches the ADR and the generate
  step, not the tree.
