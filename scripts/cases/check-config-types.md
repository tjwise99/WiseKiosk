# `check-config-types`

The inputs the drift gate has been run against, in both directions. What it *asserts* is
[ADR 0022 rev 1](../../docs/decisions/0022-config-schema-format.md)'s — the configuration-object
types are generated from the schema, so the schema is the one statement of the configuration's
shape — and how to run a case is [`../README.md`](../README.md)'s.

Each case is a copy of the tracked tree with its own `git init`/commit, the seed committed into that
copy, and `just check-config-types` run inside it: the recipe diffs against `HEAD`, so an uncommitted
seed is not what it compares. `frontend/node_modules` is symlinked in after the commit, before which
`.gitignore`'s `node_modules/` does not match a *symlink* of that name and the link is committed. The
generator is pinned to `json-schema-to-typescript` `15.0.4` through `frontend/package-lock.json`,
which is what makes a regeneration reproducible.

| Direction | Case | Input |
|---|---|---|
| Must fail | A committed type moved away from the schema | `modules` made optional in `frontend/src/config/types.ts`, committed, gate run |
| Must fail | The generator does not run, so nothing is regenerated | the `json2ts` binary made unresolvable — the gate destroys nothing and exits non-zero |
| Must pass | The tree as it stands | — |

**The missing-generator row asserts what was *not* done.** With `json2ts` unresolvable,
`git status --porcelain -- frontend/src/config/` is empty after the run: the recipe resolves the
generator *before* it deletes the committed output, so it exits non-zero having deleted nothing. A
recipe that cleared first would leave the generated types staged as a deletion beside an exit 127,
which is the shape `check-boundary` was corrected for and this one was written against.

**What it leaves unproven** is whether the schema says what an operator may configure. The gate
compares the schema against its own output and nothing against a deployment.
