# Architecture decision records

**Rev:** 1

An ADR captures a decision **with a rejected alternative** — the "why not the other way" is the whole
point of writing one down. A decision with no real alternative considered is a changelog entry and
belongs in a commit message, not here. New ADR: copy [`TEMPLATE.md`](TEMPLATE.md), take the lowest
free number, and add it to the table.

**An ADR is versioned, not frozen.** Merged text is revisable, and a correction is a new rev rather
than a block appended to the old text. The rev is in the ADR's head, with one line per rev in its
*Revisions* section; prior text is in git. Nothing bounds when a rev is permitted — that is a
judgement call.

**A rev that changes what was chosen moves the `Decided` date with it**, because that date is when
the choice was taken, not when the work merged. A rev that changes only how the decision is stated
leaves it.

**A citation pins a rev** — `ADR NNNN rev M`, never bare, and a link to an ADR is titled the same
way. Revving an ADR therefore reaches every document citing it, each of which is then updated or
re-decided rather than left to age silently; `just check-adr-revs` is what makes that unavoidable. A
*Revisions* line pins the rev it names deliberately, and is the one exemption. **Write an
illustrative example with `NNNN`, never a live number** — nothing distinguishes an example from a
citation, so a real number in one is held to that ADR's current rev and breaks when it revs.

**Supersession is expressed through revving.** The replacing ADR lands alongside, and the replaced
one takes a rev whose *Revisions* line records `superseded by ADR NNNN rev M` — wholly, with
`Status:` flipped, or in the named part. A decision simply gone is `deprecated`.

**Numbers are contiguous and reusable.** Where documents merge, the freed numbers return to the pool.
A number identifies a document rather than a moment: a squash commit on `main` naming one cannot be
amended, so a number in git history need not mean what it means here.

**An owner ruling carries its attribution.** Where this document, or a requirement's `rationale`,
records a decision as settled — the choice itself, or the disposition of a rejected alternative — an
owner's ruling is marked `(owner, YYYY-MM-DD)`, or by a direct quote, at the point it was ruled. An
unattributed decision is the recording author's reasoning, not an owner ruling; nothing else
distinguishes a settled ruling from a session's proposal, so the marker is what a later reader relies
on.

