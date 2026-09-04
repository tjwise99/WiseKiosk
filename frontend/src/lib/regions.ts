import type { Region } from '../config/types';

/** Where one region sits in the frame, and how its content is anchored inside it. */
export interface RegionPlacement {
  /** `grid-column`, against the frame's three columns. */
  readonly column: string;
  /** `grid-row`, against the frame's seven rows. */
  readonly row: string;
  /** Where the region's content sits along the horizontal axis. */
  readonly horizontal: 'start' | 'center' | 'end';
  /** Where it sits along the vertical axis. */
  readonly vertical: 'start' | 'center' | 'end';
}

/**
 * The frame's tracks. The three full-width centre bands each take an equal share of what the
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
  top_bar: { column: '1 / 4', row: '1', horizontal: 'center', vertical: 'start' },

  top_left: { column: '1', row: '2', horizontal: 'start', vertical: 'start' },
  top_center: { column: '2', row: '2', horizontal: 'center', vertical: 'start' },
  top_right: { column: '3', row: '2', horizontal: 'end', vertical: 'start' },

  upper_third: { column: '1 / 4', row: '3', horizontal: 'center', vertical: 'start' },
  middle_center: { column: '1 / 4', row: '4', horizontal: 'center', vertical: 'center' },
  lower_third: { column: '1 / 4', row: '5', horizontal: 'center', vertical: 'end' },

  bottom_left: { column: '1', row: '6', horizontal: 'start', vertical: 'end' },
  bottom_center: { column: '2', row: '6', horizontal: 'center', vertical: 'end' },
  bottom_right: { column: '3', row: '6', horizontal: 'end', vertical: 'end' },

  bottom_bar: { column: '1 / 4', row: '7', horizontal: 'center', vertical: 'end' },
};

/**
 * The configured band depth as a CSS length. The schema states the depth as a percentage of the
 * display's height, which is what `vh` is; this is the one place the two are joined. Absent means
 * none is assumed.
 */
export function edgeBandLength(depth: number | undefined): string {
  return depth === undefined ? '0px' : `${depth}vh`;
}

/**
 * The horizontal anchor, spelled the two ways a module's own content reads it: `text` for the
 * `text-align` every text element inherits, and `flex` for the `--content-anchor` custom property a
 * module's flex rows align to. A module on the display's right edge justifies its content to the
 * right, one on the left to the left — content hugging the edge it sits against rather than a fixed
 * side — and this is what carries which way that is, without a module knowing its own placement.
 */
const CONTENT_ANCHOR: Record<RegionPlacement['horizontal'], { text: string; flex: string }> = {
  start: { text: 'left', flex: 'flex-start' },
  center: { text: 'center', flex: 'center' },
  end: { text: 'right', flex: 'flex-end' },
};

/** The placement declarations for one region, as a `style` attribute value. */
export function placementStyle(region: Region): string {
  const placement = REGION_PLACEMENTS[region];
  const anchor = CONTENT_ANCHOR[placement.horizontal];
  return [
    `grid-column:${placement.column}`,
    `grid-row:${placement.row}`,
    // A region is a column flex container, so its main axis is the vertical one: `justify-content`
    // places content down the region and `align-items` places it across. Naming the fields for the
    // axes rather than for the properties is what keeps the two from being crossed.
    `justify-content:${placement.vertical}`,
    `align-items:${placement.horizontal}`,
    // The same horizontal anchor, handed down for a module to justify its own content by — inherited
    // as `text-align`, and as `--content-anchor` for the flex rows text-align cannot place.
    `text-align:${anchor.text}`,
    `--content-anchor:${anchor.flex}`,
  ].join(';');
}
