import { expect, test } from '@playwright/test';

import { regionBoxes, render, type Fixture } from './harness';

/**
 * TST050. The band the regions keep clear of tracks the depth the configuration declares, and where
 * none is declared the regions reach the display's own edge. Seeded both ways deliberately: a depth
 * compiled into the image fails the first, and fills the second with a figure of its own.
 */
const PLACEMENTS = [
  { region: 'top_left', module: 'fits' },
  { region: 'top_right', module: 'fits' },
  { region: 'bottom_left', module: 'fits' },
  { region: 'bottom_right', module: 'fits' },
];

const DEPTHS = [2, 7];

/** The smallest gap between any laid-out region and each edge of the viewport. */
async function clearance(page: import('@playwright/test').Page) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('the project declared no viewport');
  }
  const boxes = [...(await regionBoxes(page)).values()];
  expect(boxes.length).toBeGreaterThan(0);
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.min(...boxes.map((box) => viewport.width - box.right)),
    bottom: Math.min(...boxes.map((box) => viewport.height - box.bottom)),
    height: viewport.height,
  };
}

for (const depth of DEPTHS) {
  test(`holds the regions ${depth}% of the display's height off every edge`, async ({ page }) => {
    const fixture: Fixture = { edge_band: depth, modules: PLACEMENTS };
    await render(page, fixture);

    const gaps = await clearance(page);
    const expected = (depth / 100) * gaps.height;

    expect(gaps.left).toBeCloseTo(expected, 0);
    expect(gaps.top).toBeCloseTo(expected, 0);
    expect(gaps.right).toBeCloseTo(expected, 0);
    expect(gaps.bottom).toBeCloseTo(expected, 0);
  });
}

test('the band tracks the depth rather than being one figure for both', async ({ page }) => {
  await render(page, { edge_band: DEPTHS[0], modules: PLACEMENTS });
  const shallow = await clearance(page);

  await render(page, { edge_band: DEPTHS[1], modules: PLACEMENTS });
  const deep = await clearance(page);

  expect(deep.left).toBeGreaterThan(shallow.left);
  expect(deep.top).toBeGreaterThan(shallow.top);
});

test('assumes no band where the configuration declares none', async ({ page }) => {
  await render(page, { modules: PLACEMENTS });

  const gaps = await clearance(page);
  expect(gaps.left).toBeCloseTo(0, 1);
  expect(gaps.top).toBeCloseTo(0, 1);
  expect(gaps.right).toBeCloseTo(0, 1);
  expect(gaps.bottom).toBeCloseTo(0, 1);
});
