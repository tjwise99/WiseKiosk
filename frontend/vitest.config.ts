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
      // Gate 3 coverage bar (ADR 0005 rev 3): `all: true` reports every file `include` matches, so
      // a file this tier never imports appears at 0% rather than being silently absent.
      coverage: {
        provider: 'v8',
        all: true,
        include: ['src/**'],
        exclude: ['src/lib/boundary/**', 'src/config/types.ts', '**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
        reporter: ['text'],
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
