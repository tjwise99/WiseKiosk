import { describe, expect, it } from 'vitest';

import { partValue } from './parts';

describe('partValue', () => {
  it('reads the named part out of a real formatToParts() result', () => {
    const format = new Intl.DateTimeFormat('en-US', { second: '2-digit', timeZone: 'UTC' });
    const when = new Date('2026-08-30T15:04:05Z');
    const parts = format.formatToParts(when);

    // Read against the same formatter's own `.format()` rather than a literal: what padding a lone
    // 'second' field gets is the Intl implementation's choice, not this function's to assert.
    expect(partValue(parts, 'second')).toBe(format.format(when));
  });

  it('falls back to an empty string when the named part is absent', () => {
    // No real `formatToParts()` result omits a requested part; this drives the fallback directly,
    // the same way `validate.errors.test.ts` drives validate.ts's fallbacks against a shape ajv
    // never produces.
    expect(partValue([{ type: 'hour', value: '03' }], 'second')).toBe('');
  });
});
