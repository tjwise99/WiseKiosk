import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config.ts';

/**
 * Reruns the render tier's whole test set from `playwright.config.ts` unchanged, distinguished only
 * by this file's own name (`harness.ts`'s `underCoverageProject`, the same mechanism
 * `playwright.policy.config.ts` uses for its own project). `globalTeardown` merges every worker's
 * accumulated coverage into the `raw` report once all of them have exited.
 */
export default defineConfig(baseConfig, {
  globalTeardown: './tests/render/coverage-teardown.ts',
});
