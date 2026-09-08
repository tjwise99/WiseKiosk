import { fileURLToPath } from 'node:url';

import { entryFilter } from './mcr.filter.js';

// Render's raw V8 coverage: harness.ts's `coverageReport` fixture adds it per test,
// coverage-teardown.ts folds every worker's additions into the `raw` report once all have exited.
const RENDER_RAW_DIR = fileURLToPath(new URL('./coverage/render/raw', import.meta.url));

const BAR = 90;
const METRICS = ['statements', 'branches', 'functions', 'lines'];

export default {
  name: 'WiseKiosk render coverage',
  outputDir: fileURLToPath(new URL('./coverage/render-report', import.meta.url)),
  inputDir: [RENDER_RAW_DIR],
  reports: ['console-details', 'lcovonly'],
  entryFilter,

  // Gate 3 coverage bar (ADR 0005 rev 3): the same per-file 90% bar `vitest.config.ts`'s
  // `coverage.thresholds` states for the unit tier, applied here to the render tier's own
  // `.svelte`-scoped population (`mcr.filter.js`).
  onEnd: (coverageResults) => {
    if (!coverageResults) {
      return;
    }
    const failures = [];
    for (const file of coverageResults.files) {
      for (const metric of METRICS) {
        const pct = file.summary[metric]?.pct;
        if (typeof pct === 'number' && pct < BAR) {
          failures.push(`${file.sourcePath}: ${metric} coverage (${pct}%) is below the ${BAR}% bar`);
        }
      }
    }
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    }
  },
};
