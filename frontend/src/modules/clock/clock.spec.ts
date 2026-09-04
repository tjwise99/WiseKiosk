import { expect, test, type Page } from '@playwright/test';

import {
  asksBeyondTheShell,
  channelsBeyondTheTier,
  holdHostClock,
  render,
  watchTraffic,
  type Fixture,
} from '../../../tests/render/harness';

/**
 * The clock's render tests. Every one of them drives the host clock rather than reading the runner's,
 * which is what makes the value on screen attributable to a clock the test controls; the locale and
 * the zone are pinned for the same reason, since what the module renders is arranged by the host and
 * an unpinned host arranges it differently on another machine. Neither pinning obliges the module to
 * any particular spelling — the items read which parts are present and which hour they name, not how
 * a separator or a meridiem indicator is written.
 */
test.use({ locale: 'en-US', timezoneId: 'UTC' });

/** An afternoon, so the two hour forms name the hour differently rather than alike. */
const HOST_TIME = new Date('2026-08-30T15:04:05Z');

/** The parts of that date, as the host would put them — read from the constant, not re-derived. */
const HOST_DATE_PARTS = ['August', '30', '2026'];

/** A second instant on a different date, to read the date across a move of the host clock. */
const SECOND_TIME = new Date('2027-01-15T09:20:00Z');
const SECOND_DATE_PARTS = ['January', '15', '2027'];

const REGION = 'middle_center';

/** A display carrying one clock, configured as the case under test asks. */
function placed(options: Record<string, unknown>): Fixture {
  return { modules: [{ region: REGION, module: 'clock', options }] };
}

const TIME = '[data-clock-time]';
const DATE = '[data-clock-date]';
// The whole clock, hours:minutes plus the seconds/meridiem siblings trailing it — the recomposed
// module renders seconds (superscript) and the meridiem (subscript) as their own elements beside
// `[data-clock-time]` rather than inside it (./README.md § The reading), so a check that needs either
// of those reads this wrapper instead of the narrower one.
const CLOCK = '[data-clock]';

test('TST051: takes the time off the host clock, asking nothing for it', async ({
  page,
  baseURL,
}) => {
  // Registered before the page loads: a listener added afterwards would miss the load's own asks,
  // and an absence measured over nothing is not an absence.
  const traffic = watchTraffic(page);
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}));

  // The value is this clock's, which is what distinguishes reading the host from reading anywhere
  // else: nothing but the controlled clock says the time is this one. A placement asking for nothing
  // takes the schema's defaults, the twelve-hour form among them, so 15:04:05 reads as 03:04:05. The
  // seconds ride as their own sibling beside `[data-clock-time]` rather than inside it, so the check
  // reads the whole clock and anchors the seconds to immediately follow the hours:minutes — the
  // separator between them, the meridiem indicator and how either is written stay presentation.
  await expect(page.locator(CLOCK)).toContainText(/03:04\D*05/);
  await page.clock.runFor(3000);
  await expect(page.locator(CLOCK)).toContainText(/03:04\D*08/);

  // The watcher saw something first. Both assertions below are absences, and an absence read over a
  // population nobody filled is not an absence: a listener attached to the wrong page, or after the
  // navigation, would leave them empty and green.
  const asked = traffic.requests.map((request) => new URL(request.url).pathname);
  expect(asked, 'the watcher saw the shell ask for its configuration').toContain('/config.json');

  // And the time was not asked for. The shell's own two asks are named rather than every request
  // being permitted, so a module ask would be left over rather than absorbed; a channel of either
  // kind counts as a way the time could have arrived even if the module then ignored what came back.
  expect(asksBeyondTheShell(traffic)).toEqual([]);
  expect(channelsBeyondTheTier(traffic, baseURL)).toEqual([]);
});

test('TST052: keeps the displayed time moving as the host clock moves', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}));
  // The whole clock, not just `[data-clock-time]`: the first advance below moves only the seconds,
  // which live in their own sibling element, so a check confined to the hours:minutes node could not
  // tell an advancing clock from a frozen one across it.
  const time = page.locator(CLOCK);

  await expect(time).toContainText(/03:04\D*05/);

  // Twice, across one loaded page. A module that reads the clock once fails the first advance and a
  // module that updates once and stops fails the second, which the two together are here to separate.
  await page.clock.runFor(5000);
  await expect(time).toContainText(/03:04\D*10/);

  await page.clock.runFor(65_000);
  await expect(time).toContainText(/03:05\D*15/);
});

test('TST053: presents the hour in the form its configuration selects', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);

  await render(page, placed({ twenty_four_hour: true }));
  const asTwentyFour = (await page.locator(TIME).innerText()).trim();
  // The meridiem sits outside `[data-clock-time]` as its own sibling, so its absence is read over
  // the whole clock rather than the hours:minutes node alone.
  const asTwentyFourClock = (await page.locator(CLOCK).innerText()).trim();

  await render(page, placed({ twenty_four_hour: false }));
  const asTwelve = (await page.locator(TIME).innerText()).trim();
  const asTwelveClock = (await page.locator(CLOCK).innerText()).trim();

  // The hour each form names, and whether a meridiem indicator is there to tell the halves of the
  // day apart - not how either is spelled. The separator, the padding and how the indicator reads
  // are presentation the item does not oblige, so asserting the whole string would red this on a
  // change the requirement permits. The host time makes the two hours distinguishable as substrings:
  // at 15:04:05 nothing but the hour reads 15, and nothing but the hour reads 3.
  expect(asTwentyFour).toContain('15');
  expect(asTwentyFourClock).not.toMatch(/[ap]\.?m\.?/i);
  expect(asTwelve).toMatch(/(^|\D)0?3(\D|$)/);
  expect(asTwelveClock).toMatch(/[ap]\.?m\.?/i);
  expect(asTwelve).not.toContain('15');

  // Both selections are driven, since a module hardcoding either form passes a check reading only
  // the other, and the two renderings are compared as the item obliges.
  expect(asTwelve).not.toBe(asTwentyFour);
});

