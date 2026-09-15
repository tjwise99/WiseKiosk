import type { ParkWaitTimesPark, ParkWaitTimesPayload, ParkWaitTimesRide } from '../../lib/boundary/client';
import {
  advanceHostClock,
  asksBeyondTheShell,
  channelsBeyondTheTier,
  expect,
  holdHostClock,
  render,
  serveModuleData,
  test,
  watchTraffic,
  type Fixture,
} from '../../../tests/render/harness';

/**
 * The park-wait-times module's render tests. Every one of them answers the module's route from the
 * test rather than letting anything reach a real source, so what is on screen is attributable to an
 * answer the case wrote. The stub answers by the request body it is handed (the parks named), which
 * is what lets one registration serve two placements reporting on two different rosters.
 */

const READ_INTERVAL_MS = 5 * 60 * 1000;

/** The last stretch of that interval, held back so a read can be shown to fall inside it. */
const ALMOST = 10_000;

/** An instant to hold the host clock at, wherever a case drives time rather than waiting it out. */
const HOST_TIME = new Date('2026-08-31T14:00:00Z');

/** One park's answer, defaulting to available with no rides — every case fills in what it reads. */
function onePark(id: string, fields: Partial<ParkWaitTimesPark> = {}): ParkWaitTimesPark {
  return { id, name: id, available: true, ...fields };
}

/** A full payload, one entry per park named. */
function parksPayload(parks: ParkWaitTimesPark[]): ParkWaitTimesPayload {
  return { parks };
}

/** A placement naming `parks`, laid out `columns` × `rows`. */
function placed(
  parks: string[],
  { columns = parks.length, rows = 1, rotationIntervalSeconds }: { columns?: number; rows?: number; rotationIntervalSeconds?: number } = {},
  region = 'middle_center',
): Fixture {
  return {
    modules: [
      {
        region,
        module: 'park_wait_times',
        options: {
          parks,
          columns,
          rows,
          ...(rotationIntervalSeconds === undefined ? {} : { rotation_interval_seconds: rotationIntervalSeconds }),
        },
      },
    ],
  };
}

const MODULE = '[data-park-wait-times]';
const CARD = '[data-pwt-card]';
const LOADING = '[data-module-loading]';
const MODULE_UNAVAILABLE = '[data-module-unavailable]';
const PARK_UNAVAILABLE = '[data-pwt-unavailable]';
const LEADERBOARD_ROW = '[data-pwt-leaderboard-row]';
const TOUR_ROW = '[data-pwt-tour-row]';
const FOOTER = '[data-pwt-footer]';
const FOOTER_SEGMENT = '[data-pwt-footer-segment]';
const WAIT = '[data-pwt-wait]';

/** A card's own leaderboard-row and tour-row ride names, read in the order drawn. */
async function rideNamesIn(card: ReturnType<import('@playwright/test').Page['locator']>, selector: string): Promise<string[]> {
  return card.locator(selector).locator('.ride-name').allTextContents();
}

test('TST071: reports on the parks its configuration names, in the region it names, and moves with a second configuration', async ({
  page,
}) => {
  // One stub, two placements: the answer is a function of the ask, so the two rosters are told apart
  // by what each request carried rather than by the order the module happened to ask in.
  const served = await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return { status: 200, data: parksPayload(parks.map((id) => onePark(id))) };
  });

  await render(page, {
    modules: [
      { region: 'middle_center', module: 'park_wait_times', options: { parks: ['magic-kingdom'], columns: 1, rows: 1 } },
      { region: 'lower_third', module: 'park_wait_times', options: { parks: ['epcot'], columns: 1, rows: 1 } },
    ],
  });

  // The configured roster reached the request — the only place a park's identity appears on the
  // wire, the route's path naming none of them.
  expect(served.bodies, 'the first placement asked for its own one park').toContainEqual({
    parks: ['magic-kingdom'],
  });
  expect(served.bodies, 'the second placement asked for its own one park').toContainEqual({
    parks: ['epcot'],
  });

  // And it reached the region: each region shows the answer given for the park its own placement
  // named.
  const here = page.locator(`[data-region="middle_center"] [data-pwt-park]`);
  const there = page.locator(`[data-region="lower_third"] [data-pwt-park]`);
  await expect(here).toHaveAttribute('data-pwt-park', 'magic-kingdom');
  await expect(there).toHaveAttribute('data-pwt-park', 'epcot');

  // A second configuration moves both — read beside the presence above, so a component that
  // hardcoded the first roster cannot pass by never being asked again.
  await render(page, {
    modules: [
      { region: 'middle_center', module: 'park_wait_times', options: { parks: ['hollywood-studios'], columns: 1, rows: 1 } },
      { region: 'lower_third', module: 'park_wait_times', options: { parks: ['animal-kingdom'], columns: 1, rows: 1 } },
    ],
  });
  await expect(here).toHaveAttribute('data-pwt-park', 'hollywood-studios');
  await expect(there).toHaveAttribute('data-pwt-park', 'animal-kingdom');
});

