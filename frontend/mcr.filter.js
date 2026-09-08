// The render tier's own gate covers the `.svelte` components alone; the unit tier
// (`vitest.config.ts`'s own `coverage.exclude`/`thresholds`) covers the `.ts` files. No file is
// scored by both.
//
// `entryFilter` alone, not `sourceFilter`/`filter`: it is tested against the full URL Vite serves
// each module at (`http://host/src/App.svelte`), where these patterns hold, but a monocart
// `sourceFilter`/`filter` also tests each unpacked sourcemap `sources` entry — and Vite's own inline
// sourcemap for a dev-served module names its source by bare filename alone (`App.svelte`, carrying
// no `src/` or any other directory segment), which none of these patterns would ever match.
export const entryFilter = {
  '**/node_modules/**': false,
  // The render tier's own test-double components under `tests/render/stubs/`, not shipped
  // application code.
  '**/tests/**': false,
  '**/*.svelte': true,
};
