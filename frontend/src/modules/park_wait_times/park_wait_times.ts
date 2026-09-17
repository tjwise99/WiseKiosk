import { ParkWaitTimesState, type ParkWaitTimesRide } from '../../lib/boundary/client';

import castle from './icons/castle.svg?raw';
import clapperboard from './icons/clapperboard.svg?raw';
import coaster from './icons/coaster.svg?raw';
import globe from './icons/globe.svg?raw';
import sorcererHat from './icons/sorcerer-hat.svg?raw';
import tree from './icons/tree.svg?raw';

/** The park's numeric-wait rides worst first, longest wait leading
    (SRS058<!-- The park-wait-times module keeps each park's longest current waits in view -->). The
    one source `heldRides` and `noOpenRides` both derive from, so they cannot disagree. */
export function ranked(rides: ParkWaitTimesRide[]): ParkWaitTimesRide[] {
  return rides
    .filter((ride) => ride.state === ParkWaitTimesState.Operating)
    .sort((a, b) => (b.waitMinutes as number) - (a.waitMinutes as number));
}

/** The leaderboard: the `count` longest numeric waits
    (SRS058<!-- The park-wait-times module keeps each park's longest current waits in view -->). */
export function heldRides(rides: ParkWaitTimesRide[], count: number): ParkWaitTimesRide[] {
  return ranked(rides).slice(0, count);
}

/** No ride reporting a length of time draws the park as Closed; distinct from an unavailable park,
    a failed reading — this is a successful one that found nothing open. */
export function noOpenRides(rides: ParkWaitTimesRide[]): boolean {
  return ranked(rides).length === 0;
}

/** Everything the leaderboard does not hold, in the source's own order — the tour reaches all of it
    rather than reordering it around the leaderboard's ranking
    (SRS059<!-- The park-wait-times module tours the remaining rides on an interval its configuration
    sets -->). */
export function remainingRides(
  rides: ParkWaitTimesRide[],
  held: ParkWaitTimesRide[],
): ParkWaitTimesRide[] {
  return rides.filter((ride) => !held.includes(ride));
}

/** How many tour pages the remainder fills, at `tourSize` per page — never fewer than one, so an
    empty remainder still reads modulo a page count rather than dividing by zero. */
export function pageCount(remainingLength: number, tourSize: number): number {
  return Math.max(1, Math.ceil(remainingLength / tourSize));
}

/** The remainder rides one tour page shows: `tourSize` of them from `page`'s offset. */
export function pageSlice(
  remaining: ParkWaitTimesRide[],
  page: number,
  tourSize: number,
): ParkWaitTimesRide[] {
  return remaining.slice(page * tourSize, page * tourSize + tourSize);
}

/** The blank rows a page is short of a full one — zero except a last page whose remainder does not
    divide evenly by `tourSize`, padded so the footer beneath does not move up. */
export function tourPadding(shownLength: number, tourSize: number): number[] {
  return Array.from({ length: tourSize - shownLength }, (_unused, index) => index);
}

/** The `HH:MM` a header draws off a timestamp's own local clock, dropped straight from the string
    rather than re-read against the host's zone; an unparseable value is shown whole. */
export function clockTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[1]}:${match[2]}` : iso;
}

/** The hours line's text, the one source `ParkWaitTimes.svelte`'s header-width measurement and
    `ParkCard.svelte`'s render both derive from, so a measured width can never drift from what is
    drawn. */
export function hoursText(hours: { open: string; close: string }): string {
  return `${clockTime(hours.open)}–${clockTime(hours.close)}`;
}

/** This module's icon set, keyed by park slug (the park-wait-times UI design spec § The park icon
    set). */
const ICONS: Record<string, string> = {
  'magic-kingdom': castle,
  epcot: globe,
  'hollywood-studios': sorcererHat,
  'animal-kingdom': tree,
  'universal-studios': clapperboard,
  'islands-of-adventure': coaster,
};

/** The park's glyph, or undefined for a park the module has none for — the spec's name-only
    fallback (the park-wait-times UI design spec § The park icon set). */
export function iconFor(id: string): string | undefined {
  return ICONS[id];
}
