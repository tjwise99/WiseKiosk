# 0026 — Boundary error bodies are compact custom shapes with an open `cause` string

**Status:** accepted
**Decided:** 2026-08-17 (#7 boundary-contract codegen)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-17 — first written (#7 boundary-contract codegen).

## Context

Two obligations require a structured body to cross the boundary and neither says what is in it.
SRS001<!-- A failed module shows why, and only that module --> obliges the backend to report a
failed module's failure distinct to its cause and that module to render an error state;
SRS013<!-- Client-facing contract for rejected requests --> obliges a rejected request to return a
client-error status with a body the frontend can render. Each routes the *shape* elsewhere, to the
one schema SRS015<!-- One schema, all boundary value classes --> owns, which admits no second
definition site — so the schema is the only place these bodies can be defined, and until it existed
they were defined nowhere.

Two things are being decided at once and they separate cleanly. **What fields the bodies carry** is
this record's. **Which values `cause` takes** is not: the failure causes are
TST001<!-- Pending: upstream-failure error payload test -->'s and the rejection causes
TST029<!-- Pending: rejected-request client-contract test -->'s, each written where a fifth cause
edits a check rather than a specification. Fixing the enumeration here would move that decision to
a place neither item can reach.

The frontend renders these bodies directly on a Raspberry-Pi-Zero-class browser and consumes the
generated types only, with no runtime re-validation
([ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md)). So what the body costs to parse and
to render is paid on the constrained side, and every field it carries is a field the page must
either display or ignore.

## Decision

**Two distinct named components, each a flat object of strings.**

- `UpstreamFailure` — `module`, `cause`, `message`, all required. `module` is what contains the
  failure to one module's own place; `cause` is what tells a source being down from a key being
  wrong; `message` is what the module renders.
- `ClientRejection` — `cause`, `message`, both required. It carries no `module`: a request rejected
  before any upstream call is rejected by the framework rather than by a module.

**`cause` is an open string in both.** The schema declares the field and its type and stops there.

**They are two components rather than one with an optional field.** Distinctness is what lets a
reader of either side's generated types tell the two paths apart without reading a comment, and an
optional `module` would make the containment obligation above unreadable from the type.

## Alternatives considered

- **RFC 7807 `application/problem+json`.** The standard shape for exactly this, already understood
  by tooling, and it would have cost no argument. Rejected on what it brings with it: a media type
  the frontend must negotiate, and a `type` member that is a URI naming a problem type — which
  means either a documentation URL space this project would have to author and host, or the
  `about:blank` escape that reduces the record to `title` and `detail` with extra ceremony around
  it. Both are machinery for federating error semantics between parties who do not share a schema.
  These two parties share one schema by construction, which is the premise that makes the machinery
  buy nothing. Reopen if a body ever crosses to a consumer this repository does not generate.
- **A closed `cause` enum in the schema**, which would give both sides an exhaustive type and make a
  missed case a compile error rather than a fallback branch. It is the stronger contract and it is
  deferred rather than refused: the causes belong to
  TST001<!-- Pending: upstream-failure error payload test --> and
  TST029<!-- Pending: rejected-request client-contract test -->, neither of which is written, and
  enumerating them here would settle by guess what those items settle by evidence. The open string
  is what lets those items land without a schema change being the thing that blocks them.
- **One component with an optional `module`.** Fewer components, one renderer. Rejected on the
  reading above, and because
  TST032<!-- Pending: boundary schema is single and complete --> asserts the two bodies exist as
  distinct schemas — collapsing them would be deciding against a verification item rather than
  alongside it.
- **A nested envelope** — an `error` object holding the fields, leaving room for a success union at
  the same level. Rejected as generality ahead of a second consumer: no payload asks for the
  envelope, and the nesting is a level every renderer pays for.

## Consequences

- **A module's failure body is fixed for every module.** A module needing a field these three do not
  carry revisits this record rather than adding one at its own site, which is what the single
  definition site means in practice.
- **A `cause` value is unvalidated at the boundary.** Neither generated type constrains it, so a
  misspelled cause is a runtime string the page renders rather than a build failure. That is the
  price of the deferral above, and it ends when the enum lands.
- **The frontend has no exhaustive switch on cause.** A renderer written against these types needs a
  fallback branch, which it would need anyway while the cause set is open.

**Premise that would reopen this:** a consumer of either body that this repository does not generate
types for — which is what RFC 7807's machinery exists to serve, and what the schema-shared-by-both
premise forecloses.
