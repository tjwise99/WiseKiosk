# 0026 — Boundary error bodies are compact custom shapes with an open `cause` string

**Status:** accepted
**Decided:** 2026-08-19 (#9 backend skeleton, extending the 2026-08-17 decision on #7
boundary-contract codegen)
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-19 — decides the one outcome neither deferral below reaches: a request whose
  context ended mid-flight answers 503 under the cause `shutting-down`, in the module-carrying body
  (#9 backend skeleton).
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
TST029<!-- Rejected-request client-contract test -->'s, each written where a fifth cause
edits a check rather than a specification. Fixing the enumeration here would move that decision to
a place neither item can reach.

**One outcome belongs to neither of those two.** A request whose context ends mid-flight leaves the
handler with no result to answer from: no upstream exchange happened, so the pipeline classified
nothing, and nothing about the request was refused. It is therefore among neither item's causes, and
an outcome no record decides is left to whatever the handler does with it: returning unwritten,
which `net/http` completes as an empty `200 OK`.

Two paths end a request's context, and the binary has one of them. A client disconnecting is the one
it has: the server is `http.ListenAndServe` and nothing calls `Server.Shutdown` or `Server.Close`. A
server closing connections under a client still holding one is the one it gains when graceful
shutdown lands. This record settles the outcome for both, ahead of the second existing, because the
handler cannot tell them apart when it arrives.

The frontend renders these bodies directly on a Raspberry-Pi-Zero-class browser, through the
generated boundary contract and with no runtime re-validation of what it carries
([ADR 0008 rev 5](0008-boundary-contract-openapi-codegen.md)). So what the body costs to parse and
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

**A request whose context ended mid-flight answers 503 under the cause `shutting-down`, in the
`UpstreamFailure` body.** The status says this backend stopped serving rather than that a source
misbehaved, which is what separates it from the 502 and 504 a classified upstream outcome carries.
The cause says which of the things a 503 can mean this one is, where a cause restating the status
would say nothing the status does not. The body is the module-carrying one because what failed is
that module's data request, the same reading that puts an unresolvable secret there rather than in a
rejection: a fault in serving the source, not in the request that asked for it.

**That settles one outcome and reopens nothing.** Which causes the pipeline distinguishes is still
TST001<!-- Pending: upstream-failure error payload test -->'s and which the framework rejects is
still TST029<!-- Rejected-request client-contract test -->'s. This one is decided here because it is
the outcome neither item reaches, so deferring it defers it to nowhere.

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
  TST029<!-- Rejected-request client-contract test -->, neither of which is written, and
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
- **Answering the ended context with nothing at all** — the handler returns, having written no
  status and no body. It is the cheapest thing to write and it costs a dead connection nothing.
  Rejected because the connection is not always dead: once graceful shutdown lands, a shutdown ends
  the request's context under a client still reading, and `net/http` completes an unwritten response
  as an empty `200 OK`. The frontend cannot tell that from a success whose payload it failed to
  parse, which is the one distinction every body in this record exists to make.
- **Reusing `upstream-failure` for it**, the cause an unclassified outcome already carries, adding
  no cause and no status pair. Rejected as a false statement on the wire: no upstream was called,
  so a body attributing the failure to one names a fault that did not occur, and an operator
  reading it looks at the source instead of at the restart that caused it.
- **`unavailable` as the cause name.** Shorter, and it commits to nothing the handler cannot prove —
  the handler sees an ended context and infers the shutdown behind it. Rejected on both halves of
  what a cause is for: it restates `503 Service Unavailable` rather than refining it, and it sits
  one word from `unreachable`, which is about the source rather than about this backend. The
  inference it avoids is safe in the one case that matters, since the alternative reader of this
  body — a client that disconnected — has gone and reads nothing.
- **The `ClientRejection` body for it**, on the reading that the framework rather than a module
  produced it. Rejected because the rejection body says something was wrong with the request and
  nothing was, and because dropping `module` drops what the failing module needs to render the
  failure in its own place.

## Consequences

- **A module's failure body is fixed for every module.** A module needing a field these three do not
  carry revisits this record rather than adding one at its own site, which is what the single
  definition site means in practice.
- **A `cause` value is unvalidated at the boundary.** Neither generated type constrains it, so a
  misspelled cause is a runtime string the page renders rather than a build failure. That is the
  price of the deferral above, and it ends when the enum lands.
- **The frontend has no exhaustive switch on cause.** A renderer written against these types needs a
  fallback branch, which it would need anyway while the cause set is open.
- **503 is a status class of its own at the boundary**, beside the 502 and 504 a module failure
  carries and the 4xx a rejection carries. A frontend discriminating on status has one branch more,
  and a schema declaring what statuses a path item answers
  (TST032<!-- Pending: boundary schema is single and complete -->) declares this one among them.
- **A caller that disconnected is written a body nobody reads.** The handler cannot tell it from the
  shutdown case, so both are answered; the cost is one marshal and one failed write per abandoned
  request, and the alternative is leaving the readable case unanswered.
- **This settles the boundary, not the server's lifecycle.** Until graceful shutdown lands the only
  path here is the disconnected caller above, so the whole cost is that marshal and no reader ever
  sees the body. Nothing in this record is evidence that the binary drains in-flight requests on a
  signal — a deployment declaring a stop grace period or a `STOPSIGNAL` is deciding that separately,
  against the binary rather than against this shape.

**Premise that would reopen this:** a consumer of either body that this repository does not generate
types for — which is what RFC 7807's machinery exists to serve, and what the schema-shared-by-both
premise forecloses.
