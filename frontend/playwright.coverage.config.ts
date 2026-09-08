import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config.ts';

// Read by `vite.config.render.ts`'s Istanbul plugin (`requireEnv: true`) when it spawns the dev
// server below — set before that spawn so only this project's build is instrumented, never
// `check-render`/`check-render-policy`'s.
process.env.VITE_COVERAGE = 'true';

/**
 * Reruns the render tier's whole test set from `playwright.config.ts` unchanged, distinguished only
 * by this file's own name (`harness.ts`'s `underCoverageProject`, the same mechanism
 * `playwright.policy.config.ts` uses for its own project). `globalTeardown` merges every worker's
 * accumulated coverage into the `raw` report once all of them have exited.
 */
export default defineConfig(baseConfig, {
  globalSetup: './tests/render/coverage-setup.ts',
  globalTeardown: './tests/render/coverage-teardown.ts',
});