test('TST074: draws every configured park at once, none absent awaiting a rotation between parks', async ({
  page,
}) => {
  const roster = ['magic-kingdom', 'epcot', 'hollywood-studios', 'animal-kingdom'];
  await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return { status: 200, data: parksPayload(parks.map((id) => onePark(id))) };
  });
  await render(page, placed(roster, { columns: 2, rows: 2 }));

  // All four, read on the first paint — nothing here waits for a clock to advance, because a park
  // rotating onto screen later would still pass a count taken after one.
  await expect(page.locator(CARD)).toHaveCount(roster.length);
  const shown = await page.locator(CARD).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-pwt-park')));
  expect(new Set(shown)).toEqual(new Set(roster));
});

/** Seven rides spread widely enough that the ranking (SRS058) and the rotation (SRS059) are each
    unambiguous: three waits longer than every other entry, and four more than the tour's own
    two-at-a-time page holds, so a full cycle takes more than one page. */
function rankedRoster(): ParkWaitTimesRide[] {
  return [
    { name: 'Test Track', wait: 80 },
    { name: 'Soarin', wait: 50 },
    { name: 'Spaceship Earth', wait: 20 },
    { name: 'Mission: Space', wait: 10 },
    { name: 'Imagination!', wait: 5 },
    { name: 'The Seas', wait: 8 },
    { name: 'Living with the Land', wait: 3 },
  ];
}

test('TST075: holds each park’s longest current waits in view, unmoved by the rotation of the rest', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot'], { rotationIntervalSeconds: 4 }));

  const card = page.locator(CARD);

  // The three longest waits, in descending order — the leaderboard's own ranking, not the source's.
  await expect(card.locator(LEADERBOARD_ROW)).toHaveCount(3);
  expect(await rideNamesIn(card, LEADERBOARD_ROW)).toEqual(['Test Track', 'Soarin', 'Spaceship Earth']);

  // The rotation of the rest advances underneath it, and the leaderboard is read again unmoved —
  // proving persistence against an active rotation rather than against a page that never ticked.
  await advanceHostClock(page, 4 * 1000);
  expect(await rideNamesIn(card, LEADERBOARD_ROW)).toEqual(['Test Track', 'Soarin', 'Spaceship Earth']);
  await advanceHostClock(page, 4 * 1000);
  expect(await rideNamesIn(card, LEADERBOARD_ROW)).toEqual(['Test Track', 'Soarin', 'Spaceship Earth']);
});

test('TST075: a not-operating ride does not take a leaderboard place — it tours instead', async ({ page }) => {
  // A ride with no minute figure has nothing for the leaderboard's ranking to compare, so it is not
  // among the held rides regardless of where it would have sorted by source order or by name; it
  // still reads, in the rotation below rather than the leaderboard.
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([
      onePark('magic-kingdom', {
        rides: [
          { name: 'Seven Dwarfs Mine Train', wait: 90 },
          { name: 'The Hall of Presidents', wait: 'Closed' },
          { name: 'Big Thunder Mountain Railroad', wait: 45 },
          { name: 'Splash Mountain', wait: 20 },
          { name: 'The Barnstormer', wait: 10 },
        ],
      }),
    ]),
  }));
  await render(page, placed(['magic-kingdom']));

  const card = page.locator(CARD);
  expect(await rideNamesIn(card, LEADERBOARD_ROW)).toEqual([
    'Seven Dwarfs Mine Train',
    'Big Thunder Mountain Railroad',
    'Splash Mountain',
  ]);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['The Hall of Presidents', 'The Barnstormer']);
});

