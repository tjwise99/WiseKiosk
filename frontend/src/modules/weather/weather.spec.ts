import { expect, test } from '@playwright/test';

import type { WeatherPayload, WeatherRequest } from '../../lib/boundary/client';
import { LIVENESS_INTERVAL_MS } from '../../lib/liveness';
import {
  advanceHostClock,
  asksBeyondTheShell,
  channelsBeyondTheTier,
  holdHostClock,
  overlaps,
  render,
  serveLiveness,
  serveModuleData,
  watchTraffic,
  type Box,
  type Fixture,
} from '../../../tests/render/harness';

/**
 * The weather module's render tests. Every one of them answers the module's route from the test
 * rather than letting anything reach a real source, so what is on screen is attributable to an answer
 * the case wrote. The stub answers by the request body it is handed, which is what lets one
 * registration serve two placements reporting on two different points.
 */

/** Two points far enough apart that the readings drawn for them cannot be confused. */
const HERE = { lat: 42.36, lon: -71.06 };
const THERE = { lat: 51.5, lon: -0.12 };

/** The temperature each point's answer carries, keyed off its latitude by the stub below. */
const WARM = 71;
const COLD = 58;

const READ_INTERVAL_MS = 5 * 60 * 1000;

/** The last stretch of that interval, held back so the read can be shown to fall inside it. */
const ALMOST = 10_000;

/** The same, at the scale the series-switch cases advance the clock by. */
const SWITCH_ALMOST = 500;

/** A present-weather code outside the set WMO 4677 defines, so nothing can be said of the sky. */
const UNREADABLE = 42;

/** An instant to hold the host clock at, wherever a case drives time rather than waiting it out. */
const HOST_TIME = new Date('2026-08-31T14:00:00Z');

/** The ISO-8601 timestamp for the `index`th hour after 2026-08-31T14:00, at the fixture's own
    -04:00 offset. Built from a plain `Date`'s own day/month rollover rather than written out by
    hand, so a twelve-hour run crossing midnight is not twelve hand-typed strings to keep straight. */