test('TST054: shows the date when its configuration asks and omits it when it does not', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);

  await render(page, placed({ show_date: true }));
  const shown = (await page.locator(DATE).innerText()).trim();

  // The host's own date rather than merely something in the slot: a placeholder or a constant baked
  // in at build time is present too.
  for (const part of HOST_DATE_PARTS) {
    expect(shown, `the date carries ${part}`).toContain(part);
  }

  // And attributable to the host clock rather than to that first instant: move the clock to a second
  // date and the shown date follows it. A date read once against a constant transcribed from the same
  // instant passes on a build-time literal; read across a move, a literal is caught, and the date's
  // rollover is exercised in the one place that reads it.
  await page.clock.setSystemTime(SECOND_TIME);
  await page.clock.runFor(1000);
  const later = (await page.locator(DATE).innerText()).trim();
  for (const part of SECOND_DATE_PARTS) {
    expect(later, `the date follows the host to ${part}`).toContain(part);
  }
  expect(later, 'the first date is gone once the host has moved on').not.toContain('August');

  await render(page, placed({ show_date: false }));

  // Read as an absence from the clock's own region, not from the page: omission is the half a check
  // is fooled on, and the time is asserted alongside it so a clock that rendered nothing at all
  // cannot pass as one that omitted the date.
  await expect(page.locator(`[data-region="${REGION}"] ${TIME}`)).toBeVisible();
  await expect(page.locator(`[data-region="${REGION}"] ${DATE}`)).toHaveCount(0);
});

test('TST063: shows seconds when its configuration asks and omits them when it does not', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);

  // Seconds are their own sibling beside `[data-clock-time]`, so both readings are taken over the
  // whole clock rather than the hours:minutes node alone.
  await render(page, placed({ show_seconds: true }));
  const withSeconds = (await page.locator(CLOCK).innerText()).trim();

  await render(page, placed({ show_seconds: false }));
  const without = (await page.locator(`[data-region="${REGION}"] ${CLOCK}`).innerText()).trim();

  // The host's own seconds rather than a seconds-shaped field: the held clock stands at :05, and at
  // 15:04:05 nothing but the seconds reads 05. Read as a substring rather than against the whole
  // string, because the separator before them and whether they are padded are presentation the item
  // does not oblige.
  expect(withSeconds).toContain('05');

  // The absence is read on a time that is still there - the minute is asserted alongside it - since
  // a clock that stopped rendering satisfies any assertion made only about what is missing.
  expect(without).not.toContain('05');
  expect(without).toContain('04');
});

test('TST055: goes on showing an advancing time while the backend is unreachable', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}), 'frame', { healthz: 'abort' });

  // The outage is up first, or what follows would be read against a display that never staged one.
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  // The whole clock: the seconds that prove advancing live in their own sibling beside
  // `[data-clock-time]` rather than inside it.
  const time = page.locator(`[data-region="${REGION}"] ${CLOCK}`);
  await expect(time).toContainText(/03:04\D*05/);

  // Advancing rather than presence alone: a clock frozen at the moment the backend went away is the
  // failure that would otherwise read as survival.
  await page.clock.runFor(2000);
  await expect(time).toContainText(/03:04\D*07/);

  // And nothing of the module's own stands where the time was — the region carries the clock, not a
  // state it raised about an outage that is the page's to report.
  await expect(page.locator(`[data-region="${REGION}"] [data-clock]`)).toHaveCount(1);
});

/**
 * Composition, not a requirement (../README.md § It is not a requirement) — no TST cites this one,
 * since nothing in the tree obliges a line count. It stands anyway: the recompose once let a narrow
 * region squeeze the day/month/year line into two, so the date read as three lines instead of the
 * spec's two, and no behavioural check reads layout. Read via `Range.getClientRects()`, which counts
 * one rect per rendered line of an element's text, so a wrapped line is caught directly rather than
 * inferred from a height that could as easily come from a taller font.
 */
async function lineCounts(page: Page, selector: string): Promise<number[]> {
  return page.$$eval(selector, (elements) =>
    elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    }),
  );
}

test('the date holds to two lines even in the narrowest region, not a third from a wrapped one', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  // A corner region is a third the width of a centre band (../../../lib/regions.ts) and the
  // narrowest the frame lays out, so it is where the day/month/year line is most likely to be
  // squeezed narrower than its own text.
  await render(page, {
    modules: [{ region: 'top_left', module: 'clock', options: { show_date: true } }],
  });

  const lines = await lineCounts(page, `${DATE} p`);
  expect(lines, 'the weekday and the day/month/year line each render as one line, not wrapped').toEqual([
    1, 1,
  ]);
});
