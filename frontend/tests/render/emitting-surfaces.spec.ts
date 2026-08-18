import { expect, test } from '@playwright/test';

import { surfacesAboveCeiling } from './emission';
import { render, type Fixture } from './harness';

/**
 * TST045. Everything the page draws sits below the emission ceiling except text and imagery rendered
 * as content. Read over every element and every surface it emits from, and seeded in both directions:
 * the legal design must be reported clean, and each device the ceiling refuses must be reported.
 */

/** The design as the styling contract states it, plus the two things the exemption is for. */
const LEGAL: Fixture = {
  modules: [
    { region: 'top_bar', module: 'grouped' },
    { region: 'middle_center', module: 'type-scale' },
    { region: 'bottom_bar', module: 'bright-image' },
    { region: 'top_left', module: 'fits' },
  ],
};

/** One seed each, named by the device it spells. */
const SEEDS: { name: string; module: string; surface: string }[] = [
  { name: 'a lit panel behind a block of text', module: 'lit-panel', surface: 'background-color' },
  { name: 'a card', module: 'card', surface: 'border-top-color' },
  { name: "a fill marking a region's bounds", module: 'region-fill', surface: 'background-color' },
  { name: 'an outline around a block of content', module: 'outlined', surface: 'outline-color' },
  { name: 'a scrim lifting a glyph off its background', module: 'scrim', surface: 'box-shadow' },
  { name: 'that fill spelled as a gradient', module: 'gradient-fill', surface: 'background-image' },
  { name: 'that scrim spelled as a gradient', module: 'gradient-scrim', surface: 'background-image' },
];

test('nothing the page draws clears the ceiling, over the design as it is stated', async ({ page }) => {
  await render(page, LEGAL);

  const above = await surfacesAboveCeiling(page);
  expect(above, JSON.stringify(above, null, 2)).toHaveLength(0);
});

test('the page still draws the two things the exemption is for', async ({ page }) => {
  await render(page, LEGAL);

  // Without these the scan would report the same clean result having judged a page with no content
  // above the ceiling to exempt in the first place.
  await expect(page.locator('[data-stub="bright-image"] img')).toBeVisible();
  await expect(page.locator('[data-stub="type-scale"]')).toBeVisible();
});

for (const seed of SEEDS) {
  test(`reports ${seed.name}`, async ({ page }) => {
    await render(page, { modules: [{ region: 'middle_center', module: seed.module }] });

    const above = await surfacesAboveCeiling(page);
    expect(above.map((surface) => surface.property)).toContain(seed.surface);
    for (const surface of above) {
      expect(surface.luminance).toBeGreaterThan(0.06);
    }
  });
}