function hourTime(index: number): string {
  const at = new Date(2026, 7, 31, 14 + index);
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const h = String(at.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00-04:00`;
}

/**
 * An answer for one point. Every figure is a whole number, the module rounding what it draws, so a
 * case reads the value it wrote rather than the value it wrote as the module would have rounded it.
 * The three parts carry three different sky codes, so what each part drew is told apart by its own
 * content and not only by its place. The hourly range runs to twelve so a case can read the whole of
 * what the module draws rather than a shorter stand-in for it.
 */
function forecast(temp: number): WeatherPayload {
  return {
    current: {
      temp,
      apparentTemp: temp - 3,
      humidity: 55,
      windSpeed: 9,
      weatherCode: 0,
      isDay: true,
    },
    hourly: Array.from({ length: 12 }, (_, index) => ({
      time: hourTime(index),
      temp: temp + index,
      weatherCode: 61,
      precipProbability: 5 * index,
      isDay: true,
    })),
    daily: Array.from({ length: 5 }, (_, index) => ({
      time: `2026-09-0${index + 1}T00:00:00-04:00`,
      weatherCode: 71,
      max: temp + 20 + index,
      min: temp - 20 - index,
      precipProbability: 5 * index,
    })),
  };
}

/** The temperature a point is answered with: the two configured points, told apart by latitude. */
function temperatureAt(asked: unknown): number {
  return (asked as WeatherRequest | null)?.lat === HERE.lat ? WARM : COLD;
}

/** A display carrying one weather module, reporting on `location`. */
function placed(location: { lat: number; lon: number }, region = 'middle_center'): Fixture {
  return { modules: [{ region, module: 'weather', options: { location } }] };
}

/** The same, with the switch interval set explicitly rather than left to the module's own default. */
function placedWithSwitch(
  location: { lat: number; lon: number },
  seconds: number,
  region = 'middle_center',
): Fixture {
  return { modules: [{ region, module: 'weather', options: { location, series_switch_seconds: seconds } }] };
}

const WEATHER = '[data-weather]';
const TEMP = '[data-weather-temp]';
const PRESENT = '[data-weather-present]';
const HOURLY = '[data-weather-hourly]';
const DAILY = '[data-weather-daily]';
const LOADING = '[data-module-loading]';
const UNAVAILABLE = '[data-module-unavailable]';
const GLYPH = '[data-weather-glyph]';
const SERIES = '[data-weather-series]';

/**
 * The marks the cases below read for, written out here rather than imported from the component: a
 * case taking its expectation from the map it is checking asserts the map against itself and passes
 * whatever the map says. Codepoints are the icon face's own.
 */
const GLYPHS = {
  /** Code 0, the two sides of the day: a sun, and a full moon. */
  clearDay: '\uF00D',
  clearNight: '\uF02E',
  /** Code 61, whose two sides differ. */
  rainDay: '\uF008',
  rainNight: '\uF028',
  /** Code 3, one of the seven carrying one mark for both sides. */
  overcast: '\uF013',
  /** What is drawn for a code the map does not carry. */
  unread: '\uF07B',
};

/** The box the browser gave one element, which every case below asserts is there before reading it. */
async function boxOf(page: import('@playwright/test').Page, selector: string): Promise<Box> {
  const measured = await page.locator(selector).boundingBox();
  expect(measured, `${selector} is laid out`).not.toBeNull();
  const { x, y, width, height } = measured!;
  return { left: x, top: y, right: x + width, bottom: y + height };
}

test('TST056: draws the weather its own route answered with, and reads no other source', async ({
  page,
  baseURL,
}) => {
  // Registered before the page loads: a listener added afterwards would miss the load's own asks,
  // and an absence measured over nothing is not an absence.
  const traffic = watchTraffic(page);
  const served = await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));

  // The value is the one this route answered with, which is what makes it the route's rather than
  // anything the module could have carried in its own bundle.
  await expect(page.locator(TEMP)).toContainText(String(WARM));

  // The stub was reached at all, so the absences below are read over a population something filled.
  // How many times is not this case's claim and is deliberately not asserted: the shell's liveness
  // ask carries its own real-time deadline, and a loaded machine can miss it, which stands the module
  // down and back up again and costs a second read. What that read is for is TST061's.
  expect(served.urls.length, 'the module asked its own route').toBeGreaterThan(0);

  // And nothing else was asked. The shell's own two asks are named rather than every request being
  // permitted, so a second source would be left over rather than absorbed; a channel of either kind
  // counts as a way a reading could have arrived even if the module then ignored what came back.
  expect([...new Set(asksBeyondTheShell(traffic))]).toEqual(['/api/weather']);
  expect(channelsBeyondTheTier(traffic, baseURL)).toEqual([]);
});

test('TST057: reports on the point its configuration names, in the region it names', async ({
  page,
}) => {
  // One stub, two placements: the answer is a function of the ask, so the two points are told apart
  // by what each request carried rather than by the order the module happened to ask in.
  const served = await serveModuleData(page, (_asked, body) => ({
    status: 200,
    data: forecast(temperatureAt(body)),
  }));

  await render(page, {
    modules: [
      { region: 'middle_center', module: 'weather', options: { location: HERE } },
      { region: 'lower_third', module: 'weather', options: { location: THERE } },
    ],
  });

  // The configured point reached the request. Read off the bodies the stub was handed, because that
  // is the only place the location appears on the wire — the route's path names no point. Asserted
  // as a pair rather than a value at a time, so two placements cannot pass by contributing one
  // coordinate each.
  expect(served.bodies, 'the first point was asked for whole').toContainEqual(HERE);
  expect(served.bodies, 'the second point was asked for whole').toContainEqual(THERE);

  // And it reached the region: each region carries the reading for the point that region's own
  // placement named. Driving both placements is what separates this from a module that asks for one
  // point and draws the same answer everywhere.
  const here = page.locator(`[data-region="middle_center"] ${TEMP}`);
  const there = page.locator(`[data-region="lower_third"] ${TEMP}`);
  await expect(here).toContainText(String(WARM));
  await expect(there).toContainText(String(COLD));

  // Read as an absence beside the presence above: the two regions carry different readings rather
  // than one reading drawn twice.
  await expect(here).not.toContainText(String(COLD));
  await expect(there).not.toContainText(String(WARM));
});

test('TST060: draws what it is doing now, the hours to come and the days to come, each separably', async ({
  page,
}) => {
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));

  const present = page.locator(PRESENT);
  const hourly = page.locator(HOURLY);
  const daily = page.locator(DAILY);

  // All three are drawn. Asserting the parts are separable means nothing if one of them is missing.
  await expect(present).toBeVisible();
  await expect(hourly).toBeVisible();
  await expect(daily).toBeVisible();

  // Each carries its own content rather than the same content three times. The present block is the
  // one place its stat cards are drawn; the hours are the one place a relative `+1` hour label
  // appears; the days carry the daily high/low, an answer-given figure neither of the other two
  // carries.
  await expect(present).toContainText('Feels like');
  await expect(hourly).toContainText('+1');
  await expect(daily).toContainText(`${WARM + 24}°/${WARM - 24}°`);
  await expect(page.locator('[data-weather-hour]')).toHaveCount(12);
  await expect(page.locator('[data-weather-day]')).toHaveCount(5);

  // And each is drawn apart from the others rather than the three running together into one block —
  // read off the boxes the browser gave them, so a part nested inside another is caught.
  const boxes = {
    present: await boxOf(page, PRESENT),
    hourly: await boxOf(page, HOURLY),
    daily: await boxOf(page, DAILY),
  };
  expect(overlaps(boxes.present, boxes.hourly), 'the present and the hours are drawn apart').toBe(
    false,
  );
  expect(overlaps(boxes.hourly, boxes.daily), 'the hours and the days are drawn apart').toBe(false);
  expect(overlaps(boxes.present, boxes.daily), 'the present and the days are drawn apart').toBe(
    false,
  );

  // The curve is dot-vertexed, one dot per hour shown.
  await expect(page.locator('[data-weather-vertex]')).toHaveCount(12);

  // The hours are labelled relative to now rather than by clock time, one label per vertex, in order.
  await expect(page.locator('[data-weather-xaxis-tick]')).toHaveText(
    Array.from({ length: 12 }, (_, index) => `+${index + 1}`),
  );

  // The curve reads against a y-axis scale rather than floating a label at each vertex — a fixed
  // five ticks over four equal bands regardless of the active series or its own range, so the axis
  // reads the same shape every render rather than the tick count shifting with the data.
  await expect(page.locator('[data-weather-yaxis-tick]')).toHaveCount(5);
});

test('TST067: shows the temperature expected for each hour and each day of the outlook', async ({
  page,
}) => {
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));

  // Days: each card carries its own high/low, asserted for all five so a card silently dropping its
  // own reading is caught rather than just the one a single sample would happen to catch.
  const days = page.locator('[data-weather-day]');
  await expect(days).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await expect(days.nth(index).locator('.daily-reading').first()).toHaveText(
      `${WARM + 20 + index}°/${WARM - 20 - index}°`,
    );
  }

  // Hours: the curve opens on the temperature series (`active` starts there), so its y-axis brackets
  // the fixture's own hourly temperature range end to end — the bottom and top ticks are read off
  // the data rather than fixed, so a component drawing a constant or a dropped series would bracket a
  // span other than the one the fixture actually carries.
  await expect(page.locator(SERIES)).toHaveText('Temperature');
  const ticks = await page.locator('[data-weather-yaxis-tick]').allTextContents();
  expect(ticks[0], 'the bottom tick reads the lowest hourly temperature').toBe(`${WARM}°`);
  expect(ticks[ticks.length - 1], 'the top tick reads the highest hourly temperature').toBe(
    `${WARM + 11}°`,
  );
});

test('TST068: shows the chance of precipitation expected for each hour and each day of the outlook', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placedWithSwitch(HERE, 2));

  // Days: each card carries its own precipitation figure alongside its high/low, both drawn together
  // rather than toggled — asserted for all five.
  const days = page.locator('[data-weather-day]');
  for (let index = 0; index < 5; index++) {
    await expect(days.nth(index).locator('.daily-reading').nth(1)).toHaveText(`${5 * index}%`);
  }

  // Hours: switch the curve to its precipitation half and read the same bracket proof TST067 reads
  // for temperature — the fixture's own hourly range, 0% to 55%.
  await advanceHostClock(page, 2 * 1000);
  await expect(page.locator(SERIES)).toHaveText('Precipitation');
  const ticks = await page.locator('[data-weather-yaxis-tick]').allTextContents();
  expect(ticks[0], 'the bottom tick reads the lowest hourly precipitation chance').toBe('0%');
  expect(ticks[ticks.length - 1], 'the top tick reads the highest hourly precipitation chance').toBe(
    '55%',
  );
});

test('TST069: draws one forecast measure at a time for the hours next to come, switching on its configured interval', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placedWithSwitch(HERE, 4));

  const series = page.locator(SERIES);
  const curveArea = () => boxOf(page, '.curve-area');

  // Exactly one series is ever drawn — the toggle is one element carrying which, not two drawn
  // together.
  await expect(series).toHaveCount(1);
  await expect(series).toHaveText('Temperature');
  const before = await curveArea();

  // Not yet — a step short of the configured interval finds the same series still current.
  await advanceHostClock(page, 4 * 1000 - SWITCH_ALMOST);
  await expect(series).toHaveText('Temperature');

  // The interval elapses, and the series flips — without moving the plot it is drawn in.
  await advanceHostClock(page, SWITCH_ALMOST);
  await expect(series).toHaveText('Precipitation');
  expect(await curveArea(), 'the plot does not move when the series switches').toEqual(before);

  // And back, at the same interval — the flip is a repeating alternation, not a one-time change.
  await advanceHostClock(page, 4 * 1000);
  await expect(series).toHaveText('Temperature');
});

test('TST069: the series-switch interval is the configuration’s and not one fixed in the module', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placedWithSwitch(HERE, 20));

  const series = page.locator(SERIES);
  await expect(series).toHaveText('Temperature');

  // A shorter interval than the one configured here does not flip a module configured for twenty
  // seconds, proving the interval read is the configuration's rather than a value fixed in the
  // component.
  await advanceHostClock(page, 4 * 1000);
  await expect(series).toHaveText('Temperature');

  await advanceHostClock(page, 20 * 1000 - 4 * 1000);
  await expect(series).toHaveText('Precipitation');
});

test('TST061: follows its source to a new reading inside the freshness bound, without reloading', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));

  const temp = page.locator(TEMP);
  await expect(temp).toContainText(String(WARM));

  // A mark on the page that a reload would clear, so the change below is attributable to the module
  // re-reading rather than to the display having started over.
  await page.evaluate(() => {
    (window as unknown as { standing?: boolean }).standing = true;
  });

  // The source now says something else. Playwright matches most-recently-registered first, so this
  // is what a later poll is answered with.
  const afterTheChange = await serveModuleData(page, () => ({
    status: 200,
    data: forecast(COLD),
  }));

  // Advanced by the module's own read interval rather than waited out in real seconds. The interval
  // is spelled here as well as in the component, so it is pinned from both sides rather than left as
  // two copies agreeing by comment: stopping just short of it must find nothing asked, and only the
  // remainder brings the ask. A component that read faster than this fails the first, and one that
  // read slower fails the second.
  await advanceHostClock(page, READ_INTERVAL_MS - ALMOST);
  expect(afterTheChange.urls, 'it had not asked again before its interval was up').toEqual([]);
  await advanceHostClock(page, ALMOST);

  // The reading is read across the change: a module that draws whatever it was first handed passes
  // an assertion made only about the second value if that value was on screen all along.
  await expect(temp).toContainText(String(COLD));
  await expect(temp, 'the reading it opened with is gone').not.toContainText(String(WARM));

  // And the new reading arrived by the module asking again. Without this the case passes on any
  // route by which the module happens to re-read — remounting among them — so it would stay green
  // with the poll removed altogether, which is the one thing it exists to catch.
  expect(afterTheChange.urls, 'the reading was asked for again').toHaveLength(1);

  expect(
    await page.evaluate(() => (window as unknown as { standing?: boolean }).standing),
    'the page never reloaded',
  ).toBe(true);
});

test('stands down to nothing while the backend is unreachable, and stops asking it', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);

  // The control first: the same fixture, against a backend that is serving, draws the module and
  // goes on polling. Without it the suppression below reads the same as a module that never worked,
  // and the silence below reads the same as a module that never asked.
  const whileServing = await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));
  await expect(page.locator(WEATHER)).toBeVisible();
  const askedOnce = whileServing.urls.length;
  expect(askedOnce, 'it asked while the backend was serving').toBeGreaterThan(0);
  await advanceHostClock(page, READ_INTERVAL_MS);
  await expect
    .poll(() => whileServing.urls.length, { message: 'it keeps polling while the backend serves' })
    .toBeGreaterThan(askedOnce);

  const whileGone = await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE), 'frame', { healthz: 'abort' });

  // The outage is up first, or what follows would be read against a display that never staged one.
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  // Nothing of the module's own stands in its region — not its content, not an unavailable box of
  // its own, not the state it was waiting in. The page carries the one report
  // (SRS026<!-- The display says when the backend is gone -->).
  await expect(page.locator(`[data-region="middle_center"] ${WEATHER}`)).toHaveCount(0);
  await expect(page.locator(UNAVAILABLE)).toHaveCount(0);
  await expect(page.locator(LOADING)).toHaveCount(0);

  // And the polling stopped. It is asked once on the way: the shell opens assuming the backend is
  // serving and only then reads liveness, so a module mounts before the outage is known and that
  // first ask is the shell's timing rather than this module's. What the stand-down owes is that no
  // further ask follows — a module keeping its timer would go on asking a backend that is gone for
  // as long as the display runs, which the control above shows this one would otherwise do.
  const askedBeforeTheOutageWasKnown = whileGone.urls.length;
  await advanceHostClock(page, READ_INTERVAL_MS * 2);
  expect(whileGone.urls.length, 'it asked nothing further once the backend was gone').toBe(
    askedBeforeTheOutageWasKnown,
  );
});

test('does not draw its reading from before an outage as current after one', async ({ page }) => {
  await serveModuleData(page, () => ({ status: 200, data: forecast(WARM) }));
  await render(page, placed(HERE));
  await expect(page.locator(TEMP)).toContainText(String(WARM));

  await serveLiveness(page, 'abort');
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(1, {
    timeout: 2 * LIVENESS_INTERVAL_MS,
  });

  // The route is taken and never fulfilled from here on, so the read that follows recovery is in
  // flight for the whole of what is asserted below. Registered while the outage is up, because
  // Playwright matches most-recently-registered first and this must win over the answering stub.
  await page.route('**/api/*', () => {});

  await serveLiveness(page, 'ok');

  // The module is drawn again, and what it draws is the state of having nothing rather than the
  // reading it held before the outage. A held payload survives the stand-down otherwise, and the
  // window between the backend answering and the first read landing shows old weather as now
  // (SRS046<!-- The weather a viewer sees is no more than fifteen minutes behind its source -->).
  const loading = page.locator(`[data-region="middle_center"] ${LOADING}`);
  await expect(loading).toBeVisible({ timeout: 2 * LIVENESS_INTERVAL_MS });
  await expect(page.locator(TEMP)).toHaveCount(0);
  await expect(page.locator(UNAVAILABLE)).toHaveCount(0);
});

test('shows that it is reading while its route has not answered yet', async ({ page }) => {
  // The one case `serveModuleData` cannot drive: every answer it gives is an answer, and this state
  // is what is on screen before there is one. The route is taken and never fulfilled, which is the
  // ask-in-flight the module first paints against.
  await page.route('**/api/*', () => {});
  await render(page, placed(HERE));

  // Drawn, and drawn where the module is.
  const loading = page.locator(`[data-region="middle_center"] ${LOADING}`);
  await expect(loading).toBeVisible();
  await expect(loading).not.toBeEmpty();

  // And it is the waiting state rather than either settled one — read beside the presence above, so
  // a module that rendered nothing at all cannot pass as one that is waiting.
  await expect(page.locator(TEMP)).toHaveCount(0);
  await expect(page.locator(UNAVAILABLE)).toHaveCount(0);
});

test('renders why its own source failed, in its own place, while the backend is reachable', async ({
  page,
}) => {
  const REASON = 'The weather source did not answer.';
  await serveModuleData(page, () => ({
    status: 502,
    data: { module: 'weather', cause: 'upstream_unavailable', message: REASON },
  }));
  await render(page, placed(HERE));

  // The route's own words, in the module's own region
  // (SRS001<!-- A failed module shows why, and only that module -->) — not a message this module
  // composed, which is what reading the served body back proves.
  const box = page.locator(`[data-region="middle_center"] ${UNAVAILABLE}`);
  await expect(box).toBeVisible();
  await expect(box).toContainText(REASON);

  // Beside the presence above: the failure replaced the reading rather than sitting under it, and
  // the page raised no outage report, this being one module's failure and not the backend's.
  await expect(page.locator(TEMP)).toHaveCount(0);
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(0);
});

/** The same answer, with the present reading and each hour set to the sides of the day given. */
function withDaylight(
  temp: number,
  current: { code: number; isDay: boolean },
  hours: { code: number; isDay: boolean }[],
): WeatherPayload {
  const base = forecast(temp);
  return {
    ...base,
    current: { ...base.current, weatherCode: current.code, isDay: current.isDay },
    hourly: base.hourly.map((hour, index) => ({
      ...hour,
      weatherCode: hours[index]!.code,
      isDay: hours[index]!.isDay,
    })),
  };
}

/** Twelve hours of one code and one side of the day, for a case reading the present reading alone. */
function everyHour(code: number, isDay: boolean): { code: number; isDay: boolean }[] {
  return Array.from({ length: 12 }, () => ({ code, isDay }));
}

test('TST065: draws the present reading on the side of the day the payload gives it', async ({ page }) => {
  // The two payloads differ in the flag alone — same code, same figures — so whatever moves between
  // them is the distinction's and nothing else's.
  await serveModuleData(page, () => ({
    status: 200,
    data: withDaylight(WARM, { code: 0, isDay: true }, everyHour(0, true)),
  }));
  await render(page, placed(HERE));

  const present = page.locator(`${PRESENT} ${GLYPH}`);
  await expect(present).toHaveText(GLYPHS.clearDay);

  await serveModuleData(page, () => ({
    status: 200,
    data: withDaylight(WARM, { code: 0, isDay: false }, everyHour(0, false)),
  }));
  await render(page, placed(HERE));

  // Read beside the day mark above: a component drawing one constant mark passes an assertion made
  // about the night one only if the day one was never asserted.
  await expect(present).toHaveText(GLYPHS.clearNight);
});

test('TST065: draws each hour on its own side of the day, not the present reading’s', async ({ page }) => {
  // A day reading with the night falling across the hours to come — the case the present reading's
  // own flag cannot answer, and the case a component reading the page's clock gets wrong wherever
  // the display does not hang at the place reported on.
  await serveModuleData(page, () => ({
    status: 200,
    data: withDaylight(WARM, { code: 0, isDay: true }, [
      { code: 61, isDay: true },
      { code: 61, isDay: true },
      { code: 61, isDay: true },
      { code: 61, isDay: true },
      { code: 61, isDay: true },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
      { code: 61, isDay: false },
    ]),
  }));
  await render(page, placed(HERE));

  await expect(page.locator(`${PRESENT} ${GLYPH}`)).toHaveText(GLYPHS.clearDay);
  await expect(page.locator(`${HOURLY} ${GLYPH}`)).toHaveText([
    GLYPHS.rainDay,
    GLYPHS.rainDay,
    GLYPHS.rainDay,
    GLYPHS.rainDay,
    GLYPHS.rainDay,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
    GLYPHS.rainNight,
  ]);
});

test('draws one mark for both sides of the day where the code carries one', async ({ page }) => {
  // Seven codes share a mark between day and night. Asserted on both sides rather than one, because
  // a component that ignored the flag entirely would pass either half alone.
  for (const isDay of [true, false]) {
    await serveModuleData(page, () => ({
      status: 200,
      data: withDaylight(WARM, { code: 3, isDay }, everyHour(3, isDay)),
    }));
    await render(page, placed(HERE));

    await expect(page.locator(`${PRESENT} ${GLYPH}`)).toHaveText(GLYPHS.overcast);
    await expect(page.locator(`${HOURLY} ${GLYPH}`).first()).toHaveText(GLYPHS.overcast);
  }
});

test('draws the not-available mark for a code it has no mark for', async ({ page }) => {
  // Fails closed on both sides of the day: an unrecognised code has no day form and no night form,
  // so neither flag may produce a mark that names a condition.
  for (const isDay of [true, false]) {
    await serveModuleData(page, () => ({
      status: 200,
      data: withDaylight(WARM, { code: UNREADABLE, isDay }, everyHour(UNREADABLE, isDay)),
    }));
    await render(page, placed(HERE));

    await expect(page.locator(`${PRESENT} ${GLYPH}`)).toHaveText(GLYPHS.unread);
    await expect(page.locator(`${HOURLY} ${GLYPH}`).first()).toHaveText(GLYPHS.unread);
  }
});

test('says something in the module’s place when the answer carries no reason it can read', async ({
  page,
}) => {
  // A status the boundary schema does not describe, which something standing between the page and
  // the route can still produce, carrying a body with no message in it. The shell has no reason to
  // render and must not draw an empty box
  // (SRS001<!-- A failed module shows why, and only that module -->).
  await serveModuleData(page, () => ({ status: 500, data: { detail: 'gateway exploded' } }));
  await render(page, placed(HERE));

  const box = page.locator(`[data-region="middle_center"] ${UNAVAILABLE}`);
  await expect(box).toBeVisible();
  await expect(box).not.toBeEmpty();

  // And it is not the body's own words dressed up as a reason — the body carried none, so nothing
  // from it should reach the screen.
  await expect(box).not.toContainText('gateway exploded');
  await expect(page.locator(TEMP)).toHaveCount(0);
});
