import { describe, expect, it } from 'vitest';

import schema from '../config/schema.json';
import { REGION_PLACEMENTS, edgeBandLength, placementStyle } from './regions';

const rosterFromSchema = schema.properties.modules.items.properties.region.enum;

describe('the region roster', () => {
  it('is the schema enum, exactly — the frame lays out every region offered and no other', () => {
    expect(Object.keys(REGION_PLACEMENTS).sort()).toEqual([...rosterFromSchema].sort());
  });

  it('places every region somewhere', () => {
    for (const region of rosterFromSchema) {
      const style = placementStyle(region as keyof typeof REGION_PLACEMENTS);
      expect(style).toContain('grid-column:');
      expect(style).toContain('grid-row:');
    }
  });
});

describe('the edge band', () => {
  it('reads a declared depth as a percentage of the display height', () => {
    expect(edgeBandLength(3)).toBe('3vh');
    expect(edgeBandLength(0)).toBe('0vh');
  });

  it('assumes none where the configuration declares none', () => {
    expect(edgeBandLength(undefined)).toBe('0px');
  });
});
