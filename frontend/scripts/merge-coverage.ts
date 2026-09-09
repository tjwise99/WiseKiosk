import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

import { COVERAGE_EXCLUDE } from '../coverage-exclude.ts';

// Default imports rather than named ones: these are CommonJS packages, and Node's own ESM loader
// does not always detect their named exports as ESM ones.
const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;
const { create: createReport } = istanbulReports;

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url));
const UNIT_FINAL = fileURLToPath(new URL('../coverage/unit/coverage-final.json', import.meta.url));
const RENDER_FINAL = fileURLToPath(new URL('../coverage/render/coverage-final.json', import.meta.url));
const REPORT_DIR = fileURLToPath(new URL('../coverage/frontend-report', import.meta.url));
const THRESHOLDS = fileURLToPath(new URL('../coverage-thresholds.json', import.meta.url));

/**
 * The one bar applied to all four metrics, read from the sibling config file. A missing or
 * non-numeric `bar` throws rather than gating against `undefined`, which every comparison below
 * would pass vacuously.
 */
async function readBar(): Promise<number> {
  const parsed: unknown = JSON.parse(await readFile(THRESHOLDS, 'utf8'));
  const bar = (parsed as { bar?: unknown }).bar;
  if (typeof bar !== 'number' || !Number.isFinite(bar)) {
    throw new Error(`${THRESHOLDS}: "bar" must be a number, got ${JSON.stringify(bar)}`);
  }
  return bar;
}

const BAR = await readBar();
const METRICS = ['statements', 'branches', 'functions', 'lines'] as const;

/**
 * Every source file either tier's own config means to instrument, by the same glob and the same
 * `COVERAGE_EXCLUDE` both configs pass to `vite-plugin-istanbul`/vitest's `coverage.exclude` — so
 * this population can't drift from what actually gets instrumented.
 */
function expectedFiles(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.svelte'], {
    cwd: FRONTEND_ROOT,
    exclude: COVERAGE_EXCLUDE,
  }).map((relative) => path.join(FRONTEND_ROOT, relative));
}

/**
 * Reads a coverage-final.json, or an empty map if that tier's run left none there at all (a tier
 * that collected nothing, rather than one that collected something unreadable). A file present but
 * not valid JSON is not swallowed the same way: it fails loud, since silently treating it as empty
 * would gate a real bar against less than the run actually produced.
 */
async function read(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
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

  // A file the gate is meant to cover but that carries no coverage at all — its only render spec
  // deleted, say — would otherwise just be absent from `map.files()` rather than reported at 0%,
  // passing the loop below vacuously over the population that actually matters most. Checked before
  // that loop runs, and also covers the wholly-empty-map case: an expected set is always non-empty,
  // so nothing collected fails here regardless of which expected file is named.
  const missing = expectedFiles().filter((expected) => !map.files().includes(expected));
  if (missing.length > 0) {
    for (const file of missing) {
      console.error(`expected gated file ${file} absent from coverage — its test may have been deleted`);
    }
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
