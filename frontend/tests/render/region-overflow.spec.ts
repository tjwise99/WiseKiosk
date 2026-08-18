import { expect, test } from '@playwright/test';

import { render, type Fixture } from './harness';

/**
 * TST046. Content exceeding its region overflows rather than being clipped, scrolled or scaled.
 * Seeded both ways over two fixtures, because a fixture that overflows may cross a neighbouring
 * region and extend the document past the viewport — both permitted — so one fixture asserting both
 * would fail on a page behaving exactly as obliged.
 *
 * The overflowing module is placed in a third: the bars and the corner rows are sized to their
 * content and grow rather than being exceeded, so content there never overflows anything.
 */
const OVERFLOWING: Fixture = { modules: [{ region: 'middle_center', module: 'overflows' }] };
const FITTING: Fixture = { modules: [{ region: 'middle_center', module: 'fits' }] };

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const region = document.querySelector('[data-region="middle_center"]');
    const stub = document.querySelector('[data-stub]');
    if (!region || !stub) {
      throw new Error('the fixture rendered no module in middle_center');
    }
    const outer = region.getBoundingClientRect();
    const inner = stub.getBoundingClientRect();
    const line = stub.querySelector('p');
    return {
      regionHeight: outer.height,
      contentHeight: inner.height,
      exceeds: inner.height > outer.height + 0.5 || inner.width > outer.width + 0.5,
      lineFontSizePx: line ? Number.parseFloat(getComputedStyle(line).fontSize) : 0,
      regionOverflow: getComputedStyle(region).overflow,
      lastLineBottom: [...stub.querySelectorAll('p')].at(-1)?.getBoundingClientRect().bottom ?? 0,
      documentScrollHeight: document.documentElement.scrollHeight,
    };
  });
}

test('content larger than its region exceeds the region rather than fitting inside it', async ({
  page,
}) => {
  await render(page, OVERFLOWING);
  const overflowing = await measure(page);

  expect(overflowing.exceeds).toBe(true);
  expect(overflowing.contentHeight).toBeGreaterThan(overflowing.regionHeight);
});

test('content that fits its region is not reported as overflowing', async ({ page }) => {
  await render(page, FITTING);
  const fitting = await measure(page);

  expect(fitting.exceeds).toBe(false);
});

test('the overflow is neither clipped nor scrolled away nor scaled down', async ({ page }) => {
  await render(page, FITTING);
  const fitting = await measure(page);

  await render(page, OVERFLOWING);
  const overflowing = await measure(page);

  // Not clipped: the region does not hide what leaves it, and the document grew to carry it.
  expect(overflowing.regionOverflow).toBe('visible');
  expect(overflowing.documentScrollHeight).toBeGreaterThan(overflowing.regionHeight);

  // Not reachable only by scrolling the region: the last line sits past the region's own bottom
  // rather than inside a scroller.
  expect(overflowing.lastLineBottom).toBeGreaterThan(overflowing.regionHeight);

  // Not scaled: a line renders at the size it renders at when the content fits.
  expect(overflowing.lineFontSizePx).toBeCloseTo(fitting.lineFontSizePx, 2);
});
