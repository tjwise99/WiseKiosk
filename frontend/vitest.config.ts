import { defineConfig, mergeConfig } from 'vitest/config';

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
      // Gate 3 coverage bar (ADR 0005 rev 3): `include` reports every matching file, so a file this
      // tier never imports appears at 0% rather than being silently absent (`coverage.all` was
      // removed in Vitest 4; `include` alone carries that behaviour now).
      coverage: {
        // Istanbul rather than V8: the render tier's own coverage (`tests/render/coverage-teardown.ts`)
        // is Istanbul too, so both tiers' lcov share one shape (#304's future cross-tier merge).
        provider: 'istanbul',
        // `.ts` only, not `src/**`: the render tier gates every `.svelte` component on its own,
        // separate 90% bar, so each file is scored by exactly one tier. `src/**` also matches
        // non-code assets (`app.css`, licence and font files, `schema.json`) that carry no
        // statements of their own.
        include: ['src/**/*.ts'],
        exclude: [
          'src/lib/boundary/**',
          'src/config/types.ts',
          'src/modules/weather/props.ts',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/*.d.ts',
        ],
        reporter: ['text', 'lcov'],
        reportsDirectory: 'coverage/unit',
        thresholds: {
          perFile: true,
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  }),
);
