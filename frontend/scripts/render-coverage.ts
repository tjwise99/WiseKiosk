import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

// Default imports rather than named ones: these are CommonJS packages, and Node's own ESM loader
// does not always detect their named exports as ESM ones.
const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;
const { create: createReport } = istanbulReports;

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COVER_OUT = path.join(REPO_ROOT, 'backend', 'cover.out');
const UNIT_FINAL = fileURLToPath(new URL('../coverage/unit/coverage-final.json', import.meta.url));
const RENDER_FINAL = fileURLToPath(new URL('../coverage/render/coverage-final.json', import.meta.url));
const REPORT_DIR = path.join(REPO_ROOT, 'coverage', 'unified-report');
const MODULE_PREFIX = 'github.com/tjwise99/WiseKiosk/';

const COVERPROFILE_LINE = /^(.+):(\d+)\.(\d+),(\d+)\.(\d+) (\d+) (\d+)$/;

interface FileCoverageData {
  path: string;
  statementMap: Record<string, { start: { line: number; column: number }; end: { line: number; column: number } }>;
  fnMap: Record<string, never>;
  branchMap: Record<string, never>;
  s: Record<string, number>;
  f: Record<string, never>;
  b: Record<string, never>;
}

/**
 * Parses backend/cover.out into istanbul FileCoverage objects, one per source file. Each
 * coverprofile block (`path:startLine.startCol,endLine.endCol numStmts count`) becomes one
 * istanbul statement — Go's coverage tooling records no function or branch data, so `fnMap`,
 * `branchMap`, `f` and `b` stay empty. Go's columns are 1-based; istanbul's are 0-based.
 *
 * `-coverpkg=./...` makes every tested package's binary emit a block for every file in the
 * coverpkg set, so the same block position recurs once per test binary, at 0 from every binary
 * that never executed it. Go's own tooling (`covermode=atomic`, used here) sums those recurrences
 * rather than treating them as distinct statements, so a block already seen for a file is matched
 * by position and its count added, not appended as a new entry.
 */
async function readGoCoverage(): Promise<Record<string, FileCoverageData>> {
  const text = await readFile(COVER_OUT, 'utf8');
  const files: Record<string, FileCoverageData> = {};
  const indexByBlock: Record<string, Record<string, number>> = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('mode:')) continue;
    const match = COVERPROFILE_LINE.exec(line);
    if (!match) {
      throw new Error(`${COVER_OUT}: line does not match the coverprofile block format: ${line}`);
    }
    const [, modPath, startLine, startCol, endLine, endCol, , count] = match;
    const relPath = modPath.startsWith(MODULE_PREFIX) ? modPath.slice(MODULE_PREFIX.length) : modPath;
    const absPath = path.join(REPO_ROOT, relPath);
    const file = (files[absPath] ??= {
      path: absPath,
      statementMap: {},
      fnMap: {},
      branchMap: {},
      s: {},
      f: {},
      b: {},
    });
    const blockIndex = (indexByBlock[absPath] ??= {});
    const blockKey = `${startLine}.${startCol},${endLine}.${endCol}`;
    const index = blockIndex[blockKey] ?? Object.keys(file.statementMap).length;
    if (!(blockKey in blockIndex)) {
      blockIndex[blockKey] = index;
      file.statementMap[index] = {
        start: { line: Number(startLine), column: Number(startCol) - 1 },
        end: { line: Number(endLine), column: Number(endCol) - 1 },
      };
      file.s[index] = 0;
    }
    file.s[index] += Number(count);
  }
  return files;
}

/** Reads a coverage-final.json, or an empty map if that tier's run left none there at all. */
async function read(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw cause;
  }
}

/**
 * `istanbul-reports`' html template hardcodes `class="prettyprint lang-js"` on every rendered
 * `<pre>`, so its bundled google-code-prettify treats every file as JavaScript. Stripping the
 * `lang-js` token on `.go.html` and `.svelte.html` pages lets prettify auto-detect the language
 * from each page's own content instead.
 */
function fixHighlighting(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixHighlighting(entryPath);
      continue;
    }
    if (!/\.(go|svelte)\.html$/.test(entry.name)) continue;
    fs.writeFileSync(
      entryPath,
      fs.readFileSync(entryPath, 'utf8').replace('class="prettyprint lang-js"', 'class="prettyprint"'),
    );
  }
}

/**
 * Renders one HTML report over the backend's Go coverage and the frontend's unioned Istanbul
 * coverage (the same union `merge-coverage.ts` gates) — diagnostic only, never gating.
 */
async function main(): Promise<void> {
  const map = createCoverageMap({});
  map.merge((await read(UNIT_FINAL)) as Parameters<typeof map.merge>[0]);
  map.merge((await read(RENDER_FINAL)) as Parameters<typeof map.merge>[0]);
  map.merge((await readGoCoverage()) as Parameters<typeof map.merge>[0]);

  const context = createContext({ dir: REPORT_DIR, coverageMap: map, defaultSummarizer: 'nested' });
  createReport('html', {}).execute(context);
  fixHighlighting(REPORT_DIR);
}

await main();
