# `check-fuzz`

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Backend fuzz*'s, and what the targets it runs guarantee is
[`docs/TESTING.md`](../../docs/TESTING.md)'s Fuzz row; how to run a case is
[`../README.md`](../README.md)'s.

`check-fuzz` is a new recipe rather than a step added to `check-go`, so each case here is a
`git archive` of the **PR's own head** — `3c352f3`, the commit that carries both the recipe and the
per-input deadline (`runWithin`, `weather_test.go`, md5 `e8177137a068d4bad53392dc45f8b4ca`;
`justfile`, md5 `f11ef36b216ec5972a72f59a0209076c`) — rather than a commit before the step existed,
which fits `check-go.md`'s device for a step added to an existing recipe and not a wholly new one.
The seed is confirmed to have landed (`git diff --quiet` against the pinned commit) before
`just check-fuzz` is run inside the copy.

**Why a hang case proves two mechanisms, not one.** Go's fuzzing engine reports a panic the moment
it happens, which the rows below confirm. For a hang, its own documentation describes a
per-execution timeout ("the fuzz target took too long to complete... this may fail due to a deadlock
or infinite loop", <https://go.dev/security/fuzz/>) — but that detection did not resolve inside this
tier's ten-second search budget in any run below: a hang reachable from the tracked seed corpus ran
the full budget and exited `PASS`, the hung entry silently dropped. `runWithin`'s one-second
per-input deadline is what actually catches a hang at this budget, and the rows below are what
proves it does.

| Direction | Case | Input |
|---|---|---|
| Must fail | A panic in the shaping library, reachable from the tracked seed | `shapeCurrent` panics unconditionally after its nil-check. `FuzzShape`'s own seed (the captured response) reaches it during baseline coverage gathering — `just check-fuzz` fails on its first line, exit 1, in 0.014s: `failure while testing seed corpus entry: FuzzShape/seed#0`, `fuzzing process hung or terminated unexpectedly: exit status 2` |
| Must fail | A hang in the shaping library, reachable from the tracked seed | `shapeCurrent` loops forever (`for {}`) after its nil-check, reached the same way. `just check-fuzz` fails on the same line, exit 1, in 1.03s: `weather_test.go:727: FuzzShape did not return within 1s`. No crasher is written under `testdata/fuzz/` — the failing input is the tracked seed itself, already committed, and Go writes a crasher only for an input it discovers; the case below is where one is |
| Must fail | A hang in the shaping library, reachable only by mutation | `Shape` loops forever on an empty body (`len(body) == 0`), which the tracked seed (the non-empty captured response) never reaches. `just check-fuzz` fails on the same line, exit 1, in 1.85s, `FuzzShape did not return within 1s`, and writes `testdata/fuzz/FuzzShape/caf81e9797b19c76` (`[]byte("")`) — replaying it with plain `go test -run=FuzzShape` (no `-fuzz`) fails the same way, which is `check-go`'s plain `go test ./...` catching a committed crasher as a regression |
| Must pass | The clean tree | `just check-fuzz` passes all three lines: `FuzzShape` (fresh cache, 25 execs, `new interesting: 0`), `FuzzDecodeRequest` (232,172 execs, 175 interesting entries found), `FuzzValidate` (315,847 execs, 11 interesting entries found) — 34s total, matching the ADR's ~30s-plus-toolchain-startup estimate |
| Must pass | The budget spelled differently | Each target run individually with `-fuzztime 1s` against the same clean tree passes: `FuzzShape` (19 execs), `FuzzDecodeRequest` (17,676 execs), `FuzzValidate` (37,423 execs) |

**`FuzzShape`'s own throughput is an order of magnitude below the other two targets', clean or not.**
25-1,100 execs/sec against `FuzzDecodeRequest`'s and `FuzzValidate`'s 20,000-35,000: `Shape` walks a
far larger call graph (`shapeCurrent`, `shapeHourly`, `shapeDaily` and their helpers) than
`decodeRequest`'s two-field decode or `validate`'s two comparisons, so the engine's own per-exec
coverage bookkeeping costs more per call. Measured directly (`go test -bench`, outside the fuzzing
engine), `Shape` itself runs a single call in ~34µs — the gap is the engine's overhead walking a
bigger function, not the function being slow, and it is why the per-input budget is generous against
that measured cost rather than tuned to the fuzzer's own observed throughput.

**Known gaps.**

- **A hang inside the tracked seed corpus produces no committed regression entry.** Go writes a
  crasher only for an input its own search discovers; a hang the seed corpus itself reaches fails
  every run identically without one, which is sufficient (the fix removes the hang, not a corpus
  entry) but means the two must-fail hang rows above are asymmetric in what they leave behind.
- **The per-input deadline cannot tell a hang from a slow-but-finite computation.** A target that
  legitimately needs more than a second on some input fails exactly like a real hang; see
  [ADR 0029 rev 1](../../docs/decisions/0029-fuzz-merge-path-time-boxed.md)'s Consequences.
- **`runWithin`'s goroutine outlives a failing test.** A genuine hang leaves its goroutine running for
  the life of the process — Go provides no way to kill one from outside — which is bounded by the
  process itself exiting at the end of the `go test` invocation, not by anything this check does.
