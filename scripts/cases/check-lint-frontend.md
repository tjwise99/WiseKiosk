# `check-lint-frontend`

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Lint and type checks*'s; how to run a case is
[`../README.md`](../README.md)'s.

Each case is a `git archive` copy of the tracked tree at `e866d96`, with `frontend/node_modules`
symlinked in from the working tree and `just check-lint-frontend` (eslint, then svelte-check `--tsgo`)
run inside the copy. eslint 10.10.0, typescript-eslint 8.69.0, eslint-plugin-svelte 3.23.0, svelte-check
4.7.6.

**svelte-check is reporting, not blocking, until
[#275 resolve ModuleEntry.component prop-type variance so svelte-check blocks](https://github.com/tjwise99/WiseKiosk/issues/275)
lands** (docs/CI.md § *Lint and type checks*): its line carries `just`'s `-` prefix, so its output
prints but its exit code never reaches the recipe's own. eslint's line is unaffected and still fails
the recipe.

| Direction | Case | Input |
|---|---|---|
| Must fail | An unused variable | `regions.ts` gains `const __seedUnused = 1;`, never read — eslint's `@typescript-eslint/no-unused-vars` (recommended set) exits 1 naming the line, and `check-lint-frontend` exits 1 before svelte-check runs at all |
| Must pass | The same declaration, read | `__seedUnused` renamed `__seedUsed` and passed to `void __seedUsed;` — eslint exits 0 |
| Reported, not failed | A prop-derived type mismatch in a `.svelte` file | `Clock.svelte` gains `const __seedMismatch: string = twentyFourHour;` (a `boolean`) beside a `void` read so eslint stays clean — `svelte-check --tsgo` exits 1 naming the line (plus a harmless `state_referenced_locally` warning from referencing a `$derived` value outside a closure, an artifact of the seed's own shape), but `check-lint-frontend` still exits 0. Plain `tsc` (`check-typecheck-frontend`) does not see this at all: a `.svelte` file's script block is not a source file bare `tsc` opens, which is why both gates exist rather than either alone |
| Must pass | The tree as it stands, three standing findings | `svelte-check --tsgo` prints `ModuleEntry.component`'s three prop-type variance findings verbatim — `src/lib/modules.ts:33:12`, `src/lib/modules.ts:35:5`, `tests/render/stubs/registry.ts:31:18`, each `Type '…' is not assignable to type 'Component<{}, {}, string>'` — and `check-lint-frontend` exits 0: reported, not blocking, exactly as the reporting seed above demonstrates. [#275 resolve ModuleEntry.component prop-type variance so svelte-check blocks](https://github.com/tjwise99/WiseKiosk/issues/275) resolves them and restores this row to a genuinely clean tree |
