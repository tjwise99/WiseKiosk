# 0021 — Lay the repository out as the container decomposition: a root per container, and a home for what belongs to neither

**Status:** accepted
**Decided:** 2026-08-12 (#5 repo layout, once #97 C4 phase 2 Container closed and the decomposition
this projects landed as [ADR 0019 rev 5](0019-boundary-at-what-deploys-and-tag-tier.md))
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-13 — condensed; every path, rejected alternative and consequence is unchanged
  (#145 prose pass).
- **rev 1** — 2026-08-12 — first written (#5 repo layout).

## Context

**Three documents deferred a location here by name**, so the layout blocked work rather than tidied
it: [the module contract](../contracts/module-contract.md) leaves a module's directory and the
registration list's home to the layout;
[ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) left the boundary schema's location open,
which held #7 boundary-contract codegen from building it; and no model element carried a source
`link`, there being nowhere for one to point.

**Half the answer was forced by a rule written for another reason.** [`../CI.md`](../CI.md) §
*Repository shape* gates that a depth-1 listing of the root holds no `go.mod`, `package.json`,
`pyproject.toml`, `requirements*.txt` or `.venv/`, and that every Dependabot entry outside
`github-actions` resolves to a non-root directory holding its manifest. Neither package root can be
the repository root. What is left is what the roots are called, what sits in neither, and where a
module's files go.

**A repository layout is a projection of the container decomposition onto directories**, which is why
this waited on one. [ADR 0019 rev 5](0019-boundary-at-what-deploys-and-tag-tier.md) decided two
containers behind one origin and put the provisioning material outside the boundary; the boundary
schema belongs to neither container, which is
[ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md)'s.

**The module is where the projection stops being obvious.** A module is *"added and removed as a
unit"* and its parts run in two execution contexts — a shaping library in the backend, a component in
the browser — while a local module fetches nothing and so has no backend half. Which modules those
are follows from the roster in [`../../README.md`](../../README.md), which this record does not copy.
Whatever is decided must leave the checks [`../CI.md`](../CI.md) § *Module and framework structure*
describes walking populations readable off the tree.

**Generated output has no say in where it sits.** A compiler reads a package where the package is, so
the types [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) emits sit inside the package
that consumes them, and they are committed because that ADR's drift gate is a `git diff`.

## Decision

**The top level projects the containers**: one directory per container, a third for the contract
between them, a fourth for what ships outside the boundary. The repository's own material — `docs/`,
`scripts/`, `.github/` — is not part of the projection: it describes and checks the product rather
than running in it.

| Path | What it is |
|---|---|
| `backend/` | The Go module root. `go.mod` sits there and nowhere else; `cmd/` the binary's entry point, `internal/` the shared framework half — every component the Backend container draws |
| `frontend/` | The npm package root. `package.json` sits there; `src/` the sources Vite builds, framework half under `src/lib/` |
| `boundary/openapi.yaml` | The one boundary schema, owned by neither package ([ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md)) and so inside neither. Named for what this repository already calls the thing |
| `deploy/` | What a release carries beside the image — the deployment recipe and the example configuration ([ADR 0020 rev 1](0020-release-artifact-set-and-operator-tooling.md)). Outside both packages because it is outside the boundary |
| `Dockerfile` | At the repository root |

**The `Dockerfile` is at the root** because a build producing one image from a Go binary and a built
bundle spans both package roots and so belongs to neither, and `docker build <PATH>` reads
`PATH/Dockerfile` without being told. That is a convention rather than a constraint — `-f` names one
anywhere and `COPY` resolves against the context regardless. The root-manifest rule does not reach it:
a Dockerfile is not a dependency manifest, and nothing resolves it by walking up from a package.

**A module's files sit in each package that runs one, under the same name.**
`backend/internal/modules/<name>/` holds the shaping library and its unit tests;
`frontend/src/modules/<name>/` holds the component, the configuration-schema fragment and the render
test; a local module has the second only. The identical name in both trees is what lets a check pair
the halves with no mapping table to maintain.

**The single route registration is framework code and sits outside `modules/`**, in
`backend/internal/registry/`, so that every child of `modules/` is a module. A check then walks a
directory listing rather than a listing minus the entries it knows to skip — the shape that goes
quietly wrong when somebody adds a second exception.

**Generated boundary types are committed inside the package that compiles them**, each in one package
named for the boundary — `backend/internal/boundary/` and `frontend/src/lib/boundary/` — so that *the
generated package* is a place rather than a pattern, which is what
TST034<!-- Pending: both sides consume the generated boundary types --> asks a type to resolve into.

**The configuration schema is the frontend's**, under `frontend/src/config/`, beside the one engine
that enforces it ([ADR 0007 rev 2](0007-config-validation-allocation.md)); the fragments composing it
sit in the module directories that declare them. Its format, dialect and file name are #8 config
schema format's.

**What this does not decide.** Every path another document defers here is named above. The framework
packages beyond them — whatever holds the response cache, the upstream client, the page shell — follow
each toolchain's conventions and arrive with the code that needs them; an inventory here would be a
list nothing compares to the tree. The module roster's contents stay
[`../../README.md`](../../README.md)'s.

## Alternatives considered

**One `modules/<name>/` root holding both halves.** The strongest rival: it makes *"added and removed
as a unit"* literal rather than a property two checks maintain. Rejected on what it costs to reach —
Go source must sit inside a Go module, so this needs either a root `go.mod`, which
[`../CI.md`](../CI.md) § *Repository shape* forbids, or a second module plus a workspace and a Vite
build reaching outside its own root. The population argument then runs the other way: a local module's
directory would hold frontend files only while the shared name promises both. What keeps a module
removable is the contract's dependency direction and the bijection checks, not adjacency on disk.

**The repository root as the Go module root**, frontend nested under it — what a Go project looks like
when Go is the only language. Rejected by the silo rule, and independently by what it would say: a
repository whose specification and architecture precede its code is not a Go project with
documentation inside it.

**`api/openapi.yaml`**, the widely used Go project-layout convention for this file. Rejected because
it names the wrong thing: beside `backend/`, an `api/` directory reads as the API the backend serves —
the ownership [ADR 0008 rev 2](0008-boundary-contract-openapi-codegen.md) refuses, a schema owned by
one side being one that side can change alone. *Boundary* is the word this repository already uses.

**`openapi.yaml` at the repository root**, expressing *owned by neither* as strongly as a path can and
adding no directory for one file. It works, and the directory holds one file with no second occupant
anyone can name. Rejected on the top level's own shape rather than on a future file: the roots each
name what they hold, and the loose files beside them are the repository's front matter — README,
licence, task runner. A schema is neither. The `Dockerfile` is such an entry and is there anyway, on
the one ground that does not transfer: a build finds it by default, and nothing resolves a schema by
convention.

**The configuration schema in a neutral directory beside the boundary schema.** Two schemas, one place
to look, and the symmetry is easier to explain. Rejected because the symmetry is false: the boundary
schema is neutral because two independently compiled sides generate from it, while the configuration
schema has one owner and, by [ADR 0007 rev 2](0007-config-validation-allocation.md), exactly one
implementation may enforce it. A neutral home advertises a shared artifact, and the first consumer to
accept is the second enforcer that decision forbids by name.

**The registration file inside `modules/`**, it being the one framework file naming every module.
Rejected on the population argument above: it makes the module set a directory listing minus one known
entry.

**`pkg/` for the shared framework, `internal/` for the rest.** That convention exists for code other
repositories import. Nothing outside this one imports any of it, and `internal/` refuses that
mechanically rather than by intent — the stronger statement for a private application.

**Say nothing about the `Dockerfile` or the release material**, leaving it to the tickets that build
them. Rejected: each would invent a path at build time, which is the plausible invention
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s design-first rule exists to prevent, and the second
would argue against the first rather than against a record.

## Consequences

- **#7 boundary-contract codegen and #8 config schema format unblock**, each gaining a location and
  neither gaining a format.
- **Each package root becomes a tooling silo** with its own manifest, lockfile and install step,
  joining `docs/requirements/`, `docs/site/` and `docs/architecture/` — the existing pattern, which is
  why the root-manifest rule reads as a constraint here rather than an obstacle.
- **Dependabot gains an entry per package root when the manifest exists, and not before**:
  [`../CI.md`](../CI.md) § *Repository shape* fails an entry added ahead of the code.
- **A `README.md` in any of these roots needs a row in [`README.md`](../README.md)**, a row being the
  only thing that claims a document under
  [ADR 0014 rev 2](0014-documentation-index-claims-documents.md) and none of these roots being a
  top-level dot-directory. A new top-level directory is cheap; a document inside one is not, and that
  is deliberate.
- **A base-image Dependabot entry has no home under that rule.** A `docker` entry pointing at the root
  fails § *Repository shape*'s non-root requirement, and the check fails an unmapped ecosystem outright
  rather than passing it — so such an entry needs a script edit wherever the Dockerfile sits. Recorded
  for #54 container build and publish; neither half is decided here.
- **The model's `link` properties gain their targets with the source they point at.** This record
  supplies the layout a `link` needs; no source exists, and that is what keeps every element without
  one. How [ADR 0019 rev 5](0019-boundary-at-what-deploys-and-tag-tier.md) words its own deferral is
  that record's to change, so this one does not count its reasons — a claim about another record's
  argument goes stale when that record is revised, and a pinned citation is green either way.
- **Almost none of this is gated.** The root-manifest half is enforced; the rest becomes checkable as
  the module and framework structure checks [`../CI.md`](../CI.md) describes are built against these
  paths. Until then review is the control, which is the ordinary division here rather than a weakness.

**Premise that would reopen this:** a third container, or a module shape whose parts do not split
across the two — the push-transport module [the module contract](../contracts/module-contract.md)
names as a shape it does not fit is the candidate, a connection manager being framework code with no
half in either module directory.
