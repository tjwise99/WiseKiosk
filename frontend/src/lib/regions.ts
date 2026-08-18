import type { Region } from '../config/types';

/** Where one region sits in the frame, and how its content is anchored inside it. */
export interface RegionPlacement {
  /** `grid-column`, against the frame's three columns. */
  readonly column: string;
  /** `grid-row`, against the frame's seven rows. */
  readonly row: string;
  /** Where the region's content sits along the horizontal axis. */
  readonly justify: 'start' | 'center' | 'end';
  /** Where it sits along the vertical axis. */
  readonly align: 'start' | 'center' | 'end';
  /** Stacking order against the frame, which is at 0. */
  readonly layer: number;
}

/**
 * The frame's tracks. The three bands of the centre column each take an equal share of what the
 * bars and the corner rows leave, which is what makes `upper_third`, `middle_center` and
 * `lower_third` thirds; every other row is sized to its content, so a row whose regions hold
 * nothing takes no height. The bands are `minmax(0, 1fr)` rather than `1fr`: a bare `fr` track has
 * an automatic minimum and grows to its content, which would make a third as tall as whatever it
 * was given.
 */
export const FRAME_COLUMNS = 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)';
export const FRAME_ROWS = 'auto auto minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto auto';

/**
 * Every region in the roster, anchored to the edge, corner or third its name states. The keys are
 * the generated `Region` union, so this map and `src/config/schema.json`'s enum are one roster
 * rather than two lists; `regions.test.ts` reads the schema and asserts they agree.
 */
export const REGION_PLACEMENTS: Record<Region, RegionPlacement> = {
  top_bar: { column: '1 / 4', row: '1', justify: 'center', align: 'start', layer: 0 },

  top_left: { column: '1', row: '2', justify: 'start', align: 'start', layer: 0 },
  top_center: { column: '2', row: '2', justify: 'center', align: 'start', layer: 0 },
  top_right: { column: '3', row: '2', justify: 'end', align: 'start', layer: 0 },

  upper_third: { column: '2', row: '3', justify: 'center', align: 'start', layer: 0 },
  middle_center: { column: '2', row: '4', justify: 'center', align: 'center', layer: 0 },
  lower_third: { column: '2', row: '5', justify: 'center', align: 'end', layer: 0 },

  bottom_left: { column: '1', row: '6', justify: 'start', align: 'end', layer: 0 },
  bottom_center: { column: '2', row: '6', justify: 'center', align: 'end', layer: 0 },
  bottom_right: { column: '3', row: '6', justify: 'end', align: 'end', layer: 0 },

  bottom_bar: { column: '1 / 4', row: '7', justify: 'center', align: 'end', layer: 0 },

  // The two layers span every track, so they cover the frame rather than sitting in it.
  fullscreen_below: { column: '1 / 4', row: '1 / 8', justify: 'center', align: 'center', layer: -1 },
  fullscreen_above: { column: '1 / 4', row: '1 / 8', justify: 'center', align: 'center', layer: 1 },
};

/**
 * The configured band depth as a CSS length. The schema states the depth as a percentage of the
 * display's height, which is what `vh` is; this is the one place the two are joined. Absent means
 * none is assumed.
 */
export function edgeBandLength(depth: number | undefined): string {
  return depth === undefined ? '0px' : `${depth}vh`;
}

/** The placement declarations for one region, as a `style` attribute value. */
export function placementStyle(region: Region): string {
  const placement = REGION_PLACEMENTS[region];
  return [
    `grid-column:${placement.column}`,
    `grid-row:${placement.row}`,
    `justify-content:${placement.justify}`,
    `align-items:${placement.align}`,
    `z-index:${placement.layer}`,
  ].join(';');
}
