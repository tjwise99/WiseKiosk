# `check-static-bundle.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md) § *Module and framework structure*'s and
[ADR 0018 rev 1](../../docs/decisions/0018-frontend-svelte-vite-static-spa.md)'s; how to run a case
is [`../README.md`](../README.md)'s.

The recipe depends on `check-build`, so what is judged is what that build emitted rather than
whatever was last left in `frontend/dist/`. Each seed below is applied, the check run, and the seed
reverted; the two touching the module graph rebuild first, the graph being the build's output.

| Direction | Case | Input |
|---|---|---|
| Must fail | Content pre-rendered into the mount element | an `h1` with text added inside `#app` — reported twice, as the nesting and as the text |
| Must fail | A second HTML entry | a copy of `index.html` beside it |
| Must fail | A server half of the build | an emitted `dist/server/` directory |
| Must fail | A server-entry chunk | an emitted `assets/entry-server-abc.js` |
| Must fail | An SSR target declared in the build configuration | `ssr: { target: "node" }` added to `vite.config.ts` |
| Must fail | A runtime dependency outside the allowlist | `main.ts` imports ajv's 2020 build — four packages reported, ajv and its three transitive dependencies |
| Must fail | An allowlist entry nothing ships | `some-router` added to `bundle-allowlist.json` |
| Must fail | No module graph at all | the graph deleted — the build did not run, so nothing was judged |
| Must fail | An empty module graph | the graph replaced with `[]` |
| Must pass | The tree as it stands | one npm package in the emitted graph, `svelte` |

**The allowlist is read in both directions on purpose.** A package that ships and is not granted is
the case the gate exists for; a package granted that ships nothing is the case that makes the
allowlist a record rather than an accumulation, and it is what the transitive-dependency row above
would otherwise leave behind — reverting the ajv seed without reverting a grant made for it would
pass silently under a subset test.

**The module graph is the build's output, not the emitted files'.** The emitted chunks carry no
package names, so a check reading only `dist/` could not decide which packages ship;
`frontend/vite-plugin-module-graph.ts` writes out what Rollup resolved. That is why *no graph* and
*an empty graph* are both failures rather than skips: each is a run that measured nothing, and a
subset test over an empty set is satisfied by every allowlist there is.

**What it does not catch.** The SSR reading is textual, over the Vite configuration and the plugin
modules it is composed from — a plugin injecting an SSR target from somewhere else is outside the
population, and a mention of the word in a comment fails, which is a false positive a reader
resolves. The mount-element reading is over the *emitted* entry, so it decides that nothing was
pre-rendered into the shipped HTML and nothing about what the page then renders into it. And the
allowlist is a package set: it says nothing about how much of a granted package ships.
