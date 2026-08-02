# Continuous integration

What CI does for this repository, and what it refuses to let through.

**None of this is a requirement.** A requirement obliges the running software, and every gate below
constrains the repository instead — its source hygiene, its dependencies, its documentation, its own
wiring. The product's obligations live in [`requirements/`](requirements/README.md) and are failed
against there ([ADR 0011](decisions/0011-requirement-or-convention.md)). Adding or retiring a gate is
an edit here and a change to the check, not a specification change.

**Most of what follows is not built yet.** The gates are described in the tense they will run in;
where a gate is unbuilt its ticket is named. That is how this project records scoped work
([ADR 0005](decisions/0005-traceability-gating.md)).

## What CI provides

Not everything CI does is a gate. These produce material a person acts on.

- **Grouped dependency update proposals.** Dependabot carries one entry per application ecosystem —
  `gomod` and `npm` — each with a non-empty `groups` key, so an ecosystem's updates arrive as one
  reviewable change rather than a dozen. The entries are derived from the manifests discovered in the
  tree, so the configuration cannot be correct while an ecosystem is missing.
- **Code-scanning results.** Every static-analysis finding is reported to the repository's
  code-scanning dashboard and annotated on the pull request, whether or not it fails the build.
- **Complete scan output.** The vulnerability gates report every advisory they resolve — at any
  severity, regardless of reachability or exception status. The gate decides the merge; the output
  stays complete, so a suppressed finding is still visible.
- **Release provenance material.** A published release carries a signature, an SBOM and a
  build-provenance attestation alongside the image. CI produces them; whoever pulls the image uses
  them to establish what it is and what went into it. What is asserted about them is below.

## First-party source scanning

Static analysis of the project's own Go and Svelte/TypeScript source, on every pull request, failing
on **any finding at any severity**.

- Go: seeded vulnerable fixture materialised into a temporary tree, the production analysis run
  against it, the expected finding asserted to be reported and to fail the job. Fails if the analysis
  is absent, skips the Go tree, or lets the seeded finding pass.
- Svelte/TypeScript: the same shape, against CodeQL's `javascript-typescript` analysis.

**A finding in first-party source has no exception path.** The register below exists to record that
somebody else shipped something broken, and that justification is not available for code this project
writes.

This mechanises the security review a solo project has no second reader to perform.

## Lint and type checks

Every source package's linters run as blocking checks. **No linter is advisory-only** — a lint gate
that reports without failing degrades to noise within a release.

- Go: a seeded `golangci-lint` violation, the production invocation, non-zero exit asserted.
- Frontend: a seeded `eslint` or `svelte-check` violation, non-zero exit asserted from each.

## In-code prose

Comments state mechanism. Reason, history and evaluative judgement are authored in a documentation
home and cited from the comment.

- A classifier decides which comments belong to a language's documentation facility. Its fixture
  suite proves, per covered language, that a narrative comment is flagged and that a documentation
  comment never is.
- A language-coverage registry fails on any tracked file resolving to no language, or to a language
  with neither a classifier arm nor a recorded exclusion — so adding a language cannot silently
  disable the gate for it.
- A multi-line comment outside a documentation facility fails; an arbitrarily long doc comment inside
  one passes.
- A change adding more comment lines outside a documentation facility than the configured bound
  allows fails, with the bound read from configuration rather than from the checking code.
- A bare deferred-work marker fails; one naming a tracked issue passes.
- A requirement ID or ADR number cited in a comment that names no existing item or decision fails.

**Why volume is gated at all.** The failure mode is not one bad comment, it is prose accreting until
the code is read through a narrator. A bound on added volume is the only form of that which a machine
can decide; whether a specific comment earns its place is a review question, below.

## Dependency vulnerabilities

Any resolved Go-module or npm dependency with a known vulnerability fails the pull request, **at any
severity**, unless the finding has a current register entry.

- Go: a fixture pinning a known-vulnerable module **and calling the vulnerable symbol**, asserted to
  exit non-zero; the same fixture bumped past the advisory asserted to exit zero.
- npm: a fixture pinning a dependency with a known advisory, asserted to exit non-zero; bumped,
  asserted to pass; and an advisory carrying a current register entry asserted not to fail.

