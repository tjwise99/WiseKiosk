import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

// Default imports rather than named ones: these are CommonJS packages, and Node's own ESM loader
// does not always detect their named exports as ESM ones.
const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;
const { create: createReport } = istanbulReports;

const UNIT_FINAL = fileURLToPath(new URL('../coverage/unit/coverage-final.json', import.meta.url));
const RENDER_FINAL = fileURLToPath(new URL('../coverage/render/coverage-final.json', import.meta.url));
const REPORT_DIR = fileURLToPath(new URL('../coverage/frontend-report', import.meta.url));

const BAR = 90;
const METRICS = ['statements', 'branches', 'functions', 'lines'] as const;

/**
 * Reads a coverage-final.json, or an empty map if that tier's run left none there at all (a tier
 * that collected nothing, rather than one that collected something unreadable). A file present but
 * not valid JSON is not swallowed the same way: it fails loud, since silently treating it as empty
 * would gate a real bar against less than the run actually produced.
 */
async function read(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw cause;
  }
  return JSON.parse(text);
}

/**
 * Unions the unit tier's coverage (`vitest.config.ts`'s `json` reporter) with the render tier's
 * (`tests/render/coverage-teardown.ts`) into one frontend-wide map and enforces the per-file 90% bar
 * over it (Gate 3, ADR 0005 rev 3) — the one gate both tiers are scored by, since both now
 * instrument the same original `.ts`/`.svelte` sources through `istanbul-lib-instrument`, so a file
 * either tier executes contributes to the same statement/branch map rather than replacing the
 * other's. `istanbul-lib-coverage`'s own `.merge()` is what does the union; nothing here re-derives
 * it.
 */
async function main(): Promise<void> {
  const map = createCoverageMap({});
  map.merge((await read(UNIT_FINAL)) as Parameters<typeof map.merge>[0]);
  map.merge((await read(RENDER_FINAL)) as Parameters<typeof map.merge>[0]);

  // A merged map with no files at all would otherwise pass the loop below vacuously — indistinguishable
  // from every file clearing the bar, when nothing was measured at all.
  if (map.files().length === 0) {
    console.error('merge-coverage: no coverage collected — refusing to pass');
    process.exitCode = 1;
    return;
  }

  const context = createContext({ dir: REPORT_DIR, coverageMap: map });
  createReport('lcovonly').execute(context);
  createReport('text').execute(context);

  const failures: string[] = [];
  for (const filePath of map.files()) {
    const summary = map.fileCoverageFor(filePath).toSummary();
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

await main();
