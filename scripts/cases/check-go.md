# `check-go`

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Backend build, vet and tests*'s, and what the tests it runs
guarantee is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a `git archive` copy of the tracked tree — at the commit before the one adding the step
the row exercises, so `f8c99cb` for the `build`/`vet`/`test` rows and `556ac3a` for the `-race` rows —
with the working-tree `justfile` copied in over it, seeded in place, and `just check-go` run inside the
copy. Go 1.26.5, against the `1.26` the `backend-tests` job pins. The recipe reads the worktree rather
than `git ls-files`, so no case needs a commit; each copy is committed pristine anyway so the seed can
be asserted to have landed (`git diff --quiet` after seeding, exit 0 read as the case failing to
apply).

| Direction | Case | Input |
|---|---|---|
| Must fail | Code that does not compile | `health.go`'s `body` constant bound to an undefined identifier — `build` exits 1 naming `undefined: liveness`, and `vet` and `test` never run |
| Must fail | Code that compiles and `vet` rejects | the status argument dropped from `health.Check`'s second `fmt.Errorf` — `build` passes, `vet` exits 1 with `format %s reads arg #2, but call has 1 arg` |
| Must fail | Code that compiles, passes `vet`, and breaks a test | `body` bound to the empty string, a liveness endpoint answering nothing — `TestHandlerReportsServing` fails and no step before it does |
| Must fail | No Go package under `backend/` at all | every `*.go` deleted — `build` warns `"./..." matched no packages` and exits 0, and `vet` exits 1 with `no packages to vet`, so the empty population is refused by the second step rather than by the first |
| Must fail | A race no test failure reaches | `Allow`'s `defer l.mu.Unlock()` replaced by an `l.mu.Unlock()` before the `b.tokens < 1` check — the bucket map stays guarded and the token arithmetic does not. `just check-go` exits 1 on the `test -race` line, having passed the plain `test` one: `go test ./internal/ratelimit/` alone exits **0** where `go test -race ./internal/ratelimit/` exits **1** with `WARNING: DATA RACE`, naming the read at `ratelimit.go:56` against the write at `:59` |
| Must fail | The mutex removed outright | `Allow`'s `l.mu.Lock()` and `defer l.mu.Unlock()` both deleted — `vet` exits 0 and `go test ./internal/ratelimit/` exits 1 on `fatal error: concurrent map writes`, so the plain `test` step already refuses it. Recorded for contrast: the blunt regression is not what `-race` is for |
| Must fail | A schema path moved with the Go tree untouched | `/api/weather` renamed to `/api/forecast` in `boundary/openapi.yaml` and nothing under `backend/` edited. With the cache warm, the plain `test` step answers `ok … (cached)`; the `-count=1` step over `internal/registry` exits 1 on both directions of the comparison — `entry "weather" serves /api/weather, which the schema does not declare` and `the schema declares /api/forecast and no entry serves it` |
| Must fail | The schema unreadable where the comparison expects it | `schemaPath` pointed at a file holding no path items — both comparison cases exit 1 on `the schema scan found no /healthz among map[], so it is not reading path items`, rather than passing over an empty population |
| Must pass | The tree as it stands | — |

**The failing rows are seeded to fail at five different steps**, which is what makes the recipe five
checks rather than one: a step is reached only because the steps before it passed, so a row failing at
`build` proves nothing about whether `vet`, `test`, the uncached `test` or `test -race` can fail at all. Which step failed
is read from the recipe line `just` names on exit, not from the exit code, which is 1 in every row.

**The two race rows are the argument for the `-race` step, and only the first of them makes it.** The
blunt row is caught by the plain `test` step, so it justifies nothing `-race` adds; the subtle row is
caught by nothing but `-race`. Fifty consecutive executions of the seeded concurrency test
(`test -count=50 -run TestConcurrentCallersShareOneBucket`) exit 0 without `-race` — the grants total
`burst` whether or not the arithmetic that produced them was synchronised — and the detector fails the
first execution under `-race`. A gate reading the count cannot tell the two apart.

**Known gaps.**

- **A tree holding a package but no test passes.** Every `*_test.go` deleted from `backend/` and the
  source left in place, `just check-go` exits 0 over a `[no test files]` line per package — measured,
  not inferred. `go test` reports a package carrying no test file as a non-failure, so a test lost to
  a build tag, a wrong directory or a deletion is invisible here, and a run that executed nothing
  reads exactly like a clean tier. It is the row above's neighbour and the row above does not reach
  it: `vet` refuses an empty *package* set and has nothing to say about an empty *test* set. It is
  closed by the whole-tree discovery gate, `check-dead-test`
  ([cases](check-dead-test-py.md)), whose population is the tracked tree rather than what a runner
  executed.
- **`-race` detects, it does not prove.** It reports only the unsynchronised accesses a run actually
  performs, so a race on a path the tests never drive is not caught — and the `-race` step's whole
  value is on loan from the concurrency tests underneath it, which force the contention it observes.
  With the subtle row's seed still in place, `test -race -run 'Test[^C]' ./internal/ratelimit/` — the
  package's every test but the concurrent one — exits 0: the race is there and undriven, so unseen.
  The step is also scoped to `./internal/...`, so nothing it reports concerns `cmd`, whose
  bounded-footprint soak is excluded because the detector's shadow allocation would inflate the
  resident set that soak asserts is bounded.
- **A cached result is read as a pass, and the cache does not watch everything the tests read.**
  `go test` answers `(cached)` for a package whose inputs have not moved since a passing run, so a
  local re-run over an untouched tree asserts the cache rather than an execution — which is why every
  row above runs in a fresh copy, where `cmd`'s bounded-footprint soak takes its full ~120s rather
  than returning instantly. Go invalidates the entry on files the test read **inside the module
  root**, and `boundary/openapi.yaml` is outside it: measured, a schema-only edit leaves the third
  step reporting `(cached)`. That is why the `-count=1` step exists and why it is scoped to the one
  package that reads the schema. **Any future test reading a file outside `backend/` inherits the
  same hole** and is not covered by that step.
