# `check-boundary`

The inputs the drift gate has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md) § *Generated boundary contract*'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a copy of the tracked tree with its own `git init`/commit, the seed committed into that
copy, and `just check-boundary` run inside it — the recipe reads `git ls-files` and diffs against
`HEAD`, so an uncommitted seed is not what it compares. `frontend/node_modules` is symlinked in after
the commit: before it, `.gitignore`'s `node_modules/` does not match a *symlink* of that name and the
link is committed. The generators are pinned (oapi-codegen `v2.8.0` through `backend/go.mod`'s tool
directive, orval `8.26.0` and its `prettier` formatter through `frontend/package-lock.json`), which
is what makes a regeneration reproducible.

| Direction | Case | Input |
|---|---|---|
| Must fail | A route renamed in the schema and nowhere else | rename `/healthz` to `/livez` in `boundary/openapi.yaml`, commit, run the gate — **both** generated files differ |
| Must fail | A committed Go type moved away from the schema | edit `backend/internal/boundary/boundary.gen.go`, commit, run the gate |
| Must fail | A committed TypeScript type moved away from the schema | edit `frontend/src/lib/boundary/client.ts`, commit, run the gate |
| Must fail | A generator does not run, so nothing is regenerated | the `orval` binary made unresolvable — the gate destroys nothing and exits non-zero |
| Must fail | A generator exits zero having emitted no route table | drop `std-http-server` from `backend/oapi-codegen.yaml` — `go build` reports `cmd/main.go: undefined: boundary.HandlerFromMux` |
| Must fail | A generator's configuration silently parses as an older schema | `generate: [models, std-http-server, client]` with no `output-options` — accepted as the v1 configuration, exits zero, prunes the models; `go build` reports `internal/router/router.go: undefined: boundary.UpstreamFailure` |
| Must fail | Generated TypeScript that does not compile | a component named `Headers` in the schema **carrying a required property**, which shadows the DOM type orval's own response wrapper uses — `tsc` reports `TS2352` |
| Must pass | The tree as it stands | — |

**What the cases prove, beyond what the table shows on its own.**

- **The route row is the one the types-only setup could not reach.** Renaming the path in the schema
  alone fails on `boundary.gen.go` *and* `client.ts`, because each side's route table is
  generated. The same seed was measured against the previous generators for comparison, and the two
  sides differed: the models-only `oapi-codegen` output was **byte-identical** across the rename
  (`/healthz` appeared nowhere in it), while `openapi-typescript` did emit the path into its `paths`
  type and so did differ. The gap was therefore never symmetric — but it was decisive on both sides
  anyway, because *neither* generated artifact was what issued or served the request: the backend
  registered a hand-written constant and the frontend fetched a hand-written string, and a difference
  in a type nothing routed through is a difference in documentation. What the row asserts is that
  the thing that moves and the thing that is compared are the same artifact.
- **The two type-drift rows are seeded and run one language at a time**, so each side's agreement is
  decided independently rather than by one comparison that happens to cover both.
- **The missing-generator row asserts what was *not* done.** With `orval` unresolvable,
  `git status --porcelain` is empty after the run: the gate resolves every tool *before* it clears
  anything (`justfile`'s `check-boundary`), so it exits non-zero having deleted nothing. Before that
  resolution step this failed — exit 127 with the generated frontend file staged as a deletion,
  because the recipe cleared the generated directories before discovering it could not refill them.
  The row is the fix, and the reproduction is what says the fix was needed.
- **A missing generator reads as a deletion, not a false clean**, because the recipe clears the
  generated directories before regenerating: a stale file left in place would be byte-identical to
  what is committed, where an absent one shows in the diff. The non-empty assertions on each output
  are the other half — an emitted-but-empty file is a deletion the diff sees anyway, and neither
  catches the case the other does.
- **The two exit-zero rows close the gap this record used to carry as unreachable.** A
  generator that succeeds while emitting the wrong thing is not caught by the clear-and-diff (there
  is output), nor by the non-empty assertion (it is not empty). Both rows were measured: the file is
  written, `test -s` passes, and the compile step is what fails — at the exact symbol the missing
  target should have supplied. What makes the compile step able to say this is that the backend
  *consumes* every target: the routes through `boundary.HandlerFromMux`, the error bodies through the
  generated models. A target nothing consumed would go missing silently.
- **The second of those two rows is a real trap, not a contrived one.** oapi-codegen v2 tries the v1
  configuration schema when the v2 parse fails, and the v1 schema takes `generate` as a *list*. The
  list form therefore does not fail — it is accepted, under different rules, and `skip-prune` (a v2
  option) is not among them, so the components no path references are pruned away. The same list with
  `output-options` present fails both parses and exits non-zero; it is the version *without* it that
  passes quietly.
- **The TypeScript compile row is reachable through the schema**, not only through a hand-edit the
  regeneration would overwrite. A component name that collides with a DOM type orval emits against is
  a schema the generator accepts, Go compiles, and TypeScript rejects — which is what makes the
  `tsc` step an assertion about generated output rather than about a file nobody can produce.
  **The required property is what makes the seed bite**, and it is the half of this row easiest to
  drop when re-running it: with every property optional the emitted interface is a weak type, the
  `as` conversion stays legal, `tsc` passes, and the gate then fails at the drift diff instead — the
  right verdict for the wrong reason, which would read as evidence that the `tsc` step decides
  nothing.

**Known gaps.**

- **The schema is never wrong here.** Every row seeds either the generated side or the generator's
  configuration; nothing asks whether the schema describes what the boundary actually carries.
  `docs/CI.md` states that as the gate's own limit, and it is the gate's scope rather than a gap in
  these cases.
- **`check-boundary`'s local run compares the commit against the worktree**, so staged content
  diverging from the worktree is let through and a plain commit then lands an index the gate never
  read. It is inherited from the recipe shape rather than measured here — the same local-false-green
  `check-arch` carries and records against its own seed ([cases/check-arch.md](check-arch.md)) — and
  it is unreachable in CI, whose checkout has an index equal to its commit.
