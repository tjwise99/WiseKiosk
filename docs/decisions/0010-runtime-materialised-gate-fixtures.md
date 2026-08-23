# 0010 — Materialise negative gate fixtures at run time; never commit a resolvable vulnerable artifact

**Status:** accepted
**Decided:** 2026-07-24 (closing review pass of the requirements rewrite #18)
**Rev:** 1

## Revisions

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

**No vulnerable artifact is committed in resolvable form.** A negative fixture is committed as
**data, not source** — `scripts/gate-fixtures/*.tmpl` — a file type no test runner, module graph,
dependency scanner, or image build discovers.

A **meta-gate** materialises each fixture at run time: copy it into a temporary directory, write a
throwaway manifest (`go.mod`, `package.json`, `Dockerfile`) beside it, invoke **the same scanner
binary the production job invokes**, assert the expected finding and a non-zero exit, then discard
the directory.

Three properties follow, and they are the point:

- **The whole-tree discovery gate is satisfied without an exception.** Nothing is skipped, tagged,
  ignored, or listed — the fixture is not a test file, so whole-tree discovery has nothing to
  exclude.
- **Nothing vulnerable ever exists** during the production scan, in the dependency graph, or in a
  published image. No gate is ever permanently red and no alert is ever standing.
- **The assertion is about the production scanner**, not a copy of it. A fixture that passed a
  differently-configured scanner would prove nothing.

The meta-gate and `scripts/gate-fixtures/` are both outside dot-directories — the limit
[ADR 0002 rev 3](0002-requirements-management-doorstop.md) records.

A fixture materialised at run time is not an exclusion under the whole-tree discovery gate, so the
pattern cannot be mistaken for what that gate bans and "corrected" into real source.

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
- **Fixture content is unreviewable by the normal tooling** — it is data, so linters, type checkers,
  and the compiler never see it. That is the cost of the isolation. It is bounded by the fixtures
  being small, few, and asserted-against: a fixture that stops producing its expected finding fails
  the meta-gate, which is a stronger check than review would give.
- **The pattern generalises past security.** Any gate whose failure mode is silent success — a drift
  check, a link checker, a schema validator — can be proven live the same way, and should be.
- **A second copy of each scanner invocation exists**, in the meta-gate. If it drifts from the
  production invocation the meta-gate proves the wrong thing; the meta-gate must invoke the same
  entry point rather than restate its flags.
