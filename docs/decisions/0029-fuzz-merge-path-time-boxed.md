# 0029 — Fuzz on the merge path, time-boxed

**Status:** accepted
**Decided:** 2026-09-05 (#267 backend fuzz tier)
**Rev:** 1

## Revisions

- **rev 1** — 2026-09-05 — first written (#267 backend fuzz tier).

## Context

SRS014<!-- No single upstream exchange can stall or exhaust the backend --> already carries a
verification, TST030<!-- Upstream timeout & size-bound test -->, which drives a hung upstream and an
oversized response against a live handler. That tier is network-level — it exercises a slow or huge *transport*
— and says nothing about a CPU hang parse-time, crafted input can trigger inside a parser itself
before a single byte reaches the network. A shaping library, a request decoder or a `<NAME>_FILE`
reader can all be driven by bytes an operator does not control, and none of the tree's existing tiers
assert that no such input makes one of them spin or panic rather than return.

Go ships a native fuzzing engine (`go test -fuzz`) built for exactly this: mutate a seed corpus,
run the target, and report a crash or an unbounded run as a failure. Go's own guidance is a short,
bounded run on the merge path with long unattended runs left to a developer's machine, which is the
shape this decision follows.

## Decision

**A time-boxed fuzz tier runs on the merge path, native, no new dependency.** Each fuzz target runs
under `just check-fuzz`, one `go test -fuzz` invocation per target at a fixed `-fuzztime` of 10
seconds, joining `just verify` and gated in CI the same way `check-go` is. Every case asserts no
panic and no hang within the budget; a target whose own doc comment additionally claims a property —
`Shape`'s determinism — asserts that too.

**No panic is the engine's own; no hang is each target's.** Go's fuzzing engine bounds the search at
`-fuzztime` and reports a panic on the spot, which a ten-second budget catches reliably. Its own
documented hang detection ([`CI.md § Backend fuzz`](../CI.md#backend-fuzz) cites the exact
limitation) does not resolve inside a budget this short: the search's own graceful end-of-run
reliably arrives first, and a hung input is dropped rather than reported. So each target wraps its
own call in a one-second per-input wall-clock deadline (`runWithin`,
`backend/internal/modules/weather/weather_test.go`) that fails the test and names the target itself —
verified against a seeded hang reachable from the tracked seed, a hang reachable only by mutation, and
a seeded panic, all inside the ten-second budget, in
[`scripts/cases/check-fuzz.md`](../../scripts/cases/check-fuzz.md).

**Targets are named by the module contract's Part 3, not enumerated here.** The obligation is: fuzz
targets for a shaping library's parser, and for the route's request decode and validation, each run
by `check-fuzz`. The weather module, in the same change that adds the clause, is what the contract's
own "walk it against a conforming module" procedure asks for — `FuzzShape`, `FuzzDecodeRequest` and
`FuzzValidate`. A module added later that matches the same shape picks up the same three; a module
with no shaping library owes none.

**The corpus lives at Go's own default, `testdata/fuzz/<FuzzFuncName>/`, committed only when a
crasher is found.** No repository-specific override: the seed corpus a fuzz function's own `f.Add`
calls establish is what ships, and a crasher Go's minimizer writes there is the regression entry the
next run replays as an ordinary test under `check-go`'s plain `go test ./...`.

**Frontend is out of scope.** The frontend's own parsing — configuration validation — is browser-side
TypeScript ([ADR 0007 rev 2](0007-config-validation-allocation.md)) and is Playwright-covered; Go's
fuzzing engine cannot reach it, and nothing here asks it to.

**No new `TST` item.** SRS014<!-- No single upstream exchange can stall or exhaust the backend -->
already exists and already carries TST030<!-- Upstream timeout & size-bound test -->; the parse-time
hang this tier exercises is a different failure mode under the same requirement text, not an unmet
obligation,
so a new tree item would restate rather than add. Recording a fixed `-fuzztime` and a seed-corpus
convention is a repository convention a machine decides, which
[ADR 0011 rev 2](0011-requirement-or-convention.md) routes to `CI.md` — the same routing this ADR's
own precedent, the Contract tier's fixture-and-schedule machinery, already took.

## Alternatives considered

**A scheduled job, off the merge path.** Rejected. The Contract tier's live run is scheduled because
an upstream's own uptime is not this project's to answer for and a red run there would train an
author to ignore it; neither reason holds for fuzzing a function this repository owns outright. A
parser that hangs on crafted input is a defect in the tree, catchable before it merges, and delaying
that catch to a schedule finds the defect after a change has already landed rather than before.

**No fuzzing at all, on the argument that the existing table tests already exercise malformed
input.** Rejected. A table test asserts against inputs a person thought to write; a fuzzer's value is
in the inputs nobody thought to write, which is precisely the class
SRS014<!-- No single upstream exchange can stall or exhaust the backend --> is written broadly enough
to forbid and TST030<!-- Upstream timeout & size-bound test --> does not reach.

**A third-party fuzzing engine (e.g. `go-fuzz`).** Rejected. Go's native `go test -fuzz`, shipped with
the toolchain since Go 1.18, covers the same mutate-and-report shape with no new dependency; a
third-party engine would buy nothing this decision needs at the cost of a supply-chain surface this
project otherwise keeps narrow.

**An external wall-clock `timeout` wrapping each `check-fuzz` invocation.** Rejected, and measured
before being rejected: a bound generous enough to cover compile, ten seconds of fuzzing and shutdown
never fires, because `go test -fuzz` reliably ends its own search at `-fuzztime` regardless of a
hung worker — the graceful shutdown is what the wrapper would be racing, and it always wins. Tightening
the wrapper below `-fuzztime` trades away search time for a bound that fires on an honest run as
readily as a hung one, which answers a different question than the one asked. The per-input deadline
inside each target answers the actual question, at the actual granularity a hang happens at.

## Consequences

- **A module's shaping library and route decode carry a fuzz obligation the module contract states
  once**, rather than a per-module decision each time one is added. Writing the three targets for a
  conforming module is now part of "building the module," the same way its render test and unit
  tests are.
- **The merge path grows by roughly three times the per-target budget.** At 10 seconds and three
  targets, `check-fuzz` costs about 30 seconds plus per-invocation Go toolchain startup — small
  against the rest of `just verify`, and it stays that shape as the number of targets grows one
  module at a time rather than jumping if a later decision changes the per-target figure.
- **A crasher found after this lands is a regression, not a discovery.** The corpus entry Go writes
  on a failing run is committed, and the fixing change is what makes `check-fuzz` green again; the
  tier is now what stands between a parse-time hang and a merge.
- **A target that legitimately needs longer than one second on some input reads as a hang.** The
  per-input deadline cannot distinguish a stuck loop from a slow-but-finite computation; a false
  positive here is evidence the budget is wrong for that target, not that the mechanism is.
- **Reopen premise.** Revisit the fixed 10-second `-fuzztime` budget if the merge path's total time
  becomes a standing complaint, or if a real target needs longer than 10 seconds to reach the seeds
  that exercise it; revisit the one-second per-input deadline if a legitimate input needs longer than
  that to finish. Either is evidence a number was wrong, not evidence the tier itself should move off
  the merge path.
