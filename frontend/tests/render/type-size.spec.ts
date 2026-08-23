import { expect, test } from '@playwright/test';

import { TYPE_SIZE_FLOOR, readEmission } from './emission';
import { render, type Fixture } from './harness';

/**
 * Every text element clears the type-size floor as a fraction of viewport height, at each
 * resolution rendered. The project matrix is what renders more than one; a size fixed in device
 * pixels fails at the second.
 *
 * The obligation quantifies over every resolution the display supports while this renders three, so
 * a design that first drops below the floor at an unsampled resolution passes.
 */
const FIXTURE: Fixture = {
  modules: [
    { region: 'top_bar', module: 'type-scale' },
    { region: 'middle_center', module: 'grouped' },
    { region: 'bottom_bar', module: 'fits' },
  ],
};

test('renders no text below the floor, read against the viewport', async ({ page }) => {
  await render(page, FIXTURE);
  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(viewportHeight).toBeGreaterThan(0);

  const { text } = await readEmission(page);
  expect(text.length).toBeGreaterThan(0);

  for (const element of text) {
    const fraction = element.fontSizePx / viewportHeight;
    expect(fraction, `${element.element} at ${element.fontSizePx}px`).toBeGreaterThanOrEqual(
      TYPE_SIZE_FLOOR,
    );
  }
});

test('renders the smallest step near the floor rather than far above it', async ({ page }) => {
  // The caption step is deliberately authored close to the floor, so a run in which every element
  // sits far above it would mean the smallest step never reached the page and the floor was
  // asserted against nothing that tests it.
  await render(page, FIXTURE);
  const viewportHeight = page.viewportSize()?.height ?? 0;

  const { text } = await readEmission(page);
  const smallest = Math.min(...text.map((element) => element.fontSizePx)) / viewportHeight;

  expect(smallest).toBeGreaterThanOrEqual(TYPE_SIZE_FLOOR);
  expect(smallest).toBeLessThan(TYPE_SIZE_FLOOR * 1.5);
});

test('holds the floor as a fraction rather than as a pixel count', async ({ page }) => {
  await render(page, FIXTURE);
  const viewportHeight = page.viewportSize()?.height ?? 0;

  const { text } = await readEmission(page);
  const smallest = Math.min(...text.map((element) => element.fontSizePx));

  // The smallest step is `--type-caption` rendered against this viewport, read from the token rather
  // than from a third copy of its figure — a different pixel count at each of the three viewports.
  const caption = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--type-caption')),
  );
  expect(smallest).toBeCloseTo((viewportHeight * caption) / 100, 1);
});
