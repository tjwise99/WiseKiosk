import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The build compiles this schema with `strictSchema: false`
 * ([the config-validator plugin](../../vite-plugin-config-validator.ts)), which it must: a `default`
 * on a subschema reached through the base `anyOf` cannot apply, and strict mode would reject the
 * whole schema for that alone. The cost is that unknown-keyword detection is off for the entire
 * document, so a module section written `aditionalProperties: false`, or `require` for `required`,
 * would compile clean and admit every key it meant to reject — with no gate to notice, since
 * json-schema-to-typescript ignores the unknown keyword too and the generated type does not move.
 *
 * This compiles the schema under full strict mode and no `useDefaults`, so the one placement the
 * build tolerates does not fire and every other strictness stays on. A misspelled keyword anywhere
 * in the document throws here, which is the check `strictSchema: false` removed from the build.
 */
describe('the configuration schema', () => {
  it('carries no keyword ajv strict mode does not recognise', () => {
    const schema: unknown = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url), 'utf8'));

    expect(() => new Ajv2020({ strict: true }).compile(schema)).not.toThrow();
  });
});
