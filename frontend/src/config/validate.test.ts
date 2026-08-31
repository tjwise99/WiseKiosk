import { describe, expect, it } from 'vitest';

import { validateConfiguration } from './validate';

describe('the configuration validator', () => {
  it('accepts a configuration that names modules and a band depth', () => {
    const result = validateConfiguration({
      modules: [
        { region: 'top_bar', module: 'clock' },
        { region: 'middle_center', module: 'weather' },
      ],
      edge_band: 3,
    });

    expect(result.valid).toBe(true);
  });

  it('accepts a configuration declaring no band depth', () => {
    expect(validateConfiguration({ modules: [] }).valid).toBe(true);
  });

  it('reports every fault in one pass rather than stopping at the first', () => {
    const result = validateConfiguration({
      colour: 'red',
      modules: [{ region: 'middle', spin: true }],
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults).toHaveLength(4);
    expect(result.faults.map((fault) => fault.where)).toEqual([
      '',
      '/modules/0',
      '/modules/0',
      '/modules/0/region',
    ]);
  });

  it('names the unknown key an operator has to find', () => {
    const result = validateConfiguration({ modules: [], nonsense: 1 });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults[0].what).toContain('nonsense');
  });

  it('lists the regions on offer when one is not in the roster', () => {
    const result = validateConfiguration({ modules: [{ region: 'centre', module: 'clock' }] });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults[0].what).toContain('top_bar');
    expect(result.faults[0].what).toContain('bottom_bar');
  });

  // The clock's section is the first per-module one, and its keys are asked only of a placement that
  // names the clock. Both directions are driven below: a section nothing narrows would admit a typo
  // on a clock placement, and a section applied to every placement would reject the keys of a module
  // it was never written for.
  it('accepts the keys the clock offers, at values that are not their defaults', () => {
    const result = validateConfiguration({
      modules: [
        {
          region: 'top_bar',
          module: 'clock',
          options: { twenty_four_hour: false, show_seconds: false, show_date: false },
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('names the key an operator misspelled in a clock placement', () => {
    const result = validateConfiguration({
      modules: [{ region: 'top_bar', module: 'clock', options: { twelve_hour: true } }],
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults.map((fault) => fault.what).join(' ')).toContain('twelve_hour');
  });

  it('rejects a clock option carrying the wrong kind of value', () => {
    const result = validateConfiguration({
      modules: [{ region: 'top_bar', module: 'clock', options: { show_date: 'yes' } }],
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    // The fault is read rather than the verdict: a schema that rejected every configuration would
    // satisfy the verdict alone, and would not name the key or say what was wrong with it.
    expect(result.faults).toContainEqual({ where: '/modules/0/options/show_date', what: 'must be boolean' });
  });

  // The discriminating case for the scoping, and the one that says which direction it runs in: the
  // same key set that is a typo on a clock placement is not a typo on a module the schema declares
  // no section for, so it is admitted there. A schema applying the clock's section to every
  // placement rejects this, which is what makes the case worth driving.
  it('does not judge a module with no section of its own by the clock’s keys', () => {
    const result = validateConfiguration({
      modules: [{ region: 'top_bar', module: 'weather', options: { location: 'a place' } }],
    });

    expect(result.valid).toBe(true);
  });

  it('rejects a document that is not an object at all', () => {
    const result = validateConfiguration([]);

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults).not.toHaveLength(0);
  });
});
