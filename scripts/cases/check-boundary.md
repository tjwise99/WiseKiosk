# `check-boundary` and `check-boundary-selftest.py`

The inputs these have been run against, in both directions. What they *assert*, and why, is
[`docs/CI.md`](../../docs/CI.md) § *Generated boundary types*'s; how to run a case is
[`../README.md`](../README.md)'s.

Exercised at `efda030`, self-test md5 `71090a75c4dd020979f851e1cc6cc04b`. The commit is pinned as
well as the script: four of the six rows seed the `check-boundary` recipe, which the script's own
hash cannot see.

**The subject here is a gate that tests a gate**, so the cases below are one level up from the usual:
`check-boundary-selftest` already seeds drift into `check-boundary`, and what these rows seed is
`check-boundary` itself, to establish that the self-test reports a broken gate rather than agreeing
with it.

The fixture is a copy of the tracked tree with its own `git init`/commit, `frontend/node_modules`
symlinked in after the commit — before it, `.gitignore`'s `node_modules/` does not match a *symlink*
of that name and the link is committed, which is how the first run of these cases failed.

| Direction | Case | Input |
|---|---|---|
| Must fail | The gate cannot see drift at all | `git diff --exit-code HEAD` deleted from the `check-boundary` recipe |
| Must fail | The gate sees one language and not the other | the diff's pathspec narrowed to `backend/internal/boundary/` |
| Must fail | A generator does not run, so nothing is regenerated | the `openapi-typescript` invocation pointed at a binary that does not exist |
| Must fail | `check-boundary` with the toolchain absent **destroys nothing** | the fixture built with no `frontend/node_modules` at all, `just check-boundary` run directly |
| Must pass | The clear-then-regenerate step deleted from the recipe | `rm -rf backend/internal/boundary frontend/src/lib/boundary` removed — the known gap below, recorded as a passing row so it is measured rather than assumed |
| Must pass | The tree as it stands | — |

**What the cases prove, beyond what the table shows on its own.**

- **The one-sided row is what makes "one language at a time" a measurement rather than a phrase.**
  With the pathspec narrowed to Go, the self-test reports exactly one problem and names the
  TypeScript side — so the two seeds are decided independently rather than by one comparison that
  happens to cover both. A self-test that ran both seeds together would report the same failure
  count for a gate missing either half.
- **The missing-generator row is caught by the baseline, not by a drift seed.** The self-test runs
  the gate once against an unseeded copy before it seeds anything, and exits on a non-zero result
  with a message saying the fixture measured nothing. Without that first run, a gate broken badly
  enough to fail on everything would report both drift seeds as "correctly rejected" and pass.
- **The toolchain-absent row asserts what was *not* done, which is the whole of it.** `git status
  --porcelain` is empty after the run: the gate exits non-zero having deleted nothing. Before the
  generator-resolution step this row failed — exit 127 with `frontend/src/lib/boundary/schema.ts`
  staged as a deletion, because the recipe cleared the generated directories before discovering it
  could not refill them. Both directions were run; the row is the fix, and the reproduction is what
  says the fix was needed.
- **The seed is committed, not written into the working tree.** `check-boundary` clears the
  generated directories and regenerates them before it diffs, so a seed left uncommitted is deleted
  by the gate's own clear step and the gate then passes — the first version of this self-test did
  exactly that and reported the gate healthy. What the gate compares is a regeneration against
  `HEAD`, which is what a seed has to move.

**Known gaps.**

- **Dropping the clear-then-regenerate step is not caught.** Seeded: with
  `rm -rf backend/internal/boundary frontend/src/lib/boundary` deleted from the recipe, the
  self-test still passes, because both generators overwrite their output whether or not it was
  cleared first and the committed drift is still visible to the diff. The step guards the case where
  a generator emits *nothing* — a stale file left in place is byte-identical to what is committed —
  and that case reaches the self-test only through the baseline row above, which fails for a
  generator that errors rather than for one that silently emits nothing. Closing it means a seed
  that makes a generator exit zero having written no file, which no invocation here does.
- **The schema is never wrong here.** Every row seeds the generated side; nothing asks whether the
  schema describes what the boundary actually carries. `docs/CI.md` states that as the gate's own
  limit, and it is not a gap in these cases so much as the gate's scope.
- **`check-boundary`'s local run compares the commit against the worktree**, so staged content
  diverging from the worktree is let through and a plain commit then lands an index the gate never
  read. It is inherited from the recipe shape rather than measured here — the same local-false-green
  `check-arch` carries and records against its own seed
  ([cases/check-arch.md](check-arch.md)) — and it is unreachable in CI, whose checkout has an index
  equal to its commit.
