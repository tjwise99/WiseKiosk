import { expect, test } from '@playwright/test';

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

const REGION = 'middle_center';

/** A display carrying one clock, configured as the case under test asks. */
function placed(options: Record<string, unknown>): Fixture {
  return { modules: [{ region: REGION, module: 'clock', options }] };
}

const TIME = '[data-clock-time]';
const DATE = '[data-clock-date]';

test('TST051: takes the time off the host clock, asking nothing for it', async ({ page }) => {
  // Registered before the page loads: a listener added afterwards would miss the load's own asks,
  // and an absence measured over nothing is not an absence.
  const traffic = watchTraffic(page);
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}));

  // The value is this clock's, which is what distinguishes reading the host from reading anywhere
  // else: nothing but the controlled clock says the time is this one.
  await expect(page.locator(TIME)).toHaveText('15:04:05');
  await page.clock.runFor(3000);
  await expect(page.locator(TIME)).toHaveText('15:04:08');

  // And it was not asked for. The shell's own two asks are named rather than every request being
  // permitted, so a module ask would be left over rather than absorbed; a channel of either kind
  // counts as a way the time could have arrived even if the module then ignored what came back.
  expect(asksBeyondTheShell(traffic)).toEqual([]);
  expect(channelsBeyondTheTier(traffic)).toEqual([]);
});

test('TST052: keeps the displayed time moving as the host clock moves', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}));
  const time = page.locator(TIME);

  await expect(time).toHaveText('15:04:05');

  // Twice, across one loaded page. A module that reads the clock once fails the first advance and a
  // module that updates once and stops fails the second, which the two together are here to separate.
  await page.clock.runFor(5000);
  await expect(time).toHaveText('15:04:10');

  await page.clock.runFor(65_000);
  await expect(time).toHaveText('15:05:15');
});

test('TST053: presents the hour in the form its configuration selects', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);

  await render(page, placed({ twenty_four_hour: true }));
  const asTwentyFour = (await page.locator(TIME).innerText()).trim();

  await render(page, placed({ twenty_four_hour: false }));
  const asTwelve = (await page.locator(TIME).innerText()).trim();

  // Both selections are driven, since a module hardcoding either form passes a check that reads only
  // the other; and the hour itself is read rather than the label, so a rendering that varies the
  // indicator without varying the hour fails.
  expect(asTwentyFour).toMatch(/^15:04:05$/);
  expect(asTwelve).toMatch(/^03:04:05\s*PM$/);
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

  await render(page, placed({ show_seconds: true }));

  // The host's seconds, not merely a seconds-shaped field: the controlled clock stands at :05.
  await expect(page.locator(TIME)).toHaveText('15:04:05');

  await render(page, placed({ show_seconds: false }));

  // The absence is read on the time itself — a time still shown, with no seconds in it — since a
  // clock that stopped rendering would satisfy any assertion made only about what is missing.
  await expect(page.locator(`[data-region="${REGION}"] ${TIME}`)).toHaveText('15:04');
});

test('TST055: goes on showing an advancing time while the backend is unreachable', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await render(page, placed({}), 'frame', { healthz: 'abort' });

  // The outage is up first, or what follows would be read against a display that never staged one.
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  const time = page.locator(`[data-region="${REGION}"] ${TIME}`);
  await expect(time).toHaveText('15:04:05');

  // Advancing rather than presence alone: a clock frozen at the moment the backend went away is the
  // failure that would otherwise read as survival.
  await page.clock.runFor(2000);
  await expect(time).toHaveText('15:04:07');

  // And nothing of the module's own stands where the time was — the region carries the clock, not a
  // state it raised about an outage that is the page's to report.
  await expect(page.locator(`[data-region="${REGION}"] [data-clock]`)).toHaveCount(1);
});
