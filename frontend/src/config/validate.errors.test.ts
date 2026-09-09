import type { ErrorObject } from 'ajv';
import { describe, expect, it, vi } from 'vitest';

// The real compiled validator always sets a populated `.errors`, each entry carrying a `.message`, on
// a rejection. This substitutes a fake to drive validate.ts's fallbacks for the three shapes it
// never produces: no `.errors`, an empty one, and an error with no `.message`.
vi.mock('virtual:config-validator', () => ({
  default: Object.assign((): boolean => false, { errors: undefined as ErrorObject[] | null | undefined }),
}));

const { default: validate } = await import('virtual:config-validator');
const { validateConfiguration } = await import('./validate');

describe('validateConfiguration, against a validator that reports less than ajv does', () => {
  it('falls back to one fault when the validator sets no `.errors` at all', () => {
    validate.errors = undefined;

    const result = validateConfiguration({});

    expect(result).toEqual({ valid: false, faults: [{ where: '', what: 'is not a valid configuration' }] });
  });

  it('falls back to the same fault when `.errors` is an empty array', () => {
    validate.errors = [];

    const result = validateConfiguration({});

    expect(result).toEqual({ valid: false, faults: [{ where: '', what: 'is not a valid configuration' }] });
  });

  it('falls back to a generic message when an error carries none of its own', () => {
    validate.errors = [
      { instancePath: '/x', keyword: 'type', params: {}, schemaPath: '#/x' } as ErrorObject,
    ];

    const result = validateConfiguration({});

    expect(result).toEqual({ valid: false, faults: [{ where: '/x', what: 'is not valid' }] });
  });
});
