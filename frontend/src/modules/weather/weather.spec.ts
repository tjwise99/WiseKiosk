import { expect, test } from '@playwright/test';

import type { WeatherPayload } from '../../lib/boundary/client';
import {
  advanceHostClock,
  asksBeyondTheShell,
  channelsBeyondTheTier,
  holdHostClock,
  overlaps,
  render,
  serveModuleData,
  watchTraffic,
  type Box,
  type Fixture,
} from '../../../tests/render/harness';

/**
 * The weather module's render tests. Every one of them answers the module's route from the test
 * rather than letting anything reach a real source, so what is on screen is attributable to an answer
 * the case wrote. The stub answers by the parameters it is handed, which is what lets one
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

/** An instant to hold the host clock at, wherever a case drives time rather than waiting it out. */
const HOST_TIME = new Date('2026-08-31T14:00:00Z');

/**
 * An answer for one point. Every figure is a whole number, the module rounding what it draws, so a
 * case reads the value it wrote rather than the value it wrote as the module would have rounded it.
 * The three parts carry three different sky codes, so what each part drew is told apart by its own
 * content and not only by its place.
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
    hourly: Array.from({ length: 5 }, (_, index) => ({
      time: `2026-08-31T${String(14 + index).padStart(2, '0')}:00:00-04:00`,
      temp: temp + index,
      weatherCode: 61,
      precipProbability: 10 * index,
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
function temperatureAt(lat: string | null): number {
  return lat === String(HERE.lat) ? WARM : COLD;
}

/** A display carrying one weather module, reporting on `location`. */
function placed(location: { lat: number; lon: number }, region = 'middle_center'): Fixture {
  return { modules: [{ region, module: 'weather', options: { location } }] };
}

const WEATHER = '[data-weather]';
const TEMP = '[data-weather-temp]';
const PRESENT = '[data-weather-present]';
const HOURLY = '[data-weather-hourly]';
const DAILY = '[data-weather-daily]';
const LOADING = '[data-module-loading]';
const UNAVAILABLE = '[data-module-unavailable]';

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
  const served = await serveModuleData(page, () => ({ status: 200, body: forecast(WARM) }));
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
  const served = await serveModuleData(page, (asked) => ({
    status: 200,
    body: forecast(temperatureAt(asked.searchParams.get('lat'))),
  }));

  await render(page, {
    modules: [
      { region: 'middle_center', module: 'weather', options: { location: HERE } },
      { region: 'lower_third', module: 'weather', options: { location: THERE } },
    ],
  });

  // The configured point reached the request. Read off the URLs the stub was handed, because that is
  // the only place the location appears on the wire — `asksBeyondTheShell` keeps paths alone.
  const asked = served.urls.join(' ');
  expect(asked, 'the first point was asked for').toContain(`lat=${HERE.lat}`);
  expect(asked, 'its longitude went with it').toContain(`lon=${HERE.lon}`);
  expect(asked, 'the second point was asked for').toContain(`lat=${THERE.lat}`);
  expect(asked, 'its longitude went with it').toContain(`lon=${THERE.lon}`);

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
  await serveModuleData(page, () => ({ status: 200, body: forecast(WARM) }));
  await render(page, placed(HERE));

  const present = page.locator(PRESENT);
  const hourly = page.locator(HOURLY);
  const daily = page.locator(DAILY);

  // All three are drawn. Asserting the parts are separable means nothing if one of them is missing.
  await expect(present).toBeVisible();
  await expect(hourly).toBeVisible();
  await expect(daily).toBeVisible();

  // Each carries its own content rather than the same content three times: the three parts were
  // written with three different sky codes, and each entry list holds the entries the answer had.
  await expect(present).toContainText('Clear');
  await expect(hourly).toContainText('Rain');
  await expect(daily).toContainText('Snow');
  await expect(page.locator('[data-weather-hour]')).toHaveCount(5);
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
});

test('TST061: follows its source to a new reading inside the freshness bound, without reloading', async ({
  page,
}) => {
  await holdHostClock(page, HOST_TIME);
  await serveModuleData(page, () => ({ status: 200, body: forecast(WARM) }));
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
    body: forecast(COLD),
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
  const whileServing = await serveModuleData(page, () => ({ status: 200, body: forecast(WARM) }));
  await render(page, placed(HERE));
  await expect(page.locator(WEATHER)).toBeVisible();
  const askedOnce = whileServing.urls.length;
  expect(askedOnce, 'it asked while the backend was serving').toBeGreaterThan(0);
  await advanceHostClock(page, READ_INTERVAL_MS);
  await expect
    .poll(() => whileServing.urls.length, { message: 'it keeps polling while the backend serves' })
    .toBeGreaterThan(askedOnce);

  const whileGone = await serveModuleData(page, () => ({ status: 200, body: forecast(WARM) }));
  await render(page, placed(HERE), 'frame', { healthz: 'abort' });

  // The outage is up first, or what follows would be read against a display that never staged one.
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  // Nothing of the module's own stands in its region — not its content, not an unavailable box of
  // its own, not the state it was waiting in. The page carries the one report (SRS026).
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

test('shows that it is reading while its route has not answered yet', async ({ page }) => {
  // The one case `serveModuleData` cannot drive: every answer it gives is an answer, and this state
  // is what is on screen before there is one. The route is taken and never fulfilled, which is the
  // ask-in-flight the module first paints against.
  await page.route('**/api/*', () => {});
  await render(page, placed(HERE));

  // Drawn, and drawn where the module is: a region left blank is indistinguishable from a broken one
  // on a display nobody is standing at.
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
    body: { module: 'weather', cause: 'upstream_unavailable', message: REASON },
  }));
  await render(page, placed(HERE));

  // The route's own words, in the module's own region (SRS001) — not a message this module composed,
  // which is what reading the served body back proves.
  const box = page.locator(`[data-region="middle_center"] ${UNAVAILABLE}`);
  await expect(box).toBeVisible();
  await expect(box).toContainText(REASON);

  // Beside the presence above: the failure replaced the reading rather than sitting under it, and
  // the page raised no outage report, this being one module's failure and not the backend's.
  await expect(page.locator(TEMP)).toHaveCount(0);
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(0);
});

test('says something in the module’s place when the answer carries no reason it can read', async ({
  page,
}) => {
  // A status the boundary schema does not describe, which something standing between the page and
  // the route can still produce, carrying a body with no message in it. The shell has no reason to
  // render and must not draw an empty box: on an unattended display a box with nothing in it is
  // indistinguishable from a broken one.
  await serveModuleData(page, () => ({ status: 500, body: { detail: 'gateway exploded' } }));
  await render(page, placed(HERE));

  const box = page.locator(`[data-region="middle_center"] ${UNAVAILABLE}`);
  await expect(box).toBeVisible();
  await expect(box).not.toBeEmpty();

  // And it is not the body's own words dressed up as a reason — the body carried none, so nothing
  // from it should reach the screen.
  await expect(box).not.toContainText('gateway exploded');
  await expect(page.locator(TEMP)).toHaveCount(0);
});
