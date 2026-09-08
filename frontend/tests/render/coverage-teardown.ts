import { CoverageReport } from 'monocart-coverage-reports';

import { RENDER_COVERAGE_DIR } from './harness';

/**
 * Runs once after every worker of `playwright.coverage.config.ts`'s run has exited, folding the
 * coverage each of them added (`harness.ts`'s `collectPageCoverage`) into the `raw` report
 * `mcr.config.js`'s `inputDir` reads.
 */
export default async function globalTeardown(): Promise<void> {
  await new CoverageReport({
    name: 'render',
    outputDir: RENDER_COVERAGE_DIR,
    reports: ['raw'],
  }).generate();
}