test('draws a park’s hours as given even where they do not parse into an hour and a minute', async ({
  page,
}) => {
  // clockTime's own fallback: a timestamp the `T\d\d:\d\d` read cannot find a match in is shown
  // whole rather than this component refusing to draw the park's hours at all.
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom', { hours: { open: 'not-a-timestamp', close: 'also-not-one' } })]),
  }));
  await render(page, placed(['magic-kingdom']));

  await expect(page.locator('[data-pwt-hours]')).toHaveText('not-a-timestamp–also-not-one');
});

test('TST076: tours the remaining rides two at a time, on the configured interval, reaching every one of them', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot'], { rotationIntervalSeconds: 6 }));

  const card = page.locator(CARD);
  // Held: Test Track, Soarin, Spaceship Earth. Remaining, in the source's own order: Mission: Space,
  // Imagination!, The Seas, Living with the Land — four rides, two pages at two per page.
  await expect(card.locator(TOUR_ROW)).toHaveCount(2);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  // Not yet — a step short of the configured interval finds the same pair still shown.
  await advanceHostClock(page, 6 * 1000 - 500);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  // The interval elapses, and the tour advances to the next pair — the whole of the remainder is
  // reachable, not only the pair the first paint happened to show.
  await advanceHostClock(page, 500);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['The Seas', 'Living with the Land']);

  // And a full cycle returns to the first pair, the tour being a repeating rotation rather than a
  // one-time advance.
  await advanceHostClock(page, 6 * 1000);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);
});

test('TST076: the rotation interval is the configuration’s, not one fixed in the module', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot'], { rotationIntervalSeconds: 20 }));

  const card = page.locator(CARD);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  // A shorter span than the one configured here does not advance a module configured for twenty
  // seconds, proving the interval read is the configuration's rather than a value fixed in the
  // component — the same distinction TST069 draws for the weather module's series switch.
  await advanceHostClock(page, 6 * 1000);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  await advanceHostClock(page, 20 * 1000 - 6 * 1000);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['The Seas', 'Living with the Land']);
});

test('TST076: a placement that omits its own rotation interval tours on the schema’s default of eight seconds', async ({
  page,
}) => {
  // rotation_interval_seconds is genuinely absent from this placement's own options (unlike the
  // cases above, which all set it) — the schema's own default: 8 (config/schema.json) is what
  // ajv's useDefaults fills in before the component ever reads the config, and the component reads
  // that value directly rather than falling back to one of its own (ParkWaitTimes.svelte no longer
  // carries a `?? 8`). This pins the eight-second figure that fill is now the only source of;
  // it does not by itself prove every way that fill could stop working.
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot']));

  const card = page.locator(CARD);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  // A step short of eight seconds finds the same pair still shown.
  await advanceHostClock(page, 8 * 1000 - 500);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['Mission: Space', 'Imagination!']);

  // The eight-second default elapses, and the tour advances.
  await advanceHostClock(page, 500);
  expect(await rideNamesIn(card, TOUR_ROW)).toEqual(['The Seas', 'Living with the Land']);
});

test('TST076: the footer marks the tour’s own position, one segment per page', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot'], { rotationIntervalSeconds: 5 }));

  const segments = page.locator(CARD).locator(FOOTER_SEGMENT);
  await expect(segments).toHaveCount(2);
  await expect(segments.nth(0)).toHaveClass(/filled/);
  await expect(segments.nth(1)).not.toHaveClass(/filled/);

  await advanceHostClock(page, 5 * 1000);
  await expect(segments.nth(0)).not.toHaveClass(/filled/);
  await expect(segments.nth(1)).toHaveClass(/filled/);
});

