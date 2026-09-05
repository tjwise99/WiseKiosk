# `check-lint-go`

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Lint and type checks*'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a `git archive` copy of the tracked tree at `0a34e62`, the commit carrying
`backend/.golangci.yml` and the `check-lint-go` recipe, with `just check-lint-go` run inside the
copy. golangci-lint 2.13.2, built with Go 1.26.5, against the default linter set (errcheck, govet,
ineffassign, staticcheck, unused).

| Direction | Case | Input |
|---|---|---|
| Must fail | An unchecked error return | `health.go`'s `GetHealthz` writes a response body with `w.Write([]byte("ok"))`, its `(int, error)` return discarded — `errcheck` exits 1 naming the line |
| Must pass | The same write, error explicitly discarded | `w.Write(...)` rewritten `_, _ = w.Write(...)` — the legal spelling every fix in this PR uses, `errcheck` reports nothing |
| Must pass | The tree as it stands | — |

**Known gaps.** `golangci-lint`'s own default `max-same-issues: 3` caps identical-message findings at
three per run: a fourth `file.Close` errcheck finding in `staticserve.go` was hidden behind three
already-reported occurrences on the first real run against this tree — **13 findings total, not the
12 first measured** (11 errcheck, 2 staticcheck) — and only surfaced once those three were fixed.
Nothing here raises the cap or asserts against it — a config widening it is a rule change beyond the
default set this decision adopted, and the finding it would have caught either shows up once the
issues ahead of it clear, as this one did, or is caught at review.
