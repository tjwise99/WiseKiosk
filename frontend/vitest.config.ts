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
    },
  }),
);
