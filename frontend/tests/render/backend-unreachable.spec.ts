import { expect, test, type Page } from '@playwright/test';

import { LIVENESS_INTERVAL_MS } from '../../src/lib/liveness';
import { overlaps, regionBoxes, render, serveLiveness, type Box, type Fixture } from './harness';

/**
 * TST040. A backend that stops answering under a page already serving its modules raises one
 * page-wide state rather than one per region — a module that reports its own failures stands down
 * instead of restating the outage — over a layout the state displaces rather than covers, carrying a
 * remediation distinct from the diagnosis it reports, and clearing on its own once the backend
 * answers again.
 */
const FIXTURE: Fixture = {
  modules: [
    { region: 'top_bar', module: 'fits' },
    { region: 'top_left', module: 'fits' },
    { region: 'middle_center', module: 'grouped' },
    { region: 'bottom_right', module: 'fits' },
    { region: 'bottom_bar', module: 'grouped' },
  ],
};

const REGIONS = new Set(FIXTURE.modules.map((placement) => placement.region));

/**
 * The same display carrying a module that reports for itself: `unavailable` renders its own failure
 * box while the backend answers and stands down while it does not. It is placed in a region the
 * fixture already occupies, so the count of laid-out regions is the same either way and a suppressed
 * module cannot be read as a lost region.
 */
const REPORTING: Fixture = {
  modules: [...FIXTURE.modules, { region: 'middle_center', module: 'unavailable' }],
};

/** The same fixture on a display whose outer band is behind a fitted mask. */
const BAND = 7;
const MASKED: Fixture = { edge_band: BAND, modules: FIXTURE.modules };

/** The box the page-wide state occupies, in the coordinates `regionBoxes` reads. */
async function stateBox(page: Page): Promise<Box> {
  const box = await page.locator('[data-backend-unreachable]').boundingBox();
  expect(box, 'the state is laid out').not.toBeNull();
  return { left: box!.x, top: box!.y, right: box!.x + box!.width, bottom: box!.y + box!.height };
}

test('raises one state for the page when the backend stops answering under it', async ({
  page,
}) => {
  await render(page, FIXTURE);

  // The transition the obligation names is live to dead: the page is serving its modules, with
  // nothing reported, before the backend goes.
  const state = page.locator('[data-backend-unreachable]');
  await expect(state).toHaveCount(0);
  await expect(page.locator('[data-region]')).toHaveCount(REGIONS.size);

  await serveLiveness(page, 'abort');

  await expect(state).toBeVisible({ timeout: 2 * LIVENESS_INTERVAL_MS });
  await expect(state).toHaveCount(1);
  await expect(page.locator('[data-region]')).toHaveCount(REGIONS.size);
});

test('stands a module down rather than letting it report the outage as its own', async ({
  page,
}) => {
  await render(page, REPORTING, 'frame', { healthz: 'abort' });

  // The clause is a "rather than": one report for the display, and none from the module that would
  // otherwise have drawn one. Both counts are read on the same page, since either alone is met by a
  // display that renders nothing at all.
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(1);
  await expect(page.locator('[data-stub-unavailable]')).toHaveCount(0);
  await expect(page.locator('[data-region]')).toHaveCount(REGIONS.size);
});

test('leaves the module free to report its own source while the backend answers', async ({
  page,
}) => {
  await render(page, REPORTING);

  // What makes the suppression above readable: the module does draw its box, so its absence there is
  // the page standing it down rather than a module that renders nothing whatever it is told.
  await expect(page.locator('[data-stub-unavailable]')).toBeVisible();
  await expect(page.locator('[data-backend-unreachable]')).toHaveCount(0);
  await expect(page.locator('[data-region]')).toHaveCount(REGIONS.size);
});

test('displaces the layout rather than covering any of it', async ({ page }) => {
  await render(page, FIXTURE, 'frame', { healthz: 'abort' });
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  // Counting the regions would pass over a state drawn on top of them, which is the failure SYS001
  // rules out: what is still laid out has to be still readable.
  const band = await stateBox(page);
  const laidOut = [...(await regionBoxes(page))];
  expect(laidOut).toHaveLength(REGIONS.size);
  for (const [region, box] of laidOut) {
    expect(overlaps(band, box), `the state over ${region}`).toBe(false);
  }
});

test('holds what it reports clear of the band the configuration declares', async ({ page }) => {
  await render(page, MASKED, 'frame', { healthz: 'abort' });
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const { width, height } = viewport!;
  const band = (BAND / 100) * height;

  // The band the depth declares is a mask fitted over the display, so text drawn inside it is behind
  // an object rather than dim: read on the content, since the state's own box spans the full width
  // and holds its text off the edges with padding.
  for (const hook of ['[data-diagnosis]', '[data-remediation]']) {
    const box = await page.locator(hook).boundingBox();
    expect(box, hook).not.toBeNull();
    expect(box!.x, `${hook} left`).toBeGreaterThanOrEqual(band - 0.5);
    expect(box!.y, `${hook} top`).toBeGreaterThanOrEqual(band - 0.5);
    expect(box!.x + box!.width, `${hook} right`).toBeLessThanOrEqual(width - band + 0.5);
  }
});

test('names a corrective action that is not the failure it reports', async ({ page }) => {
  await render(page, FIXTURE, 'frame', { healthz: 'abort' });
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  const diagnosis = (await page.locator('[data-diagnosis]').innerText()).trim();
  const remediation = (await page.locator('[data-remediation]').innerText()).trim();

  expect(diagnosis).not.toBe('');
  expect(remediation).not.toBe('');
  expect(remediation).not.toBe(diagnosis);
});

test('clears the state on its own once the backend answers again', async ({ page }) => {
  await render(page, FIXTURE, 'frame', { healthz: 'abort' });
  const state = page.locator('[data-backend-unreachable]');
  await expect(state).toBeVisible();

  await serveLiveness(page, 'ok');

  // Two intervals, not one: the ask that reaches the restored backend is the next one after the
  // route changes, and the route can change immediately after an ask has already gone out.
  await expect(state).toBeHidden({ timeout: 2 * LIVENESS_INTERVAL_MS });
});
