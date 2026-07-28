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
- Every bare-text citation to a requirement ID or ADR number names an item or decision that exists.
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
- A depth-1 listing of the repository root holds no `package.json`, `go.mod`, `pyproject.toml`,
  `requirements*.txt` or `.venv/` — tooling is siloed with the feature it serves — and every
  Dependabot entry that is not `github-actions` resolves to a non-root directory holding the matching
  manifest.

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
