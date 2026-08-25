import { expect, test } from '@playwright/test';

import { LIVENESS_INTERVAL_MS } from '../../src/lib/liveness';
import { regionBoxes, render, serveLiveness, type Fixture } from './harness';

/**
 * TST040. A backend that stops answering under a page already serving its modules raises one
 * page-wide state rather than one per region — a module that reports its own failures stands down
 * instead of restating the outage — carrying a remediation distinct from the diagnosis it reports.
 *
 * The band clearance every laid-out region holds while that state is up is TST049's (SRS034); it is
 * read here because it needs this file's outage harness.
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
  await render(page, REPORTING);
  const report = page.locator('[data-backend-unreachable]');
  const stub = page.locator('[data-stub-unavailable]');

  // One page carried across the transition rather than two page loads: the module draws its own box
  // while the backend answers, so its absence afterwards is the page standing it down.
  await expect(stub).toBeVisible();

  await serveLiveness(page, 'abort');

  // The clause is a "rather than": one report for the display, and none from the module that would
  // otherwise have drawn one. Both counts are read on the same page, since either alone is met by a
  // display that renders nothing at all — and the report is awaited first, so the frame still
  // rendering the module before the ask returns is not read as the suppression.
  await expect(report).toHaveCount(1, { timeout: 2 * LIVENESS_INTERVAL_MS });
  await expect(stub).toHaveCount(0);
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

test('leaves every laid-out region clear of the band while the outage report is up', async ({
  page,
}) => {
  await render(page, MASKED, 'frame', { healthz: 'abort' });
  await expect(page.locator('[data-backend-unreachable]')).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const { width, height } = viewport!;
  const band = (BAND / 100) * height;

  // The banded page is the one state where the frame does not hold the top inset itself — it drops
  // it, the report having taken that edge — so here the top edge rests on the report's own padding
  // and the other three on what the frame still holds. Every other fixture that reads a region box
  // against a band renders the backend serving, so this is the only place that rule is read at all.
  const boxes = await regionBoxes(page);
  expect(boxes.size).toBe(REGIONS.size);
  for (const [region, box] of boxes) {
    expect(box.left, `${region} left`).toBeGreaterThanOrEqual(band - 0.5);
    expect(box.top, `${region} top`).toBeGreaterThanOrEqual(band - 0.5);
    expect(box.right, `${region} right`).toBeLessThanOrEqual(width - band + 0.5);
    expect(box.bottom, `${region} bottom`).toBeLessThanOrEqual(height - band + 0.5);
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
