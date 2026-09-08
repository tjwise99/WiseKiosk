import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibSourceMaps from 'istanbul-lib-source-maps';

import { RENDER_RAW_DIR } from './harness';

// Default imports rather than named ones: these are CommonJS packages, and Playwright's own loader
// does not always detect their named exports as ESM ones.
const { createCoverageMap } = istanbulLibCoverage;
const { createSourceMapStore } = istanbulLibSourceMaps;

/** Where this tier's own, already-remapped coverage lands for `scripts/merge-coverage.ts` to read. */
export const RENDER_COVERAGE_FINAL = fileURLToPath(
  new URL('../../coverage/render/coverage-final.json', import.meta.url),
);

/**
 * Runs once after every worker of `playwright.coverage.config.ts`'s run has exited, folding the
 * coverage each of them wrote (`harness.ts`'s `coverageMap` fixture) into one map and remapping it
 * from the instrumented code Istanbul saw back to the `.ts`/`.svelte` sources it came from —
 * `frontend/scripts/merge-coverage.ts` unions the result with the unit tier's own coverage into one
 * frontend-wide gate and lcov, so this tier reports neither a bar nor a report of its own.
 */
export default async function globalTeardown(): Promise<void> {
  const map = createCoverageMap({});
  let workerFiles: string[];
  try {
    workerFiles = await readdir(RENDER_RAW_DIR);
  } catch (cause) {
    // No coverage project worker ran a test that reached `render` — nothing to fold in. Any other
    // failure (a permissions error, the path colliding with a plain file) is not this: it is not
    // silently treated as an empty run.
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw cause;
    }
    workerFiles = [];
  }
  for (const file of workerFiles) {
    const raw: unknown = JSON.parse(await readFile(path.join(RENDER_RAW_DIR, file), 'utf8'));
    map.merge(raw as Parameters<typeof map.merge>[0]);
  }

  const remapped = await createSourceMapStore().transformCoverage(map);

  await mkdir(path.dirname(RENDER_COVERAGE_FINAL), { recursive: true });
  await writeFile(RENDER_COVERAGE_FINAL, JSON.stringify(remapped.toJSON()));
}
