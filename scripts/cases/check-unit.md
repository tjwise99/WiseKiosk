# `check-unit`

The inputs this check has been run against, in both directions. What the tier *guarantees* is
[`docs/TESTING.md`](../../docs/TESTING.md)'s and which runner executes it is
[ADR 0027 rev 1](../../docs/decisions/0027-frontend-test-runners.md)'s; how to run a case is
[`../README.md`](../README.md)'s.

The recipe runs Vitest over `src/**/*.test.ts` through the build's own Vite configuration, so a test
resolves what the bundle resolves — the compiled configuration validator among it. Each seed below is
applied to the working tree, the recipe run, and the seed reverted; none needs a commit, the runner
reading the tree rather than `git ls-files`.

| Direction | Case | Input |
|---|---|---|
| Must fail | The frame lays out fewer regions than the schema offers | delete `bottom_bar` from `REGION_PLACEMENTS` — two tests fail, the roster comparison naming the ten it found against the eleven offered |
| Must fail | The schema offers a region the frame cannot lay out | append `sneaky_region` to the schema's `region` enum — the same two tests fail, so the agreement is decided in both directions rather than one |
| Must fail | No test file is found at all | run the recipe with a filter matching nothing — Vitest exits 1 with `No test files found`, so a run that measured nothing does not read as a clean tier |
| Must pass | The tree as it stands | — |

**What the roster rows prove, beyond that a test failed.** `REGION_PLACEMENTS` is keyed by the
generated `Region` union, so a missing or extra name is a type error — and nothing in this repository
type-checks the frontend yet, `svelte-check` and `eslint` being #67 security and supply-chain CI
gates'. Until they arrive, these two rows are the whole of what holds the frame's geometry and the
schema's enum to one roster. Seeding both directions is what makes that a check rather than a
coincidence: a comparison of sizes would pass the second seed, and a one-way subset test would pass
the first.

**What it does not catch.** Nothing here renders anything. That a region's placement puts it where
its name says, that its content clears the edge band, and that its type reads at distance are all
read from a laid-out page and are the render tier's — see
[`check-render.md`](check-render.md). A placement declaring `grid-row: 99` satisfies every test here.