**One allowance, Go only:** the gate may consider reachability — a vulnerability in code that is
present but never called need not fail. Without it the gate produces findings nobody can act on, and
a gate people learn to ignore is worse than none. The fixture calls the vulnerable symbol precisely
because the gate is reachability-aware.

## Image vulnerabilities

The built container image is scanned, failing the build on any finding at any severity unless the
finding has a current register entry.

- An image built from a fixture manifest carrying a seeded vulnerability, asserted to exit non-zero;
  the clean image asserted to exit zero; a finding with a current register entry asserted not to fail.

This is what covers operating-system and base-layer packages. The source-level dependency gate never
inspects them.

## Publishing and provenance

What a release publishes and what CI asserts about it. Verification runs against the published digest
in a separate job that pulls from the registry, reads only the registry and the public transparency
log, and holds no credential. Unbuilt; owned by #67, with the asset set defined by #71.

**Nothing decides the no-credential property.** It is a proposal for a check, not an asserted
guarantee: no gate compares the verification job's permissions against it, and SECURITY.md publishes
a posture resting on this section. Until #77 fences this document, read it as intent.

- **The release asset set is exactly** the image reference, the SBOM, the signature, the
  build-provenance attestation, and the deployment recipe. An undeclared asset fails.
- **Signature.** Keyless `cosign` verification against the published digest, with the expected
  certificate identity and OIDC issuer, exits zero; against a deliberately wrong identity it exits
  non-zero.
- **Provenance.** The build-provenance attestation validates for the published digest and binds it to
  the workflow that built it; a mismatched digest exits non-zero.
- **SBOM.** The SBOM for the published digest is retrievable and non-empty, validates against its SPDX
  or CycloneDX schema, and enumerates the Go main module and the base distribution. Regenerating from
  the same digest yields a matching package set. A release missing the asset fails.
- **Base images are pinned** to a `@sha256:` digest rather than a floating tag, for every base and
  stage in the Dockerfile.
