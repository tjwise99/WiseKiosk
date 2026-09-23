import { readdirSync } from 'node:fs';

import type { Page } from '@playwright/test';

import type { ModuleAnswer } from '../../src/lib/payload';
import {
  COUNTERS,
  countAllocationsIn,
  growth,
  readAllocations,
  type AllocationCounts,
} from './allocation';
import {
  advanceHostClock,
  expect,
  holdHostClock,
  render,
  serveModuleData,
  test,
  type Fixture,
} from './harness';

/**
 * Every module's steady-state allocation, read as a **rate** rather than as a total.
 *
 * The deployed host runs a single ~1 GHz core under a JavaScript engine with no JIT
 * (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->), and its collector is driven by
 * allocation rate: a display that allocates promoted garbage on every timer tick earns a full
 * stop-the-world collection on a clean cadence, which on that core is a panel frozen for something
 * near a second. An ablation on the board attributed the freeze to exactly that and to nothing else
 * (meta-wisekiosk #100 gpu-compositing). So the fault is not *how much* a module allocates — a
 * display that draws is allowed to allocate — it is allocation that **scales with the tick** rather
 * than with what a viewer can see change.
 *
 * That is what this reads. Each module is mounted twice, driven through two steady-state windows of
 * different length, and judged on the difference: everything a mount costs is identical in both and
 * cancels, so what is left is the per-minute rate of the settled display. A module that formats only
 * when its reading changes has a rate near zero whatever its mount cost; a module that re-formats
 * per second has a rate of sixty, and no mount-time allowance can hide it.
 *
 * Two of the four counters are judged at a rate of **zero**, with no figure to set:
 * `window.matchMedia` hands back a `MediaQueryList` the document retains for its own lifetime, and
 * an `Intl` formatter is a locale resolution meant to be built once and kept. Neither belongs on any
 * repeating path, so a settled display builds neither, and a module that has a reason to is one that
 * argues for an exception here rather than one this gate has to guess a budget for. The other two —
 * formatting performed, and DOM nodes created — a drawing module does legitimately repeat, so each
 * carries a per-module figure below.
 *
 * **What this cannot see.** It counts calls into four platform APIs, not bytes: a module that
 * allocates heavily in plain JavaScript — building arrays or objects per tick, retaining closures —
 * is invisible to it. A heap reading would cover that and is not available: the collector this is
 * about is the deployed host's, whose behaviour no figure the runner's browser reports predicts, and
 * a growth threshold over the runner's own heap would be a flaky check of a different engine. The
 * four counted here are the ones the board's ablation actually named.
 */

/** The module directories, which is what a module *is*
    ([ADR 0021 rev 4](../../../docs/decisions/0021-repository-layout.md)). Read from the tree rather
    than listed, so a module added tomorrow is judged by this gate without this file being edited —
    it arrives with no case below and fails on that, which is the module's author being asked to say
    what its settled display costs rather than the gate quietly not covering it. */
