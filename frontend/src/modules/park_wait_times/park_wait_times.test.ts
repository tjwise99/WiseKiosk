import { describe, expect, it } from 'vitest';

import { ParkWaitTimesState, type ParkWaitTimesRide } from '../../lib/boundary/client';

import {
  clockTime,
  heldRides,
  iconFor,
  noOpenRides,
  pageCount,
  pageSlice,
  ranked,
  remainingRides,
  tourPadding,
  uniformCardWidth,
} from './park_wait_times';

/** A ride fixture: a number sets an Operating wait in minutes; a state word sets that state with
    waitMinutes null. */
const ride = (name: string, wait: number | ParkWaitTimesState): ParkWaitTimesRide =>
  typeof wait === 'number'
    ? { name, state: ParkWaitTimesState.Operating, waitMinutes: wait }
    : { name, state: wait, waitMinutes: null };

/** The render suite's own seven-ride roster: three waits clear of the rest, four more than one tour
    page holds, and one not-in-order pair (Imagination! 5 before The Seas 8) that tells a source-order
    remainder from a re-sorted one. */
function roster(): ParkWaitTimesRide[] {
  return [
    ride('Test Track', 80),
    ride('Soarin', 50),
    ride('Spaceship Earth', 20),
    ride('Mission: Space', 10),
    ride('Imagination!', 5),
    ride('The Seas', 8),
    ride('Living with the Land', 3),
  ];
}

describe('ranked (SRS058)', () => {
  it('keeps only numeric waits, longest first', () => {
    const rides = [ride('A', 20), ride('B', 'Closed'), ride('C', 80), ride('D', 50)];
    expect(ranked(rides).map((r) => r.name)).toEqual(['C', 'D', 'A']);
  });

  it('leaves a park with no numeric wait ranking nothing', () => {
    expect(ranked([ride('X', 'Closed'), ride('Y', 'Down')])).toEqual([]);
  });
});

describe('heldRides (SRS058)', () => {
  it('holds the count longest numeric waits, in descending order', () => {
    expect(heldRides(roster(), 3).map((r) => r.name)).toEqual(['Test Track', 'Soarin', 'Spaceship Earth']);
  });

  it('holds fewer than the count when the park has fewer numeric waits', () => {
    expect(heldRides([ride('A', 60), ride('B', 'Down'), ride('C', 10)], 3).map((r) => r.name)).toEqual(['A', 'C']);
  });
});

describe('noOpenRides', () => {
  it('is true for a park whose every ride reports a not-operating state', () => {
    expect(noOpenRides([ride('X', 'Closed'), ride('Y', 'Down')])).toBe(true);
  });

  it('is true for a park with no rides at all', () => {
    expect(noOpenRides([])).toBe(true);
  });

  it('is false as soon as one ride reports a numeric wait', () => {
    expect(noOpenRides([ride('X', 'Closed'), ride('Y', 15)])).toBe(false);
  });
});

describe('remainingRides (SRS059)', () => {
  it('is everything the leaderboard does not hold, in the source’s own order — not re-sorted', () => {
    const rides = roster();
    const held = heldRides(rides, 3);
    // Source order keeps Imagination! (5) ahead of The Seas (8); a re-sorted remainder would swap them.
    expect(remainingRides(rides, held).map((r) => r.name)).toEqual([
      'Mission: Space',
      'Imagination!',
      'The Seas',
      'Living with the Land',
    ]);
  });

  it('a not-operating ride, never held, tours in the remainder', () => {
    const rides = [ride('A', 90), ride('B', 'Closed'), ride('C', 45), ride('D', 20)];
    const held = heldRides(rides, 3);
    expect(held.map((r) => r.name)).toEqual(['A', 'C', 'D']);
    expect(remainingRides(rides, held).map((r) => r.name)).toEqual(['B']);
  });
});

describe('pageCount (SRS059)', () => {
  it('is the remainder divided by the page size, rounded up', () => {
    expect(pageCount(4, 2)).toBe(2);
    expect(pageCount(5, 2)).toBe(3);
  });

  it('is never fewer than one page, even for an empty remainder', () => {
    expect(pageCount(0, 2)).toBe(1);
  });
});

describe('pageSlice (SRS059)', () => {
  it('shows one page of the remainder from the page’s own offset', () => {
    const remaining = [ride('a', 1), ride('b', 2), ride('c', 3), ride('d', 4)];
    expect(pageSlice(remaining, 0, 2).map((r) => r.name)).toEqual(['a', 'b']);
    expect(pageSlice(remaining, 1, 2).map((r) => r.name)).toEqual(['c', 'd']);
  });

  it('a last page short of a full one shows only what is left', () => {
    const remaining = [ride('a', 1), ride('b', 2), ride('c', 3)];
    expect(pageSlice(remaining, 1, 2).map((r) => r.name)).toEqual(['c']);
  });
});

describe('tourPadding', () => {
  it('pads a page short of a full one up to the page size', () => {
    expect(tourPadding(1, 2)).toEqual([0]);
  });

  it('pads nothing onto a full page', () => {
    expect(tourPadding(2, 2)).toEqual([]);
  });
});

describe('clockTime', () => {
  it('reads HH:MM straight off a timestamp’s own local clock', () => {
    expect(clockTime('2026-09-15T09:00:00-04:00')).toBe('09:00');
    expect(clockTime('2026-09-15T18:30:00-04:00')).toBe('18:30');
  });

  it('shows a value that carries no HH:MM whole, rather than refusing to draw it', () => {
    expect(clockTime('not-a-timestamp')).toBe('not-a-timestamp');
  });
});

describe('iconFor', () => {
  it('resolves a real glyph for a park the module has one for, keyed on its pretty name', () => {
    // The icon set is keyed on the pretty name (boundary/openapi.yaml's ParkWaitTimesPark.name),
    // the one identity the wire carries.
    const icon = iconFor('Magic Kingdom');
    expect(icon).toContain('<svg');
  });

  it('resolves nothing for a name the module has no glyph for — the name-only fallback', () => {
    expect(iconFor('Not A Known Park')).toBeUndefined();
  });
});

describe('uniformCardWidth', () => {
  it('is zero for an empty roster — no card to size', () => {
    expect(uniformCardWidth([])).toBe(0);
  });

  it('sizes a card to its identity, the gap and hours, and the card chrome, rounded up', () => {
    // 100 + (8 + 40) + 20.4 = 168.4 → 169
    expect(uniformCardWidth([{ identityWidth: 100, hoursWidth: 40, gap: 8, chrome: 20.4 }])).toBe(169);
  });

  it('drops the gap and hours for a park drawing no hours', () => {
    // 100 + 20, the gap ignored where there are no hours
    expect(uniformCardWidth([{ identityWidth: 100, hoursWidth: null, gap: 8, chrome: 20 }])).toBe(120);
  });

  it('takes the widest card across the roster, not the first or last', () => {
    expect(
      uniformCardWidth([
        { identityWidth: 100, hoursWidth: null, gap: 8, chrome: 20 }, // 120
        { identityWidth: 130, hoursWidth: 50, gap: 8, chrome: 20 }, // 208
        { identityWidth: 90, hoursWidth: 30, gap: 8, chrome: 20 }, // 148
      ]),
    ).toBe(208);
  });
});