test('TST077: lays its cards out in the column and row counts its configuration names, and a second shape re-lays them', async ({
  page,
}) => {
  const roster = ['magic-kingdom', 'epcot', 'hollywood-studios'];
  await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return { status: 200, data: parksPayload(parks.map((id) => onePark(id))) };
  });

  await render(page, placed(roster, { columns: 3, rows: 1 }));
  const grid = page.locator('[data-pwt-grid]');
  const firstShape = await grid.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
    rows: getComputedStyle(element).gridTemplateRows.trim().split(/\s+/).length,
  }));
  expect(firstShape).toEqual({ columns: 3, rows: 1 });

  // The same three parks, a second shape — the layout follows the configuration rather than the
  // roster it happens to have been built for.
  await render(page, placed(roster, { columns: 1, rows: 3 }));
  const secondShape = await grid.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
    rows: getComputedStyle(element).gridTemplateRows.trim().split(/\s+/).length,
  }));
  expect(secondShape).toEqual({ columns: 1, rows: 3 });
  const shown = await page.locator(CARD).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-pwt-park')));
  expect(new Set(shown), 're-laid rather than re-fetched, so the same roster still shows').toEqual(new Set(roster));
});

test('TST078: draws a ride’s wait as the mark its own payload names, not the page’s clock or the park’s hours', async ({
  page,
}) => {
  // The park's own hours say it is open right now, and the clock is held to a moment inside them —
  // and yet what each ride draws is read off its own wait field alone.
  const openNow = { open: '2026-08-31T09:00:00-04:00', close: '2026-08-31T22:00:00-04:00' };
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([
      onePark('magic-kingdom', {
        hours: openNow,
        rides: [
          { name: 'Big Thunder Mountain Railroad', wait: 25 },
          { name: 'Splash Mountain', wait: 'Closed' },
        ],
      }),
    ]),
  }));
  await render(page, placed(['magic-kingdom']));

  const minutes = page.locator(`${WAIT}[data-pwt-wait-kind="minutes"]`);
  const state = page.locator(`${WAIT}[data-pwt-wait-kind="state"]`);
  await expect(minutes).toHaveText('25');
  await expect(state).toHaveText('Closed');

  // A length of time and a state are different kinds of mark, not merely different text
  // (SRS061; the UI design spec § The wait slot) — read as a class distinction between the two.
  await expect(minutes).not.toHaveClass(/state/);
  await expect(state).toHaveClass(/state/);

  // And the state a ride draws is the payload's, not a computation this component made from the
  // hours or the clock: a ride the payload calls `Closed` draws `Closed` beside another ride, at the
  // same park, at the same moment, that the payload calls a numeric wait — if the drawing followed
  // the hours or the clock instead, the two rides could not disagree.
  await expect(minutes).not.toHaveText(/Closed/);
});

test('TST079: follows its source to a new reading inside the freshness bound, without reloading', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom', { rides: [{ name: 'The Barnstormer', wait: 10 }] })]),
  }));
  await render(page, placed(['magic-kingdom']));

  const wait = page.locator(WAIT).first();
  await expect(wait).toHaveText('10');

  // A mark on the page a reload would clear, so the change below is attributable to the module
  // re-reading rather than to the display having started over.
  await page.evaluate(() => {
    (window as unknown as { standing?: boolean }).standing = true;
  });

  // The source now says something else, staged as the answer a later poll receives.
  const afterTheChange = await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom', { rides: [{ name: 'The Barnstormer', wait: 35 }] })]),
  }));

  await advanceHostClock(page, READ_INTERVAL_MS - ALMOST);
  expect(afterTheChange.urls, 'it had not asked again before its interval was up').toEqual([]);
  await advanceHostClock(page, ALMOST);

  await expect(wait).toHaveText('35');
  await expect(wait, 'the reading it opened with is gone').not.toHaveText('10');
  expect(afterTheChange.urls, 'the reading was asked for again').toHaveLength(1);
  expect(
    await page.evaluate(() => (window as unknown as { standing?: boolean }).standing),
    'the page never reloaded',
  ).toBe(true);
});

test('TST082: draws the wait times its own route answered with, and reads no other source', async ({
  page,
  baseURL,
}) => {
  // Registered before the page loads: a listener added afterwards would miss the load's own asks,
  // and an absence measured over nothing is not an absence.
  const traffic = watchTraffic(page);
  const served = await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom', { rides: [{ name: 'The Barnstormer', wait: 10 }] })]),
  }));
  await render(page, placed(['magic-kingdom']));

  await expect(page.locator(WAIT).first()).toHaveText('10');
  expect(served.urls.length, 'the module asked its own route').toBeGreaterThan(0);

  // And nothing else was asked — the shell's own two asks are named rather than every request being
  // permitted, so a second source would be left over rather than absorbed.
  expect([...new Set(asksBeyondTheShell(traffic))]).toEqual(['/api/park-wait-times']);
  expect(channelsBeyondTheTier(traffic, baseURL)).toEqual([]);
});

