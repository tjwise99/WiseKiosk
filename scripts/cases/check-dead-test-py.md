# `check-dead-test.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md) § *Gate wiring*'s; how to run a case is [`../README.md`](../README.md)'s.

The four failing kinds are seeded into the working tree and staged — the population is `git ls-files`,
so an unstaged seed is invisible to it and would be reported by the untracked guard instead of by the
diff. Each seed is then **un**-seeded in place and the check re-run, which is what separates *the file
is dead* from *the file is new*: every failing row below has a passing row beside it differing only in
the property the row is about. `git status --short` is empty after each pair. The two fail-closed rows
run in a throwaway `git init` tree, per [`../README.md`](../README.md)'s recipe.

Pinned to `scripts/check-dead-test.py` at commit `3f14804`, md5 `712dd5445a3bb5c82b358cd34c29d023`,
over a tree whose clean baseline is **21 test file(s), all reached: 12 go, 2 vitest, 7 playwright.**
Toolchain: Go 1.26.5 on `linux/amd64`, Vitest 4.1.10 and Playwright 1.62.1 on Node 24.18.0 — the
versions `frontend/package-lock.json` pins and the `1.26` the workflow pins.

| Direction | Case | Input |
|---|---|---|
| Must fail | Silenced by a config-level exclude | `frontend/src/dead.test.ts` beside `exclude: ['**/node_modules/**', 'src/dead.test.ts']` in `frontend/vitest.config.ts` — reported as reached by no runner |
| Must pass | The same file, the exclude removed | Vitest discovers it: `22 test file(s), all reached: 12 go, 3 vitest, 7 playwright` |
| Must fail | Excluded by a build tag | `backend/internal/health/dead_test.go` opening `//go:build never` — `go list` exits 0 and omits it from `TestGoFiles` |
| Must pass | The same file, the tag removed | `13 go` |
| Must fail | Outside the runner's glob | `frontend/src/dead.spec.ts`, where Vitest's `include` is `src/**/*.test.ts` and Playwright's `testDir` is `tests/render` — no runner reaches it |
| Must pass | The same file renamed `dead.test.ts` | `3 vitest` |
| Must fail | In a directory no module reaches | a repo-root `dead_test.go` — `go -C backend list ./...` never sees it |
| Must pass | The same file under `backend/internal/health/` | `13 go` |
| Must fail | A runner that cannot be run | a scratch tree holding `x_test.go` and no toolchain — three failure lines, one per runner, **and no dead-file finding**: the difference is not computed against a reach nobody measured |
| Must fail | One runner down, the others fine | `frontend/node_modules/.bin/vitest` moved aside — one failure line, and neither of the two Vitest files is reported dead |
| Must fail | A population that resolves to nothing | a scratch tree with no test file — refused before any runner is invoked |
| Must fail | An untracked test file | `frontend/src/untracked.test.ts` left unstaged — outside a `git ls-files` population, so reported rather than silently unjudged (`docs/CI.md` § *Repository shape*) |
| Must pass | The tree as it stands | the baseline line above |

**The un-seeded row is the case, not the seeded one.** A check that reported every newly added test
file as dead would pass all four failing rows and be worthless; each passing row differs from the
failing one above it by exactly the exclude, the tag, the extension or the directory, so what the row
measures is the property it names.

**Two runtime `t.Skip`s are reached, and that is the intended verdict.**
`backend/internal/secret/secret_test.go` and `backend/internal/router/router_test.go` each skip
conditionally at run time; both are in the 12 the baseline counts. The gate reads *discovery*, so a
file that compiles and is enumerated is reached whatever it decides to do when executed. A
config-level exclude is the "skip" this gate is about, which is the first row.

**Known rejections.** `backend/cmd/footprint_linux_test.go` is reached because the host is Linux:
`go list` applies the `_GOOS` filename suffix, and the same command under `GOOS=darwin` returns 11
test files rather than 12, so the check would report that file dead on a macOS contributor machine —
measured, not inferred. That is the faithful reading of *what a runner would discover here*, and the
gating verdict is the `ubuntu-latest` job's; a contributor on another platform sees a false finding
locally.

**Known gaps.** The population is decided by filename, so a test in a file matching none of the five
patterns is outside it and can be dead unreported — the check's own blind spot, and the reason the
patterns are broader than any runner's configuration rather than copied from one. And discovery is
all this decides: a file a runner enumerates counts as reached whether or not it asserts anything,
which is [`docs/TESTING.md`](../../docs/TESTING.md)'s to hold.
