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

interface Position {
  line: number;
  column: number;
}

interface FileCoverageData {
  path: string;
  statementMap: Record<string, { start: Position; end: Position }>;
  fnMap: Record<string, never>;
  branchMap: Record<string, never>;
  s: Record<string, number>;
  f: Record<string, never>;
  b: Record<string, never>;
}

interface GoBlock {
  start: Position;
  end: Position;
  numStmts: number;
  count: number;
}

/**
 * Parses backend/cover.out into istanbul FileCoverage objects, one per source file. Go's coverage
 * tooling records no function or branch data, so `fnMap`, `branchMap`, `f` and `b` stay empty.
 * Go's columns are 1-based; istanbul's are 0-based.
 *
 * Each coverprofile line is `path:startLine.startCol,endLine.endCol numStmts count`. `-coverpkg=./...`
 * makes every tested package's binary emit a block for every file in the coverpkg set, so the same
 * block position recurs once per test binary, at 0 from every binary that never executed it. Go's
 * own tooling (`covermode=atomic`, used here) sums those recurrences rather than treating them as
 * distinct statements, so a block already seen for a file is matched by position and its count
 * added, not appended as a new entry — `numStmts` is a property of the source at that position and
 * must not disagree between recurrences.
 *
 * `cmd/cover` weights its own percentage by `numStmts` per block
 * (`total += b.NumStmt; if count > 0 { covered += b.NumStmt }`), not by block count, so one block
 * becomes `numStmts` istanbul statement entries here, each at the block's span — reproducing that
 * weighting in istanbul's own summary rather than reporting one block as one statement regardless
 * of how many statements it actually covers.
 */
async function readGoCoverage(): Promise<Record<string, FileCoverageData>> {
  const text = await readFile(COVER_OUT, 'utf8');
  const blocksByFile: Record<string, Record<string, GoBlock>> = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('mode:')) continue;
    const match = COVERPROFILE_LINE.exec(line);
    if (!match) {
      throw new Error(`${COVER_OUT}: line does not match the coverprofile block format: ${line}`);
    }
    const [, modPath, startLine, startCol, endLine, endCol, numStmts, count] = match;
    const relPath = modPath.startsWith(MODULE_PREFIX) ? modPath.slice(MODULE_PREFIX.length) : modPath;
    const absPath = path.join(REPO_ROOT, relPath);
    const blocks = (blocksByFile[absPath] ??= {});
    const blockKey = `${startLine}.${startCol},${endLine}.${endCol}`;
    const existing = blocks[blockKey];
    if (existing) {
      if (existing.numStmts !== Number(numStmts)) {
        throw new Error(
          `${COVER_OUT}: block ${absPath}:${blockKey} reports ${numStmts} statements here and ` +
            `${existing.numStmts} elsewhere`,
        );
      }
      existing.count += Number(count);
    } else {
      blocks[blockKey] = {
        start: { line: Number(startLine), column: Number(startCol) - 1 },
        end: { line: Number(endLine), column: Number(endCol) - 1 },
        numStmts: Number(numStmts),
        count: Number(count),
      };
    }
  }

  const files: Record<string, FileCoverageData> = {};
  for (const [absPath, blocks] of Object.entries(blocksByFile)) {
    const file: FileCoverageData = { path: absPath, statementMap: {}, fnMap: {}, branchMap: {}, s: {}, f: {}, b: {} };
    let index = 0;
    for (const block of Object.values(blocks)) {
      for (let i = 0; i < block.numStmts; i++, index++) {
        file.statementMap[index] = { start: block.start, end: block.end };
        file.s[index] = block.count;
      }
    }
    files[absPath] = file;
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