const MODULE_NAMES = readdirSync(new URL('../../src/modules', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** An instant to hold the host clock at, so every reading is attributable to a clock the test drives. */
const HOST_TIME = new Date('2026-08-31T14:00:00Z');

/** Long enough after mount for the first read to have landed and the first frame to have been drawn,
    so neither window is measuring the mount. It is inside both windows alike and cancels regardless;
    it is here so that the shorter window is a settled display rather than a still-settling one. */
const SETTLE_MS = 5_000;

/** The shorter steady-state window, and the longer. The difference between them — two simulated
    minutes — is what the rate is read over, and it is long enough to carry several of every cadence
    the display runs on: the clock's second and its minute rollover, the park rotation, the weather
    series switch, the shell's liveness poll. */
const WINDOW_MS = 60_000;
const LONGER_WINDOW_MS = 180_000;
const RATED_MINUTES = (LONGER_WINDOW_MS - WINDOW_MS) / 60_000;

/** What a module's settled display may spend per minute, on the two counters a drawing module
    legitimately repeats. A figure per module rather than one shared bar: what a viewer sees change,
    and how often, is the module's own. */
type Budget = Readonly<Record<'intlFormatCalls' | 'nodesCreated', number>>;

/** One module, as this gate drives it: where it is placed, what answers its route, and what its
    settled display may spend. */
interface ModuleCase {
  /** The configuration that places it — one module, alone on the display, so what is counted is
      attributable to it. */
  readonly fixture: Fixture;
  /** What answers its data route, for a module that reads one. Answers the same reading every time,
      so a poll inside a window changes nothing on screen and the rate stays the settled one. */
  readonly answer?: (asked: URL, body: unknown) => ModuleAnswer;
  /** What must be on screen once the module has settled: proof the case drove the path it exists to
      read, matched as "at least one" since how many a module draws is its own. Every counter reads
      near zero over a module that fell back to its loading or unavailable state, which is the one
      way this gate goes green without having measured the display. */
  readonly settled: string;
  readonly budget: Budget;
  /** What the budget decomposes into. Written so the next author argues with the figure rather than
      re-deriving it, and so a figure raised without a cadence to raise it for is visible as such. */
  readonly basis: string;
}

const REGION = 'middle_center';

/** One park's answer with a roster long enough that several ride names overflow their column and the
    marquee registers, since a marquee that never registers is the driver this gate exists for going
    unmeasured. */
function parksAnswer(): ModuleAnswer {
  return {
    status: 200,
    data: {
      parks: [
        {
          name: 'Magic Kingdom Park',
          available: true,
          rides: Array.from({ length: 12 }, (_, index) => ({
            name: `A ride whose name is far too long for the column it is drawn in, number ${index}`,
            state: 'Operating',
            waitMinutes: 5 * index,
          })),
        },
      ],
    },
  } as ModuleAnswer;
}

/** A reading for one point, three parts, in the shape the route answers. */
function weatherAnswer(): ModuleAnswer {
  return {
    status: 200,
    data: {
      current: { temp: 68, apparentTemp: 65, humidity: 55, windSpeed: 9, weatherCode: 0, isDay: true },
      hourly: Array.from({ length: 12 }, (_, index) => ({
        time: `2026-08-31T${String(14 + index).padStart(2, '0')}:00:00Z`,
        temp: 68 + index,
        weatherCode: 61,
        precipProbability: 5 * index,
        isDay: true,
      })),
      daily: Array.from({ length: 5 }, (_, index) => ({
        time: `2026-09-0${index + 1}T00:00:00Z`,
        weatherCode: 71,
        max: 88 + index,
        min: 48 - index,
        precipProbability: 5 * index,
      })),
    },
  } as ModuleAnswer;
}

/**
 * Every module, by the name it registers under, with what this gate drives it through. A module in
 * `MODULE_NAMES` with no entry here fails the roster case below rather than being skipped.
 */
const CASES: Record<string, ModuleCase> = {
  clock: {
    fixture: { modules: [{ region: REGION, module: 'clock', options: {} }] },
    settled: '[data-clock-time]',
    budget: { intlFormatCalls: 2, nodesCreated: 2 },
    basis:
      'The reading is re-read every second and re-formatted once a minute, so the settled rate is ' +
      'one `formatToParts` per minute and no node at all — the seconds are drawn by writing a text ' +
      'node that already exists. Measured at 1 and 0; the floor of two is one change of headroom, ' +
      'so a rendering that legitimately reformats twice a minute is not a failure.',
  },
  weather: {
    fixture: {
      modules: [
        { region: REGION, module: 'weather', options: { location: { lat: 42.36, lon: -71.06 } } },
      ],
    },
    answer: weatherAnswer,
    settled: '[data-weather-series]',
    budget: { intlFormatCalls: 2, nodesCreated: 36 },
    basis:
      'The series switch is what the viewer sees change; at the schema default it switches six ' +
      'times a minute and redraws the series it switched to. Measured at 30 nodes a minute, five ' +
      'per switch, and no formatting at all — the weekday formatter is built once at mount and the ' +
      'reading it draws only moves on a poll. Budgeted at one switch of headroom.',
  },
  park_wait_times: {
    fixture: {
      modules: [
        {
          region: REGION,
          module: 'park_wait_times',
          options: { parks: ['Magic Kingdom Park'], columns: 1, rows: 1 },
        },
      ],
    },
    answer: parksAnswer,
    // The class the marquee action adds to a column it registered, which is the path this whole
    // gate was written for: the rotation tick that re-renders and re-registers was the dominant
    // driver on the board. A fixture whose names happened to fit would register nothing and read a
    // rate that was never about the marquee at all.
    settled: '.marquee',
    budget: { intlFormatCalls: 2, nodesCreated: 12 },
    basis:
      'The rotation tick is what the viewer sees change: at the schema default it flips seven and a ' +
      'half times a minute, each flip re-rendering the rows it turned over and restarting the ' +
      'marquee cycle. Measured at 6 nodes a minute and no formatting. Budgeted at twice the measured ' +
      'rate, which is still a third of what a one-second tick would spend.',
  },
};

/** The seed: a module written to allocate per tick, so the predicate below is proven to reject one
    (`./stubs/Churns.svelte`). */
const CHURNING: ModuleCase = {
  fixture: { modules: [{ region: REGION, module: 'churns' }] },
  settled: '[data-churns]',
  budget: { intlFormatCalls: 0, nodesCreated: 0 },
  basis: 'The seed is judged by every module budget in turn, so it needs none of its own.',
};

/** Every counter whose settled rate is above what it is allowed, named with both figures. An empty
    list is a module inside its budget. */
function exceedances(perMinute: AllocationCounts, budget: Budget): string[] {
  const allowed: Record<string, number> = { ...budget, matchMedia: 0, intlConstructions: 0 };
  return COUNTERS.filter((counter) => perMinute[counter] > allowed[counter]).map(
    (counter) => `${counter}: ${perMinute[counter]}/min against ${allowed[counter]}/min allowed`,
  );
}

/**
 * Mounts `placed`, settles it, drives it through `windowMs` of simulated time, and reads the
 * counters. The navigation `render` makes gives a fresh document, so the counters this returns start
 * from that document's own zero — which is what lets two of these be differenced into a rate.
 */
async function overWindow(
  page: Page,
  placed: ModuleCase,
  windowMs: number,
): Promise<AllocationCounts> {
  if (placed.answer) {
    await serveModuleData(page, placed.answer);
  }
  await render(page, placed.fixture);
  // Settled first, then read: the clock is held, so a measurement a module defers to its next frame
  // has not run at mount — the marquee's own registration is one, and asserting before the settle
  // would read a display that had not started rather than one that had nothing to show.
  await advanceHostClock(page, SETTLE_MS);
  await expect(page.locator(placed.settled).first()).toBeAttached();
  await advanceHostClock(page, windowMs);
  return readAllocations(page);
}

/** `placed`'s settled allocation rate, per minute, with the mount cancelled out. */
async function ratePerMinute(
  page: Page,
  placed: ModuleCase,
): Promise<AllocationCounts> {
  await countAllocationsIn(page);
  // Held once, before either window: the clock this drives only moves forward, and it survives the
  // navigation each window makes. Each window therefore starts where the last one left off, which is
  // deterministic — both windows run the same cadences, so what is differenced out is the mount and
  // what is left is the rate.
  await holdHostClock(page, HOST_TIME);
  const shorter = await overWindow(page, placed, WINDOW_MS);
  const longer = await overWindow(page, placed, LONGER_WINDOW_MS);
  const over = growth(longer, shorter);
  const rate = {} as AllocationCounts;
  for (const counter of COUNTERS) {
    rate[counter] = over[counter] / RATED_MINUTES;
  }
  return rate;
}

test.describe('steady-state allocation', () => {
  // Four simulated minutes per module, driven in steps short enough to keep an ask in flight inside
  // its own deadline (`advanceHostClock`), is several hundred round trips to the page — real seconds
  // spent on simulated ones. The default per-test budget is written for a case that navigates once.
  test.describe.configure({ timeout: 180_000 });

  test('every module the tree carries is driven by a case here', () => {
    expect(MODULE_NAMES.length, 'the module roster resolved to nothing, so nothing was judged').
      toBeGreaterThan(0);
    expect(
      MODULE_NAMES.filter((name) => CASES[name] === undefined),
      'a module with no case here is not covered by this gate: give it a placement, an answer and a budget',
    ).toEqual([]);
    expect(
      Object.keys(CASES).filter((name) => !MODULE_NAMES.includes(name)),
      'a case here names no module in the tree',
    ).toEqual([]);
  });

  test('the budgets still reject the rates the modules were fixed from', () => {
    // The two defects the board's ablation actually named (meta-wisekiosk #100 gpu-compositing),
    // as the rates they ran at. Written as figures rather than measured, because the code that
    // produced them is gone: what this pins is the *budgets*, so one raised past the fault it was
    // set to catch fails here rather than going quietly green on the next regression.
    //
    // The clock re-formatted the whole reading every second — one `formatToParts` and two
    // `format` calls — although only the seconds field moved: three a second, 180 a minute.
    expect(
      exceedances(
        { matchMedia: 0, intlConstructions: 0, intlFormatCalls: 180, nodesCreated: 0 },
        CASES.clock.budget,
      ),
      "the clock's budget no longer rejects the per-second reformat it was set against",
    ).not.toEqual([]);

    // The marquee called `matchMedia` on every re-registration, leaving a document-retained
    // `MediaQueryList` behind each time: one per overflowing column per rotation. Any rate above
    // zero is rejected, so the figure only has to be a rate this fault could produce.
    expect(
      exceedances(
        { matchMedia: 1, intlConstructions: 0, intlFormatCalls: 0, nodesCreated: 0 },
        CASES.park_wait_times.budget,
      ),
      "the park module's budget no longer rejects a per-rotation `matchMedia`",
    ).not.toEqual([]);
  });

  for (const name of MODULE_NAMES) {
    test(`${name} allocates at its settled rate, not at the tick`, async ({ page }) => {
      const placed = CASES[name];
      const rate = await ratePerMinute(page, placed);

      // The module was on screen for it. A rate read over a region that rendered nothing — an
      // unregistered name, a configuration the schema took but the page could not place — is zero on
      // every counter and green, which is the one way this check passes without measuring anything.
      await expect(
        page.locator(`[data-region="${REGION}"][data-modules~="${name}"]`),
      ).toHaveCount(1);

      // The whole reading rides in the message, not only the counter that failed: a budget is
      // re-argued from the rates beside it, and a failure that reported one number would send the
      // next author back to re-run this to see the other three.
      expect(
        exceedances(rate, placed.budget).join('; '),
        `${name} settled at ${JSON.stringify(rate)} per minute — ${placed.basis}`,
      ).toBe('');
    });
  }

  test('the gate rejects a module that allocates per tick', async ({ page }) => {
    const rate = await ratePerMinute(page, CHURNING);
    await expect(page.locator(`[data-region="${REGION}"][data-modules~="churns"]`)).toHaveCount(1);

    // Judged by every real module's budget in turn, not by one written for it: a seed rejected only
    // by a bar set to catch it proves the assertion, not the gate. Each of the four counters is named
    // separately, so a seed that stopped exercising one of them is reported rather than absorbed by
    // the other three.
    for (const [name, placed] of Object.entries(CASES)) {
      expect(
        exceedances(rate, placed.budget),
        `the seed passed ${name}'s budget — this gate no longer catches per-tick allocation`,
      ).not.toEqual([]);
    }
    for (const counter of COUNTERS) {
      expect(rate[counter], `the seed did not exercise ${counter}`).toBeGreaterThan(0);
    }
  });
});
