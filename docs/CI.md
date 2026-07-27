# Continuous integration

The gate regime: which checks run, what each one is allowed to let through, and how a finding nobody
can fix is disposed of.

**One requirement governs all of it** — *continuous integration shall run the repository's mechanical
checks as blocking, and shall fail the change on any violation; no check shall be advisory-only.*
Everything below is a check hanging from it, with a `TST` item in
[`requirements/`](requirements/README.md) that names the file doing the work. Adding or retiring a
gate is a check edit and an edit here, not a specification change
([ADR 0011](decisions/0011-requirement-or-convention.md)).

## The security gates

Three, distinguished by what they can see. A source-level dependency scan never inspects the
operating-system packages in the base layer; an image scan never sees which of the project's own
functions is unsafe.

### First-party source

Static scanning of the project's own Go and Svelte/TypeScript source on every pull request, failing on
**any finding at any severity**. Findings are reported to the repository's code-scanning dashboard and
annotated on the pull request.

**A finding in first-party source has no exception path.** The register below exists to record that
someone else shipped something broken, and that justification is not available for code this project
writes.

This mechanises the security review a solo project has no second human to perform.

### Resolved dependencies

Failing a pull request when any resolved Go-module or npm dependency carries a known vulnerability, at
any severity, unless the finding has a current register entry.

**One allowance:** for the Go toolchain the gate may consider reachability — a vulnerability in code
that is present but never called need not fail. This keeps the gate actionable rather than noisy.

Every advisory the scan resolves is reported in the job's output regardless of severity, reachability,
or exception status. The gate decides the merge; the output stays complete.

### The built image

Scanning the built container image, failing on any finding at any severity unless the finding has a
current register entry. This is what covers operating-system and base-layer packages, which the
source-level gate never inspects.

## The exception register

A committed register, one entry per finding. **No severity threshold.**

A threshold decides in advance that a whole class of finding is acceptable, sight unseen — the wrong
shape for this project. A low-severity advisory with a published patch is a dependency shipping
something broken, and the answer is to take the patch or take a different dependency. The register
replaces a standing threshold with a decision per finding.

Each entry names:

- the specific advisory
- why no fix is available
- **why no alternative dependency or base image is viable**
- a review date no more than 90 days out

The third is what makes an entry a decision rather than a suppression. An entry that cannot state it
is an entry that should have been a version bump or a replacement.

**Entries expire.** A register without expiry is where vulnerabilities go to be forgotten — it
converts *accepted for now* into *accepted permanently* with no moment at which anyone looks again.
An entry past its review date fails the gate, which puts every live exception back in front of a
person quarterly.

## The wiring checks

These assert that the regime is real rather than declared. Each was a requirement until the tree
rebuild; each states a property of machinery already decided rather than a want, which is what makes
it a check.

| Check | Asserts |
|---|---|
| Verify/CI parity | Every check `just verify` depends on also runs in CI, and every named CI step is one of those checks or an enumerated CI-only exception |
| Whole-tree discovery | Test runners are invoked over whole-tree discovery, with no silent exclusion |
| Required checks | Every gate job is a required check, and every required check names a real job |
| Method consistency | No requirements item claims a verification method its own children do not support |

## What this document does not hold

The **test architecture** — tiers, what each guarantees, when it runs — is
[`TESTING.md`](TESTING.md). A tier is a way of organising tests; a gate is a condition on merging, and
several gates run no tests at all.

The **checks themselves** are `TST` items, each naming the file that implements it. This document
explains them; it does not stand in for them.

**How a change gets made and reviewed** is [`../CONTRIBUTING.md`](../CONTRIBUTING.md). A gate is
machinery; a review habit is a person.
