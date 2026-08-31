import { describe, expect, it } from 'vitest';

import { validateConfiguration } from './validate';

describe('the configuration validator', () => {
  it('accepts a configuration that names modules and a band depth', () => {
    const result = validateConfiguration({
      modules: [
        { region: 'top_bar', module: 'clock' },
        { region: 'middle_center', module: 'weather', options: { location: { lat: 42.36, lon: -71.06 } } },
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

  // The clock's section is a per-module one: its keys are asked only of a placement that names the
  // clock. Both directions are driven below: a section nothing narrows would admit a typo
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
  //
  // The module named has to be one the schema declares nothing about, so it moves as sections are
  // added.
  it('does not judge a module with no section of its own by the clock’s keys', () => {
    const result = validateConfiguration({
      modules: [{ region: 'top_bar', module: 'compliments', options: { greeting: 'hello' } }],
    });

    expect(result.valid).toBe(true);
  });

  // The weather module's section, driven the same four ways the clock's is, plus the one thing that
  // tells the two sections apart: the clock's keys are all omissible and weather's location is not,
  // there being no point on the earth's surface that would do in the absence of a named one.
  it('accepts the keys the weather module offers', () => {
    const result = validateConfiguration({
      modules: [
        { region: 'middle_center', module: 'weather', options: { location: { lat: 42.36, lon: -71.06 } } },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('names the key an operator misspelled in a weather placement', () => {
    const result = validateConfiguration({
      modules: [
        { region: 'middle_center', module: 'weather', options: { location: { lat: 42.36, long: -71.06 } } },
      ],
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    expect(result.faults.map((fault) => fault.what).join(' ')).toContain('long');
  });

  it('rejects a weather location carrying the wrong kind of value', () => {
    const result = validateConfiguration({
      modules: [
        { region: 'middle_center', module: 'weather', options: { location: { lat: 'north', lon: -71.06 } } },
      ],
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }
    // The fault rather than the verdict, for the reason the clock's own wrong-type case gives: a
    // schema rejecting every configuration satisfies the verdict and names nothing.
    expect(result.faults).toContainEqual({
      where: '/modules/0/options/location/lat',
      what: 'must be number',
    });
  });

  // Both spellings of leaving it out, because the two are caught by different halves of the schema
  // and each half passes the other's case. A placement carrying an empty options object is refused
  // by the section's own `required`; a placement carrying no options key at all never reaches the
  // section, so it is refused by the `then` branch instead. Written with only one of the two, a
  // weather placement missing its location validates clean and the component reads `lat` off
  // nothing.
  it('names what a weather placement left out rather than admitting it', () => {
    const withEmptyOptions = validateConfiguration({
      modules: [{ region: 'middle_center', module: 'weather', options: {} }],
    });

    expect(withEmptyOptions.valid).toBe(false);
    if (withEmptyOptions.valid) {
      return;
    }
    expect(withEmptyOptions.faults.map((fault) => fault.what).join(' ')).toContain('location');

    const withNoOptions = validateConfiguration({
      modules: [{ region: 'middle_center', module: 'weather' }],
    });

    expect(withNoOptions.valid).toBe(false);
    if (withNoOptions.valid) {
      return;
    }
    expect(withNoOptions.faults.map((fault) => fault.what).join(' ')).toContain('options');
  });

  it('does not judge a clock placement by the weather module’s keys', () => {
    const result = validateConfiguration({
      modules: [{ region: 'top_bar', module: 'clock', options: { show_date: true } }],
    });

    // The scoping's other direction, and the one the second section made assertable: weather's
    // location is required, so a schema asking every placement for it rejects this clock.
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
