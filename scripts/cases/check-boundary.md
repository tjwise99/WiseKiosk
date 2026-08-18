# `check-boundary`

The inputs the drift gate has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md) § *Generated boundary types*'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a copy of the tracked tree with its own `git init`/commit, the seed committed into that
copy, and `just check-boundary` run inside it — the recipe reads `git ls-files` and diffs against
`HEAD`, so an uncommitted seed is not what it compares. `frontend/node_modules` is symlinked in after
the commit: before it, `.gitignore`'s `node_modules/` does not match a *symlink* of that name and the
link is committed. The generators are pinned (oapi-codegen `v2.8.0` through `backend/go.mod`'s tool
directive, openapi-typescript `7.13.0` through `frontend/package-lock.json`), which is what makes a
regeneration reproducible.

| Direction | Case | Input |
|---|---|---|
| Must fail | A committed Go type moved away from the schema | edit `backend/internal/boundary/boundary.gen.go`, commit, run the gate |
| Must fail | A committed TypeScript type moved away from the schema | edit `frontend/src/lib/boundary/schema.ts`, commit, run the gate |
| Must fail | A generator does not run, so nothing is regenerated | the `openapi-typescript` binary made unresolvable — the gate destroys nothing and exits non-zero |
| Must pass | The tree as it stands | — |

**What the cases prove, beyond what the table shows on its own.**

- **The two type-drift rows are seeded and run one language at a time**, so each side's agreement is
  decided independently rather than by one comparison that happens to cover both.
- **The missing-generator row asserts what was *not* done.** With `openapi-typescript` unresolvable,
  `git status --porcelain` is empty after the run: the gate resolves both generators *before* it
  clears anything (`justfile`'s `check-boundary`), so it exits non-zero having deleted nothing.
  Before that resolution step this failed — exit 127 with `frontend/src/lib/boundary/schema.ts`
  staged as a deletion, because the recipe cleared the generated directories before discovering it
  could not refill them. The row is the fix, and the reproduction is what says the fix was needed.
- **A missing generator reads as a deletion, not a false clean**, because the recipe clears the
  generated directories before regenerating: a stale file left in place would be byte-identical to
  what is committed, where an absent one shows in the diff. The non-empty assertions on each output
  are the other half — an emitted-but-empty file is a deletion the diff sees anyway, and neither
  catches the case the other does.

**Known gaps.**

- **A generator that exits zero having written no file is not seeded.** The clear-then-regenerate
  step plus the non-empty assertions catch a generator that errors or emits an empty file; a
  generator that succeeds silently while writing nothing is not reachable through any invocation
  here. Recorded rather than closed.
- **The schema is never wrong here.** Every row seeds the generated side; nothing asks whether the
  schema describes what the boundary actually carries. `docs/CI.md` states that as the gate's own
  limit, and it is the gate's scope rather than a gap in these cases.
- **`check-boundary`'s local run compares the commit against the worktree**, so staged content
  diverging from the worktree is let through and a plain commit then lands an index the gate never
  read. It is inherited from the recipe shape rather than measured here — the same local-false-green
  `check-arch` carries and records against its own seed ([cases/check-arch.md](check-arch.md)) — and
  it is unreachable in CI, whose checkout has an index equal to its commit.
