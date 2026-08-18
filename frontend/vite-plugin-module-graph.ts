import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

/** Where the emitted module graph is written for the static-bundle gate to read. */
export const MODULE_GRAPH_PATH = fileURLToPath(new URL('./.vite/module-graph.json', import.meta.url));

/**
 * Writes every module id that reached the emitted bundle. Rollup knows the graph and nothing else
 * does: the emitted chunks carry no package names, so a gate reading only `dist/` could not decide
 * which npm packages ship. Build output, not source — the path is gitignored.
 */
export function moduleGraph(): Plugin {
  return {
    name: 'wisekiosk:module-graph',
    generateBundle(_options, bundle) {
      const ids = new Set<string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') {
          for (const id of Object.keys(chunk.modules)) {
            ids.add(id);
          }
        }
      }
      mkdirSync(dirname(MODULE_GRAPH_PATH), { recursive: true });
      writeFileSync(MODULE_GRAPH_PATH, `${JSON.stringify([...ids].sort(), null, 2)}\n`);
    },
  };
}
