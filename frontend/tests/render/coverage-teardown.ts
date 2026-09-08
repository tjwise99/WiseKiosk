import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulLibSourceMaps from 'istanbul-lib-source-maps';
import istanbulReports from 'istanbul-reports';

import { RENDER_RAW_DIR } from './harness';

// Default imports rather than named ones: these are CommonJS packages, and Playwright's own loader
// does not always detect their named exports as ESM ones.
const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;
const { createSourceMapStore } = istanbulLibSourceMaps;
const { create: createReport } = istanbulReports;

const REPORT_DIR = fileURLToPath(new URL('../../coverage/render-report', import.meta.url));

const BAR = 90;
const METRICS = ['statements', 'branches', 'functions', 'lines'] as const;

/**
 * Runs once after every worker of `playwright.coverage.config.ts`'s run has exited, folding the
 * coverage each of them wrote (`harness.ts`'s `coverageMap` fixture) into one map, remapping it from
 * the instrumented code Istanbul saw back to the `.svelte`/`.ts` sources it came from, and writing
 * the render tier's own lcov + text report.
 *
 * Gate 3 coverage bar (ADR 0005 rev 3): the same per-file 90% bar `vitest.config.ts`'s
 * `coverage.thresholds` states for the unit tier, applied here to the render tier's own
 * `vite-plugin-istanbul`-instrumented population.
 */
export default async function globalTeardown(): Promise<void> {
  const map = createCoverageMap({});
  let workerFiles: string[];
  try {
    workerFiles = await readdir(RENDER_RAW_DIR);
  } catch {
    // No coverage project worker ran a test that reached `render` — nothing to fold in.
    workerFiles = [];
  }
  for (const file of workerFiles) {
    const raw: unknown = JSON.parse(await readFile(path.join(RENDER_RAW_DIR, file), 'utf8'));
    map.merge(raw as Parameters<typeof map.merge>[0]);
  }

  const remapped = await createSourceMapStore().transformCoverage(map);

  const context = createContext({ dir: REPORT_DIR, coverageMap: remapped });
  createReport('lcovonly').execute(context);
  createReport('text').execute(context);

  const failures: string[] = [];
  for (const filePath of remapped.files()) {
    const summary = remapped.fileCoverageFor(filePath).toSummary();
    for (const metric of METRICS) {
      const pct = summary[metric].pct;
      if (pct < BAR) {
        failures.push(`${filePath}: ${metric} coverage (${pct}%) is below the ${BAR}% bar`);
      }
    }
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