test('holds a park’s place in the grid and shows why, when that park’s own reading could not be produced', async ({
  page,
}) => {
  // One park fails, the other answers — the owner's per-park graceful-degradation ruling (WI-3),
  // read from the render side: the failing park holds its place and shows a reason, the healthy one
  // is unaffected.
  const REASON = 'The wait-times source did not answer for this park.';
  await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return {
      status: 200,
      data: parksPayload(
        parks.map((id) =>
          id === 'magic-kingdom'
            ? onePark(id, { available: false, message: REASON })
            : onePark(id, { rides: [{ name: 'Test Track', wait: 40 }] }),
        ),
      ),
    };
  });
  await render(page, placed(['magic-kingdom', 'epcot'], { columns: 2, rows: 1 }));

  await expect(page.locator(CARD)).toHaveCount(2);
  const failing = page.locator(`${CARD}[data-pwt-park="magic-kingdom"]`);
  const healthy = page.locator(`${CARD}[data-pwt-park="epcot"]`);
  await expect(failing.locator(PARK_UNAVAILABLE)).toHaveText(REASON);
  await expect(failing.locator(LEADERBOARD_ROW)).toHaveCount(0);
  await expect(healthy.locator(LEADERBOARD_ROW)).toContainText('Test Track');

  // The failing park's own header — icon and name — stays drawn: the README's own wording is
  // "in place of its rides" (§ States, Park unavailable), not the whole card, so a viewer can tell
  // which park failed rather than reading only its grid position.
  await expect(failing.locator('[data-pwt-header]')).toBeVisible();
  await expect(failing.locator('[data-pwt-header]')).toContainText('magic-kingdom');
});

test('shows that it is reading while its route has not answered yet', async ({ page }) => {
  // The one state `serveModuleData` cannot drive: every answer it gives is an answer, and this is
  // what is on screen before there is one. The route is taken and never fulfilled, which is the
  // ask-in-flight the module first paints against.
  await page.route('**/api/*', () => {});
  await render(page, placed(['magic-kingdom']));

  const loading = page.locator(`[data-region="middle_center"] ${LOADING}`);
  await expect(loading).toBeVisible();
  await expect(loading).not.toBeEmpty();
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator(MODULE_UNAVAILABLE)).toHaveCount(0);
});

test('renders why its own route failed, in its own place, while the backend is reachable', async ({
  page,
}) => {
  const REASON = 'The wait-times source did not answer.';
  await serveModuleData(page, () => ({
    status: 502,
    data: { module: 'park_wait_times', cause: 'upstream_unavailable', message: REASON },
  }));
  await render(page, placed(['magic-kingdom']));

  const box = page.locator(`[data-region="middle_center"] ${MODULE_UNAVAILABLE}`);
  await expect(box).toBeVisible();
  await expect(box).toContainText(REASON);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(0);
});

