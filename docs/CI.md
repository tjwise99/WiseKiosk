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

- **Grouped dependency update proposals.** Dependabot carries one entry per ecosystem present in the
  tree — `github-actions` at the root, and the `pip` and `npm` entries pointing at the silos holding
  the documentation toolchains' manifests; `gomod` and the application `npm` entry join them with the
  manifests they need. Each carries a non-empty `groups` key, so an ecosystem's updates arrive as one
  reviewable change rather than a dozen. That the `github-actions` entry exists and every other entry
  resolves to its manifest is § *Repository shape*'s.
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

## Secret scanning

A pull request, and every push to the default branch, is scanned for committed credentials, and a
finding fails the merge. The scan walks **the commits the event carries** rather than the tree at its
tip — the pull request's own commits, or the commits a push delivered — so a secret added and then
removed within one branch still fails: the value is compromised from the moment it is pushed, and the
commit that removes it changes nothing.

**What that shape does not reach**, and what may therefore not be read into a green result: history
behind the branch point, which this gate does not re-read; a commit reachable only through a merge's
second parent, because the walk follows first parents and skips merges; and the tail of a range longer
than the event's own commit list, which is only as long as the API page or the webhook payload that
carries it — a batch push or a force-push after a rebase reaches that bound without being
remarkable. The scan is pattern-based besides, so it catches the credential shapes it holds rules for
and nothing reports what it missed. It raises the cost of committing a credential; it is not an
assertion that the repository holds none, and the delivery rules the tree carries stand independently
of it.

**What no check here decides.** GitHub's own secret scanning and its push protection are repository
settings rather than files. Reading one directly means reading `security_and_analysis` on the
repository object, which is returned only to an administrator, and the workflow `permissions:` key
offers no scope a job could request to become one. That indirect route — asking whether the scanner has
produced anything — is closed as well: the secret-scanning alerts endpoint answers a
workflow token `403 Resource not accessible by integration` even where the job requests
`security-events: read` — a scope that does reach code scanning from the same job, so the refusal is
the endpoint's rather than the grant's. No gate here decides whether either setting is on. The
alternative is a standing admin credential held in the repository so that a job can read one, which is
a larger hole than it closes; the scan above stands on the merge path either way. Both settings are
enabled, and this paragraph rather than a check is what records it.

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
  citation like any other. An identifier followed by `.yml` names an item's file rather than citing
  it: it must still resolve, and carries no header.
- **A requirement citation carries the item's header, in an HTML comment, closed up to the
  identifier.** The header is verbatim and the comment is the only form —
  `SRS015<!-- One schema, all boundary value classes -->`. The identifier's own closing backtick and
  possessive clitic may sit between the two; whitespace may not, because a browser strips the comment
  and leaves the space, which then reads as a gap before whatever punctuation follows. Closing the
  junction also removes the one place a line could break inside a citation, which is what once split
  paragraphs on the rendered page. A citation may still wrap after the comment opens: a line break,
  and the blockquote marker continuing it, are whitespace inside the header rather than text
  separating it. A number is only a handle: a renumber rewrites
  `links:` and leaves the sentence pointing at whatever now occupies it, still reading as correct.
  The header is what turns that drift into a mismatch a machine can see. An ADR number carries no
  header — ADR numbers are immutable, so one cannot come to mean a different decision.
- **A header in an HTML comment does not open a line that continues a paragraph.** CommonMark reads
  a line-initial `<!--` as an HTML block, which interrupts the paragraph and splits it in two on the
  rendered page while the source still reads as one. Nothing else reports it: the comment is a
  comment, the prose is correct, and Sphinx does not warn. A comment opening a line after a blank
  one is a block already, which is what an issue template's guidance comment is, and passes.
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
- That issue carries a milestone and **exactly one** type label. The type set is read from
  `scripts/branch-shape.regex` rather than restated, so a new branch type cannot leave the label rule
  behind. A second type label makes the branch type ambiguous, and an unmilestoned ticket is absent
  from the phase axis that carries the definition of done. This is detected at merge, on the change
  whose ticket is wrong, rather than at filing: GitHub cannot refuse to create a malformed issue, and
  CI does not write ([ADR 0013](decisions/0013-work-tracking-invariants.md)).