- **The code generators are pinned** to an exact version, so a toolchain bump cannot present as
  schema drift and a regeneration is reproducible. Structurally the same rule as the line above, and
  no requirement states it: nothing the running software does can violate a pin (#7).

## The exception register

A committed register, one entry per finding. **There is no severity threshold.**

A threshold decides in advance that a whole class of finding is acceptable, sight unseen. That is the
wrong shape here: a low-severity advisory with a published patch is a dependency shipping something
broken, and the answer is to take the patch or take a different dependency. The register replaces a
standing threshold with a decision per finding.

Each entry names the specific advisory, states why no fix is available, states **why no alternative
dependency or base image is viable**, and carries a review date no more than 90 days out.

The third is what makes an entry a decision rather than a suppression. An entry that cannot state it
is an entry that should have been a version bump or a replacement.

**Entries expire.** A register without expiry is where vulnerabilities go to be forgotten — it turns
*accepted for now* into *accepted permanently* with no moment at which anyone looks again. An entry
past its review date fails, which puts every live exception in front of a person quarterly.

The gate asserts: every entry is complete and current; every finding suppressed in scan output has a
matching entry; no entry matches a first-party finding; and no entry exists for an advisory no scan
reports — so the register cannot accumulate rows for problems that no longer exist.

## Documentation integrity

The documentation set is checked for the failures that make it untrustworthy: a link that does not
resolve, a citation to something that does not exist, an index that has drifted from what it indexes.

- Every relative Markdown link in every tracked file resolves inside the repository.
- Every absolute `http` or `https` link in tracked documentation names a host on the committed
  upstream-documentation allowlist, and every allowlist entry names the tool or service it serves.
  This extends the link checker above rather than adding a second tool.
- Every citation to a requirement ID or ADR number names an item or decision that exists — in
  tracked documentation outside `.claude/`, and in every item's `rationale` and
  `verification-justification`. Fenced code blocks are skipped; an identifier in inline code is a
  citation like any other, and an identifier followed by `.yml` names an item's file rather than
  citing it.
- **A requirement citation carries the item's header.** The header follows the identifier, after any
  closing backtick or possessive clitic, verbatim, either as visible text or inside an HTML
  comment — `SRS015 <!-- One schema, all boundary value classes -->`. A number is only a handle: a
  renumber rewrites `links:` and leaves the sentence pointing at whatever now occupies it, still
  reading as correct. The header is what turns that drift into a mismatch a machine can see. An ADR
  number carries no header — ADR numbers are immutable, so one cannot come to mean a different
  decision.
- The `decisions/` directory and its index table agree — every ADR has a row, no gap or duplicate in
  numbering, every row resolves to a real file.
- The documentation index's row set equals the committed canonical-document list in both directions;
  every named path resolves to a tracked file; no *Guarantees* or *Excludes* cell is empty.
- The LikeC4 architecture model validates: no undefined element, no unresolved relationship.
- Spliced diagrams and generated architecture artifacts are byte-identical to a regeneration.
- The documentation site builds under Sphinx with warnings-as-errors.

**Considered and rejected:** a registry mapping each canonical document to the path globs it
describes, failing a change that touches described code without touching its document. Its obligation
is *update the document **or declare it unaffected***, and a gate satisfied by declaring is a
checkbox — a typo fix trips it, so the declaration becomes reflex. It would also not have caught the
staleness that prompted it: the documents that went stale did so because requirement identifiers
changed, which the citation resolver above decides without anyone declaring anything.

## Repository shape

- No tracked text file has CRLF line endings.
- The branch is named `type_number-snake_name`, links an open issue labelled with its type, and its
  default-base pull request records the ticket linkage.
- The Docker build context excludes `.git` and `node_modules`, by `.dockerignore`. Neither is secret
  material; both are build hygiene, and a smaller context is a faster and more predictable build.
  That the image carries no secret is the tree's, under
  SRS025 <!-- No secret material in the published image --> (#54).
- A depth-1 listing of the repository root holds no `package.json`, `go.mod`, `pyproject.toml`,
  `requirements*.txt` or `.venv/` — tooling is siloed with the feature it serves — and every
  Dependabot entry that is not `github-actions` resolves to a non-root directory holding the matching
  manifest.

## Module and framework structure

These keep a module self-contained and the shared framework ignorant of it. They were verification
items in the tree until the extensibility need above them dissolved — its children were architecture
([ADR 0012](decisions/0012-module-requirements-in-tree.md)) — and nothing the running kiosk does can
violate any of them, so they are checks here rather than obligations there.

- **Shared framework code names no module.** No shared framework source names any module outside the
  static registration file, and no shared framework package imports a module package, in either the Go
  import graph or the frontend module graph. Runs on every commit rather than only on a module-adding
  change: a diff-scoped form cannot reliably classify which changes are module-adds, and passes
  vacuously on the rest while shared code accretes module knowledge (#12).
- **Route registration has one call site.** Registration call sites appear in exactly one file, and
  that file declares the registry as a package-level composite literal appearing in no append, index
  assignment, or map insertion — a registry is exactly a list something writes to at run time, so its
  absence is structural rather than a denylist of registry-shaped names. One entry per
  upstream-backed module, each carrying a non-nil
  validator and non-zero values for every policy the entry owns; constructing the router and comparing
  its registered route set to the entry set closes the discovery case in both directions (#9).
- **Shaping packages are pure by construction.** Each module's shaping package resolves a transitive
  import set that is a subset of a declared pure-package allowlist, so I/O is absent by construction
  rather than by a denylist of forbidden packages. No exported shaping function's parameters include
  the secret type or the URL-builder's output type, and the shaping unit tests run against a transport
  that panics on use (#12).
- **The configuration schema recomposes from its fragments.** Recomposing from the module fragments
  leaves the committed schema unchanged; module directories and fragments stand in bijection, with no
  registered module lacking a fragment and no orphan fragment; each fragment file is the unique
  definition site of its property names; and no fragment property is reachable by reference from the
  boundary schema (#8).
- **The frontend build emits a static bundle.** Exactly one HTML entry whose mount element is empty,
  no server-entry chunk, no SSR target or adapter declared in the build configuration, and the npm
  packages in the emitted module graph a subset of a committed allowlist manifest. The allowlist is
  deliberate: a denylist of named routers and meta-frameworks fails open the first time someone
  hand-rolls a hash router, and any new runtime dependency should fail until it is reviewed (#10).
- **No backend code builds an upstream URL outside a module's shaping library.** The URL a module
  fetches is that module's to construct; shared framework code constructing one is shared code
  holding module knowledge (#9).
- **Module directories and test files stand in bijection.** Every module has a render test beside its
  component, and every module registered against an external source additionally has a unit test
  beside its shaping library. A module with no registration entry is a local module and is not
  expected to have one. What those tests must cover is
  [`TESTING.md`](TESTING.md)'s; that they exist and sit where the runner reaches them is decided here
  (#12).
- **A module component's module graph does not reach the configuration source.** A component receives
  what it needs as props; reaching the configuration itself would let it depend on keys nobody
  declared for it (#12).

## Upstream contract checks

Two jobs, deliberately unequal. What they must prove, and why the pair is composed rather than either
alone, is [`TESTING.md § Where the Contract tier runs`](TESTING.md#where-the-contract-tier-runs-and-how-it-reaches-upstream);
what runs where, and what each is allowed to let through, is here.

- **Recorded upstream fixtures are replayed on every commit, and block a merge.** Each shaping library
  is asserted against a captured response. No credential is present in this job, and no network call
  is made. What it cannot catch is an upstream that changed after the fixture was recorded — a
  fixture is a snapshot, and it stays green against a reality that has moved.
- **A scheduled job runs the same shaping libraries against the live upstreams, off the pull-request
  path.** It is the only thing that detects the drift above. It fails a scheduled run, never
  somebody's change: upstream availability is not a merge condition, and a gate that goes red because
  a third party is having a bad afternoon is a gate authors learn to ignore.
- **That scheduled job holds one upstream credential, and it is the only job that does.** Of the
  three upstream sources — the clock and compliments modules are local and fetch nothing — only
  CheckWX requires one; OpenMeteo and themeparks.wiki are keyless. The credential is scoped to that
  workflow and reaches no other job, and no fixture, log or failure output carries its value —
  [`../SECURITY.md`](../SECURITY.md) rests on that, and
  SRS008 <!-- No secret value in any backend output --> obliges the running system to the same rule.

**Why a credential is allowed here at all.** A withdrawn requirement once forbade any CI workflow
from holding an upstream credential. It banned a normal practice, and forced the tier into a nested
module that [ADR 0010](decisions/0010-runtime-materialised-gate-fixtures.md) independently found
leaky. Holding it in a scheduled job, off the merge path, is the narrower answer.

## Gate wiring

These assert that the regime is real rather than declared. Each states a property of machinery
already decided, which is what makes it a check and not a want.

- Every check `just verify` depends on also runs in CI, and every named CI step is one of those
  checks or an enumerated CI-only exception. A recipe running more than one command lists one token
  per command — mapping a recipe to a single token hides any command added to it later, which is how
  a check once reached `just verify` without reaching CI.
- Every committed test file falls under a configured runner's reach; a file excluded by skip, build
  tag, glob gap, or wrong directory fails. The requirements tier is covered by `doorstop --error-all`
  and is deliberately not re-encoded here.
- The default branch's required status checks equal the gate jobs the workflow defines — a gate job
  absent from the required set fails, and so does a required entry naming no defined job.

The requirements tree's own integrity checks run here too, but what they assert is a property of the
specification rather than of the repository, so they are stated where the specification is:
[`requirements/README.md`](requirements/README.md).

## What is not gated here

**Review obligations.** Four questions cannot be decided by a machine and are answered by a reader,
in [`../CONTRIBUTING.md`](../CONTRIBUTING.md)'s checklist: whether a change updated the document that
describes the code it touched, whether an architecture element's model link points at its
implementation, whether each added comment states mechanism rather than reason, and whether a comment
citing an identifier restates it. The pull-request template points there.

**The product's obligations.** What the software must do is in
[`requirements/`](requirements/README.md), verified by tests that trace to it. A gate here can block a
merge; only the tree can say the system is wrong.

**Test architecture.** Which tier a test belongs to and what that tier guarantees is
[`TESTING.md`](TESTING.md). A tier organises tests; a gate is a condition on merging, and several
gates run no tests at all.

**This document.** Every other canonical artifact has something that fails when it drifts: a
requirement's text is hashed and editing it flags its children suspect, and generated diagrams are
compared against a regeneration. This one has no fingerprint, no check comparing it against the
workflow or the scripts it names, and no co-change obligation — the requirements carrying that were
deleted, and a co-change registry was rejected above. So a gate removed from the workflow, with its
section left standing here, reads as live to every reader and to
[`../SECURITY.md`](../SECURITY.md), which publishes claims resting on it. The correspondence check
that would close it is #77, and it is not buildable until enough of the gates described here exist to
compare against.
