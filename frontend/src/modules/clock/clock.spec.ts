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
  // takes the schema's defaults, the twelve-hour form among them, so 15:04:05 reads as 03:04:05; the
  // digits are asserted as a substring, the meridiem indicator and its separator being presentation.
  await expect(page.locator(TIME)).toContainText('03:04:05');
  await page.clock.runFor(3000);
  await expect(page.locator(TIME)).toContainText('03:04:08');

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
  const time = page.locator(TIME);

  await expect(time).toContainText('03:04:05');

  // Twice, across one loaded page. A module that reads the clock once fails the first advance and a
  // module that updates once and stops fails the second, which the two together are here to separate.
  await page.clock.runFor(5000);
  await expect(time).toContainText('03:04:10');

  await page.clock.runFor(65_000);
  await expect(time).toContainText('03:05:15');
});

test('TST053: presents the hour in the form its configuration selects', async ({ page }) => {
  await holdHostClock(page, HOST_TIME);

  await render(page, placed({ twenty_four_hour: true }));
  const asTwentyFour = (await page.locator(TIME).innerText()).trim();

  await render(page, placed({ twenty_four_hour: false }));
  const asTwelve = (await page.locator(TIME).innerText()).trim();

  // The hour each form names, and whether a meridiem indicator is there to tell the halves of the
  // day apart - not how either is spelled. The separator, the padding and how the indicator reads
  // are presentation the item does not oblige, so asserting the whole string would red this on a
  // change the requirement permits. The host time makes the two hours distinguishable as substrings:
  // at 15:04:05 nothing but the hour reads 15, and nothing but the hour reads 3.
  expect(asTwentyFour).toContain('15');
  expect(asTwentyFour).not.toMatch(/[ap]\.?m\.?/i);
  expect(asTwelve).toMatch(/(^|\D)0?3(\D|$)/);
  expect(asTwelve).toMatch(/[ap]\.?m\.?/i);
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
  const withSeconds = (await page.locator(TIME).innerText()).trim();

  await render(page, placed({ show_seconds: false }));
  const without = (await page.locator(`[data-region="${REGION}"] ${TIME}`).innerText()).trim();

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

  const time = page.locator(`[data-region="${REGION}"] ${TIME}`);
  await expect(time).toContainText('03:04:05');

  // Advancing rather than presence alone: a clock frozen at the moment the backend went away is the
  // failure that would otherwise read as survival.
  await page.clock.runFor(2000);
  await expect(time).toContainText('03:04:07');

  // And nothing of the module's own stands where the time was — the region carries the clock, not a
  // state it raised about an outage that is the page's to report.
  await expect(page.locator(`[data-region="${REGION}"] [data-clock]`)).toHaveCount(1);
});
