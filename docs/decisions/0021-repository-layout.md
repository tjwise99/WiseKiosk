# 0021 — Lay the repository out as the container decomposition: a root per container, and a home for what belongs to neither

**Status:** accepted
**Decided:** 2026-08-12 (#5 repo layout, once #97 C4 phase 2 Container closed and the decomposition
this projects landed as [ADR 0019 rev 4](0019-boundary-at-what-deploys-and-tag-tier.md))
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-12 — first written (#5 repo layout).

## Context

**Three documents defer a location to this decision by name, and two tickets are gated on it.**
[The module contract](../contracts/module-contract.md) states the six parts and says the concrete
locations — which directory holds a module's files, and where the registration list lives — are fixed
here. [ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md) chooses the boundary-contract
mechanism and leaves the schema's location open, which is what holds #7 boundary-contract codegen from
building it; #8 config schema format is behind the same question for the configuration schema.
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) gives this as one of two reasons no model element carries a
`link`. So the layout is a blocking dependency rather than a matter of tidiness, and the thing being
unblocked is a set of paths other work will resolve.

**Half the answer is already forced, by a rule written for another reason.**
[`../CI.md`](../CI.md) § *Repository shape* gates that a depth-1 listing of the root holds no
`go.mod`, `package.json`, `pyproject.toml`, `requirements*.txt` or `.venv/` — tooling is siloed with
the feature it serves — and that every Dependabot entry outside `github-actions` resolves to a
non-root directory holding its manifest. Neither package root can therefore be the repository root.
What is left to decide is what the roots are called, what sits in neither, and where a module's files
go.

**A repository layout is a projection of the container decomposition onto directories**, which is why
this decision waited on one. ADR 0019 rev 4 decided two containers behind one origin, and it decided
two further things this projection has to hold: the boundary schema belongs to neither of them, and
the provisioning material shipped beside the image is outside the boundary altogether.

**The module is where the projection stops being obvious.** A module is "added and removed as a unit",
and its parts run in two different execution contexts — a shaping library in the backend, a component
in the browser. Two of the five modules named in [`../../README.md`](../../README.md) are local: they
fetch nothing, so they have no backend half at all. Whatever this decides has to leave the checks
[`../CI.md`](../CI.md) § *Module and framework structure* describes — module directories in bijection
with configuration fragments, with registration entries, with test files — walking populations that
can be read off the tree.

**Generated output has no say in where it sits.** A compiler reads a package where the package is, so
the Go and TypeScript types [ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md) emits are
inside the package that consumes them whatever this record prefers, and they are committed because
that ADR's drift gate is a `git diff`.

## Decision

**The top level projects the containers.** One directory per container, a third for the contract
between them, and a fourth for what ships outside the boundary. The repository's own material —
`docs/`, `scripts/`, `.github/` — was never part of that projection: it describes and checks the
product rather than running in it.

- **`backend/` is the Go module root.** `go.mod` sits there and nowhere else; `cmd/` holds the
  binary's entry point and `internal/` the shared framework half, which is every component the
  Backend container draws.
- **`frontend/` is the npm package root.** `package.json` sits there; `src/` holds the sources Vite
  builds, with the framework half under `src/lib/`.
- **`boundary/openapi.yaml` is the one boundary schema.** It is owned by neither package
  ([ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md)), so it is inside neither, and the
  directory is named for what the repository already calls the thing.
- **`deploy/` holds what a release carries beside the image** — the deployment recipe and the example
  configuration file ([ADR 0020 rev 1](0020-release-artifact-set-and-operator-tooling.md)). Outside
  both packages, because it is outside the boundary: it runs nowhere the system runs.
- **The `Dockerfile` is at the repository root.** A build that produces one image from a Go binary and
  a built bundle has a context spanning both package roots, and the context's directory is where the
  file that reads it belongs. The root-manifest rule above does not reach it — a Dockerfile is not a
  dependency manifest, and nothing resolves it by walking up from a package.

**A module's files sit in each package that runs one, under the same name.**
`backend/internal/modules/<name>/` holds the shaping library and its unit tests;
`frontend/src/modules/<name>/` holds the component, the configuration-schema fragment and the render
test. A local module has the second only. The directory name is the module's name and is identical in
both trees, which is what lets a check pair the halves without a mapping table to maintain.

**The single route registration is framework code and sits outside `modules/`**, in its own package
under `backend/internal/`. The reason is the populations above: every child of `modules/` is a module,
so a check that walks it is reading a directory listing rather than a listing minus the entries it
knows to skip — and a listing minus known exceptions is the shape that goes quietly wrong when
somebody adds a second exception.

**Generated boundary types are committed inside the package that compiles them**, each in one package
of its own named for the boundary — `backend/internal/boundary/` and `frontend/src/lib/boundary/` — so
that "the generated package" is a place rather than a pattern, which is what
TST034<!-- Pending: both sides consume the generated boundary types --> asks a type to resolve into.

