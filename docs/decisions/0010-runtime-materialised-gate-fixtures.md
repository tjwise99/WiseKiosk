# 0010 — Materialise negative gate fixtures at run time; never commit a resolvable vulnerable artifact

**Status:** accepted
**Decided:** 2026-09-05 (the never-commit-a-vulnerable-artifact rule taken 2026-07-24 in the closing
review pass of the requirements rewrite #18 stands; the record-once mechanism replacing the standing
meta-gate decided in #263 CodeQL gate)
**Rev:** 2

## Revisions

- **rev 2** — 2026-09-05 — the Decision no longer prescribes a per-run meta-gate or a committed
  `scripts/gate-fixtures/*.tmpl` tree: a negative fixture is built in a throwaway copy at the time
  the gate is recorded instead, and the observation is recorded verbatim in the check's own
  `scripts/cases` file — the convention [`../CI.md`](../CI.md) § *Generated boundary contract*
  already states for every other gate. The never-commit-a-vulnerable-artifact rule and the reasoning
  for it are unchanged; the Consequences bullet naming a second copy of each scanner invocation is
  dropped, since there is no longer a second job to drift from the first (#263 CodeQL gate).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

A security gate that reports "no findings" is indistinguishable from a security gate that is
misconfigured, disabled, or pointed at the wrong tree. The only way to know a scanner fails is to
give it something that must fail — a **seeded negative fixture**: a deliberately vulnerable code
pattern, a pinned known-vulnerable dependency, an image built on a stale base.

Six gates depend on one (first-party and dependency/image scanning, [`CI.md`](../CI.md)), and none of
them is writable today, because the fixture has nowhere to live. `CI.md`'s whole-tree discovery gate
requires every test runner to be invoked in whole-tree discovery form, with no hand-maintained
per-file list and no skip, build tag, or ignore entry silencing a committed test. That forecloses
both obvious placements: leave the fixture in scope and its own gate is permanently red; take it out
of scope and the exclusion is exactly what that gate prohibits.

A nested module looked like the escape and is not one. A nested `go.mod` does stop `./...` traversal
by language boundary rather than by exclusion list, which satisfies the discovery gate on that
axis — but GitHub's dependency graph and Dependabot read nested manifests too. A committed
known-vulnerable pin therefore produces a standing Dependabot alert and corrupts the repository's
own vulnerability posture, whatever the module layout. For code scanning the same problem returns in
a different form:
keeping a fixture out of the production CodeQL scan means `paths-ignore`, the prohibited list again.

## Decision

**No vulnerable artifact is committed in resolvable form — not as ordinary source, not as data left
in the tree.** A negative fixture proving a gate can fail is built in a throwaway copy at the time
the gate is recorded — a scratch directory, or, where the gate only runs in CI, a branch opened as a
draft pull request and never merged — run through the same production job or recipe the gate itself
runs, its finding observed once, and the observation recorded verbatim in the check's own file under
[`scripts/cases/`](../../scripts/README.md). This is the general convention
[`../CI.md`](../CI.md) § *Generated boundary contract* states for every other gate: a check's
fallibility is proven once against a throwaway copy and recorded, not re-tested by a standing
meta-gate.

Two properties follow, and they are the point:

- **The whole-tree discovery gate is satisfied without an exception.** The fixture is never part of
  the tracked tree at all — not committed, not left as data — so there is nothing for whole-tree
  discovery, the dependency graph, or an image build to find, on `main` or on any branch that
  survives it.
- **The assertion is about the production job or recipe itself**, not a parallel invocation kept
  beside it. The throwaway copy runs the identical entry point the gate runs in production, so there
  is no second spelling of the scanner's invocation that could drift from the first.

## Alternatives considered

- **Commit fixtures as ordinary source and exclude them from the production scans.** Rejected: the
  exclusion mechanism is `paths-ignore`, a skip, or a build tag in every case — precisely the
  hand-maintained silencing the whole-tree discovery gate exists to prohibit. It also fails open in
  the ordinary way: an exclusion glob written for a fixture silently covers whatever else lands
  beside it later.
- **Isolate fixtures behind a nested module.** Rejected: it solves runner discovery and nothing else.
  Dependabot and the dependency graph read nested manifests, so a vulnerable pin still yields a
  standing alert against the repository, and the Go and npm dependency-vulnerability gates are
  exactly the ones that need a vulnerable pin. Isolation that the security tooling does not honour is
  not isolation.
- **Verify the gates by observing a historical failure** — point the item at a past PR where the
  scanner did fire. Rejected: it is not repeatable, it decays the moment the scanner is
  reconfigured, and it verifies a past state of the repository rather than the current one.
- **Trust the scanner's own test suite.** Rejected: it proves the vendor's binary works, not that
  this repository's invocation of it is wired to fail the build.

## Consequences

- **A gate proves it can fail, not merely that it ran.** This is the only property that
  distinguishes a working security gate from an absent one, and six items now have a way to state it.
- **The pattern is not particular to security.** Any gate whose failure mode is silent success — a
  drift check, a link checker, a schema validator — is proven the same way: once, against a
  throwaway copy, recorded rather than re-tested by a standing meta-gate.
