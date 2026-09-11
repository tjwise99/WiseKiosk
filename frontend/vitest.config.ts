import { defineConfig, mergeConfig } from 'vitest/config';

import { COVERAGE_EXCLUDE } from './coverage-exclude.ts';
import viteConfig from './vite.config.ts';

// The unit tier runs through the build's own pipeline, so a helper is exercised through the same
// resolution the bundle gets — the validator's virtual module among it
// ([ADR 0027 rev 1](../docs/decisions/0027-frontend-test-runners.md)). It runs without a DOM: the
// values that need one are the render tier's.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      // Gate 3 coverage bar (ADR 0005 rev 4): `include` reports every matching file, so a file this
      // tier never imports appears at 0% rather than being silently absent (`coverage.all` was
      // removed in Vitest 4; `include` alone carries that behaviour now).
      coverage: {
        // Istanbul rather than V8: the render tier's own coverage (`tests/render/coverage-teardown.ts`)
        // is Istanbul too, so `frontend/scripts/merge-coverage.ts` can union both tiers' output into
        // one frontend-wide gate and lcov, source-position-keyed rather than clobbering either.
        provider: 'istanbul',
        // `.ts` only, not `src/**`: `src/**` also matches non-code assets (`app.css`, licence and
        // font files, `schema.json`) that carry no statements of their own. A `.svelte` file is the
        // render tier's own `include` to instrument (`vite.config.render.ts`); this tier never
        // imports one, so it would report at a permanent, meaningless 0% here regardless.
        include: ['src/**/*.ts'],
        exclude: COVERAGE_EXCLUDE,
        // No `thresholds` here: this run's own view is unit-only, and a file the render tier also
        // executes can read below 90% from this view alone while the merged view — the one gate
        // `merge-coverage.ts` enforces — reads at or above it. `json` is this tier's raw output for
        // that merge to read; `text` is this run's own console summary.
        reporter: ['text', 'json'],
        reportsDirectory: 'coverage/unit',
      },
    },
  }),
);
