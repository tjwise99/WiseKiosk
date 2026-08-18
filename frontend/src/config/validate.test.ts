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
    expect(result.faults[0].what).toContain('fullscreen_below');
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
