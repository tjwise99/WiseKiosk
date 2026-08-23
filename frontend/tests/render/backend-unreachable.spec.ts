import { expect, test } from '@playwright/test';

import { LIVENESS_INTERVAL_MS } from '../../src/lib/liveness';
import type { Fixture } from './harness';

/**
 * TST040. With the page already served and its modules laid out, an unreachable backend raises one
 * page-wide state rather than one per region, carrying a remediation distinct from the diagnosis it
 * reports — and the state clears on its own once the backend answers again.
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
 * Serves the fixture and answers the liveness ask the way a stopped service does — the connection
 * fails rather than carrying a status. The routes are registered here rather than through the
 * harness, whose default answers that ask healthily.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(FIXTURE) }),
  );
  await page.route('**/healthz', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('[data-frame]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test('reports the outage once for the page, over a layout that keeps rendering', async ({
  page,
}) => {
  const state = page.locator('[data-backend-unreachable]');
  await expect(state).toBeVisible();
  await expect(state).toHaveCount(1);

  // The failure degrades no more of the display than it has to: what is already laid out is still
  // laid out under the state reporting the outage.
  await expect(page.locator('[data-region]')).toHaveCount(REGIONS.size);
});

test('names a corrective action that is not the failure it reports', async ({ page }) => {
  const diagnosis = (await page.locator('[data-diagnosis]').innerText()).trim();
  const remediation = (await page.locator('[data-remediation]').innerText()).trim();

  expect(remediation).not.toBe('');
  expect(remediation).not.toBe(diagnosis);
});

test('clears the state on its own once the backend answers again', async ({ page }) => {
  const state = page.locator('[data-backend-unreachable]');
  await expect(state).toBeVisible();

  await page.route('**/healthz', (route) => route.fulfill({ status: 200, body: 'ok' }));

  // Two intervals, not one: the ask that reaches the restored backend is the next one after the
  // route changes, and the route can change immediately after an ask has already gone out.
  await expect(state).toBeHidden({ timeout: 2 * LIVENESS_INTERVAL_MS });
});
