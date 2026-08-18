import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import type { Plugin } from 'vite';

/** The module specifier the page imports the compiled validation function from. */
export const VALIDATOR_MODULE_ID = 'virtual:config-validator';

const RESOLVED_ID = `\0${VALIDATOR_MODULE_ID}`;

const SCHEMA_PATH = fileURLToPath(new URL('./src/config/schema.json', import.meta.url));

/**
 * Compiles `src/config/schema.json` to a standalone validation function and serves it as
 * `virtual:config-validator`. ajv runs here, at build time, so no schema evaluator reaches the
 * bundle. The emitted function embeds the schema document as a constant — its error parameters are
 * drawn from it — so the document ships and the compiler does not
 * ([ADR 0028 rev 1](../docs/decisions/0028-bundled-config-validator.md)).
 *
 * `allErrors` collects every failure rather than stopping at the first, which is what lets the page
 * render the whole validation report.
 */
export function configValidator(): Plugin {
  return {
    name: 'wisekiosk:config-validator',

    resolveId(id) {
      return id === VALIDATOR_MODULE_ID ? RESOLVED_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_ID) {
        return null;
      }
      this.addWatchFile(SCHEMA_PATH);

      const ajv = new Ajv2020({ code: { source: true, esm: true }, allErrors: true });
      const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
      return standaloneCode(ajv, validate);
    },
  };
}