test('lays out uniform, aligned cards that do not run past the viewport, with real park and ride names', async ({
  page,
}) => {
  // The card is a fixed width (ParkWaitTimes.svelte's `cardGeometry`), not one grown to its own
  // content — a name too wide for its column scrolls to reveal itself (`ParkCard.svelte`'s
  // `marquee`) rather than widening the card or wrapping the grid past the viewport, and every card
  // takes the same width regardless of what its own park's names are. Read at the deployed
  // three-column shape (config.json), over a real (unabbreviated) roster.
  const roster = [
    'magic-kingdom',
    'epcot',
    'hollywood-studios',
    'animal-kingdom',
    'universal-studios',
    'islands-of-adventure',
  ];
  const names: Record<string, string> = {
    'magic-kingdom': 'Magic Kingdom',
    epcot: 'Epcot',
    'hollywood-studios': 'Hollywood Studios',
    'animal-kingdom': 'Animal Kingdom',
    'universal-studios': 'Universal Studios',
    'islands-of-adventure': 'Islands of Adventure',
  };
  const rides: Record<string, ParkWaitTimesRide[]> = {
    'magic-kingdom': [
      { name: 'Seven Dwarfs Mine Train', wait: 90 },
      { name: "Walt Disney's Carousel of Progress", wait: 15 },
    ],
    epcot: [
      { name: 'Guardians of the Galaxy: Cosmic Rewind', wait: 75 },
      { name: 'Remy’s Ratatouille Adventure', wait: 40 },
    ],
    'hollywood-studios': [
      { name: 'Star Wars: Rise of the Resistance', wait: 85 },
      { name: 'Mickey & Minnie’s Runaway Railway', wait: 35 },
    ],
    'animal-kingdom': [
      { name: 'Avatar Flight of Passage', wait: 95 },
      { name: 'Expedition Everest - Legend of the Forbidden Mountain', wait: 30 },
    ],
    'universal-studios': [
      { name: "Harry Potter and the Escape from Gringotts", wait: 70 },
      { name: 'Revenge of the Mummy', wait: 25 },
    ],
    'islands-of-adventure': [
      { name: 'Harry Potter and the Forbidden Journey', wait: 80 },
      { name: 'Jurassic World VelociCoaster', wait: 45 },
    ],
  };
  await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return {
      status: 200,
      data: parksPayload(parks.map((id) => onePark(id, { name: names[id], rides: rides[id] }))),
    };
  });
  await render(page, placed(roster, { columns: 3, rows: 2 }));

  const cards = page.locator(CARD);
  await expect(cards).toHaveCount(roster.length);

  const boxes = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
  const widths = new Set(boxes.map((box) => box.width));
  expect(widths.size, 'every card the same width').toBe(1);

  // The two rows of three: each row's own three cards share one top, proving the grid holds its
  // shape rather than one card (an empty leaderboard, an overflowing name) sitting off the line.
  const tops = new Set(boxes.map((box) => box.top));
  expect(tops.size, 'exactly two distinct row positions').toBe(2);

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('leaves a park’s leaderboard at its own real row count — no permanent blank row where it holds fewer than three numeric waits', async ({
  page,
}) => {
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([
      onePark('epcot', {
        rides: [
          { name: 'Test Track', wait: 60 },
          { name: 'Spaceship Earth', wait: 10 },
        ],
      }),
    ]),
  }));
  await render(page, placed(['epcot']));

  const card = page.locator(CARD);
  await expect(card.locator(LEADERBOARD_ROW)).toHaveCount(2);
  // The mechanism that reserved a third slot regardless of how many rides a park holds is gone —
  // not merely unfilled here, absent from the DOM.
  await expect(card.locator('[data-pwt-leaderboard-placeholder]')).toHaveCount(0);
});

test('holds the footer’s own position across the tour’s pages, including a last page short a ride', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([
      onePark('magic-kingdom', {
        rides: [
          { name: 'Seven Dwarfs Mine Train', wait: 90 },
          { name: 'Big Thunder Mountain Railroad', wait: 45 },
          { name: 'Pirates of the Caribbean', wait: 30 },
          { name: "Walt Disney's Carousel of Progress", wait: 10 },
          { name: 'Tomorrowland Speedway', wait: 8 },
          { name: 'Jungle Cruise', wait: 6 },
          { name: "It's a Small World", wait: 4 },
          { name: 'Haunted Mansion', wait: 2 },
        ],
      }),
    ]),
  }));
  await render(page, placed(['magic-kingdom'], { rotationIntervalSeconds: 5 }));

  const card = page.locator(CARD);
  const footerY = async () => (await card.locator(FOOTER_SEGMENT).first().boundingBox())?.y;

  // Held: Seven Dwarfs Mine Train, Big Thunder Mountain Railroad, Pirates of the Caribbean.
  // Remaining, in source order: Carousel of Progress, Tomorrowland Speedway, Jungle Cruise, Small
  // World, Haunted Mansion — five, an odd count, three pages (2, 2, 1).
  const footer0 = await footerY();
  await expect(card.locator(TOUR_ROW)).toHaveCount(2);

  await advanceHostClock(page, 5 * 1000);
  await expect(card.locator(TOUR_ROW)).toHaveCount(2);
  expect(await footerY()).toBe(footer0);

  await advanceHostClock(page, 5 * 1000);
  // The odd last page: one real row, padded by exactly one blank row so the footer beneath it does
  // not move up for having one fewer ride to show — padding the two full pages above never carried.
  await expect(card.locator(TOUR_ROW)).toHaveCount(1);
  await expect(card.locator('[data-pwt-tour-placeholder]')).toHaveCount(1);
  expect(await footerY()).toBe(footer0);
});