| # | Rev | Decided | Decision |
|---|---|---|---|
| [0001](0001-backend-language-go.md) | 1 | 2026-07-21 | Backend in Go; the frontend/backend boundary contract is generated from one schema |
| [0002](0002-requirements-management-doorstop.md) | 2 | 2026-07-21 | Requirements tracked and V&V-gated with Doorstop (SYS→SRS→TST tree) |
| [0003](0003-architecture-as-code-likec4.md) | 2 | 2026-07-22 | Architecture modeled as code with LikeC4; browser-free Mermaid codegen, staleness-gated |
| [0004](0004-docs-site-sphinx-needs.md) | 1 | 2026-07-22 | Documentation site built with Sphinx + MyST + sphinx-needs; traceability rendered by sphinx-needs, deployed to GitHub Pages |
| [0005](0005-traceability-gating.md) | 1 | 2026-07-22 | All work traces to the requirements tree via four in-repo gates; per-test attribution, derived verification status, tree as backlog |
| [0006](0006-process-gates.md) | 4 | 2026-07-22 | Process gates: branches named type_number-snake_name, typed by ticket template and linked to an open issue; Conventional-Commit PR titles |
| [0007](0007-config-validation-allocation.md) | 2 | 2026-08-07 | Config validation is frontend-owned: the schema's rules are enforced by exactly one implementation, which runs in the page; the backend is config-blind |
| [0008](0008-boundary-contract-openapi-codegen.md) | 2 | 2026-07-23 | Boundary contract: one OpenAPI schema (3.0.3 now, 3.1 later), Go + TypeScript types generated from it, CI drift-gated; frontend types-only |
| [0009](0009-verification-justification-attribute.md) | 2 | 2026-07-24 | Every item stores a `verification-justification` naming what its verification settles and what it does not; fingerprint-fenced |
| [0010](0010-runtime-materialised-gate-fixtures.md) | 1 | 2026-07-24 | Negative gate fixtures are committed as data and materialised into a temp tree at run time; no vulnerable artifact is ever committed in resolvable form |
| [0011](0011-requirement-or-convention.md) | 2 | 2026-07-26 | A requirement obliges the running software; a repository convention is a check if a machine decides it and a review-checklist question if not; rules the pass establishes are recorded as ADRs |
| [0012](0012-module-requirements-in-tree.md) | 2 | 2026-07-26 | A module is a need: one `SYS` per module in the same tree, decomposed into what is specific to it; no generic module need, no separate Doorstop document |
| [0013](0013-work-tracking-invariants.md) | 4 | 2026-08-02 | Ticket metadata is gated at merge, read-only: a milestone and exactly one type label; a sub-issue means a shared merge target, not topical grouping |
| [0014](0014-documentation-index-claims-documents.md) | 4 | 2026-08-02 | A tracked document is claimed by a row in the documentation index, machinery under a top-level dot-directory aside; both sides of that are derived from `git ls-files`, never from a hand-maintained inventory or an exclusions list |
| [0015](0015-container-toolchain-and-image-annotations.md) | 2 | 2026-08-02 | Image built with Docker Buildx; nine OCI keys carried as config labels and manifest annotations, none hardcoded in the Dockerfile, `.revision` bound to the published commit |
| [0016](0016-maintained-tools-for-standard-artifacts.md) | 5 | 2026-08-03 | A check is authored where the obligation it asserts is this repository's own rule, and delegated to a maintained tool where it is a public convention; zizmor, actionlint, lychee, commitlint and pre-commit replace four authored checks, and three obligations are retired |
| [0017](0017-authored-language-set.md) | 7 | 2026-08-16 | Authored language follows the artifact's audience: Go, TypeScript and CSS for what ships, Python (standard library only) for what checks the repository; sh and JavaScript author nothing, and a toolchain's own configuration format is invoking rather than authoring |
| [0018](0018-frontend-svelte-vite-static-spa.md) | 1 | 2026-08-04 | Frontend is Svelte 5 + Vite, emitted as a static single-page bundle and served as files by the Go backend; no server-side rendering, no router, no meta-framework |
| [0019](0019-boundary-at-what-deploys-and-tag-tier.md) | 5 | 2026-08-04 | The architecture boundary is what deploys; an element earns a place where the system exchanges something with it, a component by its interface, and the Deployment level draws hosts, processes and the files beside them; every accepted requirement binds, tagged at the tier its level answers to |
| [0020](0020-release-artifact-set-and-operator-tooling.md) | 1 | 2026-08-09 | A release is the image and its provenance material in the registry plus a recipe and an example configuration on the tag; the documentation site is not versioned, a release carries no operator tooling program, and the image declares a healthcheck nothing acts on |
| [0021](0021-repository-layout.md) | 1 | 2026-08-12 | The top level projects the containers: a Go module root, an npm package root, the boundary schema owned by neither, and the release material outside both; a module's files split across the packages that run them, under one name |
| [0022](0022-config-schema-format.md) | 1 | 2026-08-15 | Configuration schema authored as JSON Schema 2020-12: per-module fragments composed into one document, enforced by a single in-page validator, TypeScript types generated from it |
| [0023](0023-secret-output-containment.md) | 1 | 2026-08-15 | Secrets kept out of client output and logs by type confinement — a distinct secret type that cannot be formatted, serialised, or unwrapped without a single linted call site — proven at the edge by a canary; the secret type is specified in this ADR, not in the tree |
| [0024](0024-secret-file-delivery.md) | 1 | 2026-07-23 | Every secret delivered as the file named by `<NAME>_FILE` and by no other path — value trailing-whitespace-stripped, read per resolution not cached, a bare `<NAME>` env var ignored; the mechanism is specified in this ADR, not in the tree |
| [0025](0025-display-region-roster.md) | 1 | 2026-08-16 | Display region roster: a fixed named set, not an operator-configurable grid |
| [0026](0026-boundary-error-body-shape.md) | 1 | 2026-08-17 | Boundary error bodies are two compact custom components of required strings, `cause` left open; not RFC 7807 and not a closed enum |

## Revisions

- **rev 1** — 2026-08-05 — ADRs become versioned documents: merged text is revisable, corrections are
  revs, citations pin a rev, numbers are reusable, and supersession is expressed through revving
  (#118 ADR revisions).