- A pull request's base and its issue's parent agree. A parent implies a non-default base; an
  integration branch implies membership in the ticket anchoring it; and a non-default base that is
  not itself a conforming branch fails rather than skips, because an anchor the check cannot resolve
  must not read as success. Sub-issue membership means a shared merge target — topical grouping is
  the milestone's job.
- The Docker build context excludes `.git` and `node_modules`, by `.dockerignore`. Neither is secret
  material; both are build hygiene, and a smaller context is a faster and more predictable build.
  That the image carries no secret is the tree's, under
  SRS025<!-- No secret material in the published image --> (#54).
- A depth-1 listing of the repository root holds no `package.json`, `go.mod`, `pyproject.toml`,
  `requirements*.txt` or `.venv/` — tooling is siloed with the feature it serves — and every
  Dependabot entry that is not `github-actions` resolves to a non-root directory holding the matching
  manifest. `github-actions` is exempt from that rule because its manifests are the workflow files,
  which are siloed nowhere, so its entry is asserted to exist instead — an exemption is otherwise
  granted to an entry nothing obliges, and without the entry the pins below stop being updated and
  nothing says so.

## Action pins and workflow privilege

The workflows are themselves a supply chain and themselves privileged. Both are decidable from the
files, which is why they are gates here rather than settings recorded elsewhere.

- **Every action is pinned to an immutable reference, and names the version that reference is** — a
  commit SHA, or an image digest where the action is a container. A tag is a pointer its owner can
  move after anyone reviewed it; neither of those is. The version comment is what tells a reader what
  the SHA stands for and what Dependabot rewrites when it bumps one, so a pin without one is a pin
  nobody can review. A `uses:` beginning `./` is exempt: a repository-local action or reusable
  workflow moves with the commit that calls it, so there is no upstream to pin.
- **No workflow grants a write permission at the top level.** Every workflow declares a top-level
  `permissions:` block and every grant in it is `read` or `none`; a job needing more elevates in its
  own block, which is what confines `pages.yml`'s `pages: write` and `id-token: write` to the deploy
  job. Declaring no block at all fails rather than passing, because what it would inherit is a
  repository setting no check here can see.
- **A layout the check cannot read fails, and so does discovering no workflow file at all.** A scan
  that skips what it does not recognise, or finds nothing to inspect, reports the same success as one
  with nothing to report — so an unreadable `uses:` value, and an unreadable line inside a top-level
  `permissions:` block, are failures rather than skips.

**The repository-level default is not decidable here either.** `GITHUB_TOKEN`'s default permission
sits behind the same admin-only API as the settings in § *Secret scanning*. It is read-only; the
top-level blocks are what a check can see, and they are what the rule above constrains.

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
  SRS008<!-- No secret value in any backend output --> obliges the running system to the same rule.

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
  a check once reached `just verify` without reaching CI. A token is sought only where a step runs
  one: neither a comment nor a step's own `name:` satisfies it, or deleting a step and leaving its
  name behind would pass.
- Every committed test file falls under a configured runner's reach; a file excluded by skip, build
  tag, glob gap, or wrong directory fails. The requirements tier is covered by `doorstop --error-all`
  and is deliberately not re-encoded here. Unbuilt until a runner exists to detect anything: #82
  dead-test detector.
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

**How work is tracked, beyond the ticket a branch names.** Three things were weighed and deliberately
left ungated ([ADR 0013](decisions/0013-work-tracking-invariants.md)). Ordering lives in GitHub's
native dependency edges and never in a `⛔ Blocked by:` line in a body: the practice is adopted, but a
literal-string ban flags the very documents that forbid the line, and is respelled for free — what
enforces it is that there is no second place to write ordering. Whether a ticket should be rescoped
or closed, which close-reason applies, whether a scope is correct, and whether a body's acceptance
condition is any good are judgment, and a gate pretending to decide them would be theatre. And a body
need not carry its template's headings — templates churn, and gating them buys a re-review of every
ticket on each template edit.

**A ticket nobody works.** The shape checks above see an issue only when a branch names it, so a
malformed ticket left in the backlog stays malformed and stays absent from its milestone's progress.
A scheduled read-only sweep over every open issue would close that; it was rejected as more machinery
than a population twice caught by eye has earned, and it is the named remedy if the drift recurs.

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
