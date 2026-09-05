# `check-build`

The inputs this check has been run against, in both directions. What it *asserts* is
[ADR 0018 rev 1](../../docs/decisions/0018-frontend-svelte-vite-static-spa.md)'s — the frontend is
emitted as a static single-page bundle — and how to run a case is [`../README.md`](../README.md)'s.

The recipe runs Vite's production build over `frontend/`. What the *emitted* bundle must then be is
[`check-static-bundle-py.md`](check-static-bundle-py.md)'s; this records that the build fails on
input it cannot build, which is the half a gate over the output cannot reach — a build that did not
run emits nothing to inspect.

Each seed is applied to a copy of the tracked tree, the recipe run, and the seed reverted.

| Direction | Case | Input |
|---|---|---|
| Must fail | A component that does not compile | an unclosed `{#if}` block appended to `App.svelte` |
| Must fail | A configuration schema the validator cannot compile | `edge_band`'s `type` misspelled — the standalone compile runs inside the build, so a schema that ajv rejects fails here rather than on the display |
| Must pass | The tree as it stands | — |

**The schema row is the load-bearing one.** The configuration validator is compiled from
`frontend/src/config/schema.json` during the build
([ADR 0028 rev 2](../../docs/decisions/0028-bundled-config-validator.md)), so this is where a schema
that will not compile is found. Without it the failure moves to page load, in front of a display
nobody is standing at.

**What it does not catch.** Nothing here type-checks: Vite's transform strips TypeScript without
checking it, so a type error builds cleanly. `svelte-check`, `eslint` and the whole-project typecheck
are `check-lint-frontend`'s and `check-typecheck-frontend`'s (docs/CI.md § *Lint and type checks*).
