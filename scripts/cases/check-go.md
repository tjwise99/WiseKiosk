# `check-go`

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Backend build, vet and tests*'s, and what the tests it runs
guarantee is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a `git archive f8c99cb` copy of the tracked tree — the commit before the one adding the
recipe — with the working-tree `justfile` copied in over it, seeded in place, and `just check-go` run
inside the copy. Go 1.26.5, against the `1.26` the `backend-tests` job pins. The recipe reads the
worktree rather than `git ls-files`, so no case needs a commit; each copy is committed anyway so the
seed can be asserted to have landed (`git diff --quiet` before the run, a clean diff read as the case
failing).

| Direction | Case | Input |
|---|---|---|
| Must fail | Code that does not compile | `health.go`'s `body` constant bound to an undefined identifier — `build` exits 1 naming `undefined: liveness`, and `vet` and `test` never run |
| Must fail | Code that compiles and `vet` rejects | the status argument dropped from `health.Check`'s second `fmt.Errorf` — `build` passes, `vet` exits 1 with `format %s reads arg #2, but call has 1 arg` |
| Must fail | Code that compiles, passes `vet`, and breaks a test | `body` bound to the empty string, a liveness endpoint answering nothing — `TestHandlerReportsServing` fails and no step before it does |
| Must fail | No Go package under `backend/` at all | every `*.go` deleted — `build` warns `"./..." matched no packages` and exits 0, and `vet` exits 1 with `no packages to vet`, so the empty population is refused by the second step rather than by the first |
| Must pass | The tree as it stands | — |

**The failing rows are seeded to fail at three different steps**, which is what makes the recipe three
checks rather than one: a step is reached only because the steps before it passed, so a row failing at
`build` proves nothing about whether `vet` or `test` can fail at all. Which step failed is read from
the recipe line `just` names on exit, not from the exit code, which is 1 in every row.

**Known gaps.**

- **A tree holding a package but no test passes.** Every `*_test.go` deleted from `backend/` and the
  source left in place, `just check-go` exits 0 over a `[no test files]` line per package — measured,
  not inferred. `go test` reports a package carrying no test file as a non-failure, so a test lost to
  a build tag, a wrong directory or a deletion is invisible here, and a run that executed nothing
  reads exactly like a clean tier. It is the row above's neighbour and the row above does not reach
  it: `vet` refuses an empty *package* set and has nothing to say about an empty *test* set. Closing
  it is #82 dead-test detector's.
- **A cached result is read as a pass.** `go test` answers `(cached)` for a package whose inputs have
  not moved since a passing run, so a local re-run over an untouched tree asserts the cache rather
  than an execution. Go invalidates the entry on any input the test read, so it is not a stale-result
  hole — it is why every row above runs in a fresh copy, where `cmd`'s bounded-footprint soak takes
  its full ~120s rather than returning instantly.