**The configuration schema is the frontend's**, under `frontend/src/config/`, beside the one engine
that enforces it ([ADR 0007 rev 2](0007-config-validation-allocation.md)); the fragments composing it
are in the module directories that declare them. Its format, its dialect and its file name are #8
config schema format's, and nothing here constrains them.

**What this does not decide.** The package names inside `backend/internal/` and `frontend/src/lib/`
follow each toolchain's conventions and arrive with the code that needs them; an inventory of them
written now would be a list nothing compares to the tree. Nor does this decide any of the module
roster's contents, which is [`../../README.md`](../../README.md)'s.

## Alternatives considered

**One `modules/<name>/` root holding both halves of a module.** The strongest rival, and it makes the
module contract's *"added and removed as a unit"* literal rather than a property two checks maintain:
one directory to add, one to delete, both halves visible together. Rejected on what it costs to reach.
Go source has to be inside a Go module, so this needs either a root `go.mod` — which
[`../CI.md`](../CI.md) § *Repository shape* forbids — or a second module plus a workspace, and a Vite
build reaching outside its own root. Then the population argument runs the other way: the two local
modules have no backend half, so a third of these directories would hold frontend files only while the
shared name promises both. What actually keeps a module removable is the dependency direction the
contract states and the bijection checks that enforce it, neither of which is adjacency on disk.

**The repository root as the Go module root**, with the frontend nested under it. It is what a Go
project looks like when Go is the only language. Rejected by the silo rule above, and independently by
what it would say: a repository whose specification and architecture precede its code is not a Go
project with documentation inside it.

**`api/openapi.yaml`**, the widely used Go project-layout convention for exactly this file. Rejected
because it names the wrong thing: sitting beside `backend/`, an `api/` directory reads as the API the
backend serves — the ownership [ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md) refuses,
since a schema owned by one side is a schema that side can change alone. *Boundary* is the word this
repository already uses for the contract and for the types generated from it.

**`openapi.yaml` at the repository root**, expressing "owned by neither" as strongly as a path can and
adding no directory for one file. Rejected on what arrives with #7 boundary-contract codegen: the
schema comes with tooling of its own, and a root file leaves each piece of it to a fresh argument about
which package should hold it — which is the argument this record exists to end.

**The configuration schema in a neutral directory beside the boundary schema.** Two schemas, one place
to look, and the symmetry is genuinely easier to explain. Rejected because the symmetry is false. The
boundary schema is neutral because two independently compiled sides generate from it; the configuration
schema has one owner and, by [ADR 0007 rev 2](0007-config-validation-allocation.md), exactly one
implementation may enforce it. A neutral home advertises a shared artifact, and the first consumer that
takes up the invitation is the second enforcer that decision forbids by name.

**The registration file inside `modules/`.** Tempting, since it is the one framework file that names
every module. Rejected on the population argument in the Decision: it makes the module set a directory
listing minus one known entry.

**`pkg/` for the shared framework, with `internal/` for the rest.** The convention exists for code
other modules import. Nothing outside this repository imports any of it, and `internal/` refuses that
mechanically rather than by intent, which is the stronger statement for a private application.

**Say nothing about the `Dockerfile` or the release material**, on the ground that the tickets building
them will decide. Rejected: each would then invent a path at build time, which is the plausible
invention [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s design-first rule exists to prevent, and
the second one to be invented would have to argue against the first rather than against a record.

## Consequences

- **#7 boundary-contract codegen and #8 config schema format unblock**, each gaining a location and
  neither gaining a format: the schema files have homes, the generated packages have homes, and what
  goes in them is still those tickets' to decide.
- **Each package root becomes a tooling silo** with its own manifest, lockfile and install step,
  joining `docs/requirements/`, `docs/site/` and `docs/architecture/`. That is the existing pattern
  rather than a new one, and it is why the root-manifest rule reads as a constraint here instead of an
  obstacle.
- **Dependabot gains an entry per package root when the manifest exists, and not before.**
  [`../CI.md`](../CI.md) § *Repository shape* requires every non-`github-actions` entry to resolve to a
  directory holding its manifest, so an entry added ahead of the code fails the gate it belongs to.
- **A `README.md` in any of these roots needs a row in [`README.md`](../README.md) or a committed silo
  exclusion**, under [ADR 0014 rev 1](0014-documentation-index-claims-documents.md). A new top-level
  directory is cheap; a document inside one is not, and that is deliberate.
- **The model's `link` properties gain their targets when code lands, not now.** ADR 0019 rev 4 leaves
  every element without one for two reasons, and this record answers only the second: no source exists
  yet, so nothing has moved.
- **Almost none of this is gated.** The root-manifest half is enforced today; the rest is a convention
  that becomes checkable as the module and framework structure checks
  [`../CI.md`](../CI.md) describes are built against these paths. Until then review is the control,
  which is the ordinary division here rather than a weakness of this record.

**Premise that would reopen this:** a third container, or a module shape whose parts do not split
across the two — the push-transport module [the module contract](../contracts/module-contract.md)
already names as a shape it does not fit is the candidate, since a connection manager is framework code
with no half in either module directory.