test('anchors the footer to the card’s own bottom edge, with nothing beneath it', async ({ page }) => {
  // The card's own uniform min-height (`cardHeightPx`, ParkWaitTimes.svelte) can sit taller than a
  // card's own content — read here even against a single card, the footer must sit flush with the
  // card's own inner bottom edge (inside its padding and border) rather than leaving trailing space
  // below it: the leftover, if any, belongs above the More Waits block, not beneath the footer.
  await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('epcot', { rides: rankedRoster() })]),
  }));
  await render(page, placed(['epcot']));

  const card = page.locator(CARD);
  const cardBox = await card.boundingBox();
  const footerBox = await card.locator(FOOTER).boundingBox();
  if (!cardBox || !footerBox) {
    throw new Error('the card or its footer did not render a box');
  }
  // `boundingBox` reads the card's own border box; its inner (padding) bottom edge is that box's
  // bottom less its own bottom border and padding.
  const { paddingBottom, borderBottomWidth } = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingBottom: parseFloat(style.paddingBottom),
      borderBottomWidth: parseFloat(style.borderBottomWidth),
    };
  });
  const cardInnerBottom = cardBox.y + cardBox.height - paddingBottom - borderBottomWidth;
  const gap = cardInnerBottom - (footerBox.y + footerBox.height);
  expect(Math.abs(gap), 'the footer’s bottom edge sits flush with the card’s own inner bottom edge').toBeLessThan(1);
});

test('holds every card to the same height, whatever its own park’s shape — a Closed card, a short open card with nothing to tour, and a full leaderboard-plus-tour card together', async ({
  page,
}) => {
  const roster = ['epcot', 'islands-of-adventure', 'magic-kingdom'];
  const rides: Record<string, ParkWaitTimesRide[]> = {
    epcot: [
      { name: 'Test Track', wait: 60 },
      { name: 'Spaceship Earth', wait: 10 },
    ],
    'islands-of-adventure': [
      { name: 'Harry Potter and the Forbidden Journey', wait: 'Closed' },
      { name: 'Jurassic World VelociCoaster', wait: 'Down' },
    ],
    'magic-kingdom': [
      { name: 'Seven Dwarfs Mine Train', wait: 90 },
      { name: 'Big Thunder Mountain Railroad', wait: 45 },
      { name: 'Pirates of the Caribbean', wait: 30 },
      { name: "Walt Disney's Carousel of Progress", wait: 10 },
      { name: 'Tomorrowland Speedway', wait: 8 },
    ],
  };
  await serveModuleData(page, (_asked, body) => {
    const { parks } = body as { parks: string[] };
    return {
      status: 200,
      data: parksPayload(parks.map((id) => onePark(id, { rides: rides[id] }))),
    };
  });
  await render(page, placed(roster, { columns: 3, rows: 1 }));

  const heights = await page
    .locator(CARD)
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(new Set(heights).size, 'every card the same height').toBe(1);
});

test('stands down to nothing while the backend is unreachable, and stops asking it', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);

  const whileServing = await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom')]),
  }));
  await render(page, placed(['magic-kingdom']));
  await expect(page.locator(MODULE)).toBeVisible();
  const askedOnce = whileServing.urls.length;
  expect(askedOnce, 'it asked while the backend was serving').toBeGreaterThan(0);

  const whileGone = await serveModuleData(page, () => ({
    status: 200,
    data: parksPayload([onePark('magic-kingdom')]),
  }));
  await render(page, placed(['magic-kingdom']), 'frame', { healthz: 'abort' });

  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();
  await expect(page.locator(`[data-region="middle_center"] ${MODULE}`)).toHaveCount(0);
  await expect(page.locator(MODULE_UNAVAILABLE)).toHaveCount(0);
  await expect(page.locator(LOADING)).toHaveCount(0);

  const askedBeforeTheOutageWasKnown = whileGone.urls.length;
  await advanceHostClock(page, READ_INTERVAL_MS * 2);
  expect(whileGone.urls.length, 'it asked nothing further once the backend was gone').toBe(
    askedBeforeTheOutageWasKnown,
  );
});
