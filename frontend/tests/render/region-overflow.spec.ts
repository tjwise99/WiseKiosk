import { expect, test, type Page } from '@playwright/test';

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

async function measure(page: Page) {
  return page.evaluate(() => {
    const region = document.querySelector('[data-region="middle_center"]');
    const stub = document.querySelector('[data-stub]');
    if (!region || !stub) {
      throw new Error('the fixture rendered no module in middle_center');
    }
    const outer = region.getBoundingClientRect();
    const inner = stub.getBoundingClientRect();
    const line = stub.querySelector('p');

    // Hit-testing just below the region's own bottom edge. This is the one reading that survives a
    // clip: `getBoundingClientRect` reports the same geometry whether content is painted or hidden,
    // and a region that clipped or scrolled its content would answer with the frame behind it. The
    // point is held inside the viewport, hit-testing outside it returning nothing at all.
    const probeY = Math.min(outer.bottom + 20, window.innerHeight - 2);
    const painted = document.elementFromPoint((outer.left + outer.right) / 2, probeY);

    return {
      regionHeight: outer.height,
      regionBottom: outer.bottom,
      contentHeight: inner.height,
      exceeds: inner.height > outer.height + 0.5 || inner.width > outer.width + 0.5,
      lineFontSizePx: line ? Number.parseFloat(getComputedStyle(line).fontSize) : 0,
      paintedBelowRegion: painted ? stub.contains(painted) : false,
      lastLineBottom: [...stub.querySelectorAll('p')].at(-1)?.getBoundingClientRect().bottom ?? 0,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
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
  // The other direction of the reading below: content that fits paints nothing past its region, so
  // a check that answered "painted" unconditionally would fail here rather than passing everywhere.
  expect(fitting.paintedBelowRegion).toBe(false);
  expect(fitting.documentScrollHeight).toBeLessThanOrEqual(fitting.viewportHeight);
});

test('the overflow is neither clipped nor scrolled away nor scaled down', async ({ page }) => {
  await render(page, FITTING);
  const fitting = await measure(page);

  await render(page, OVERFLOWING);
  const overflowing = await measure(page);

  // Not clipped and not shut inside a scroller: the module's own content is what the browser hits
  // below the region's bottom edge. A region set to `hidden` or `auto` answers with the frame.
  expect(overflowing.paintedBelowRegion).toBe(true);

  // The document grew to carry what left the region, which is what a scroller inside the region
  // would have absorbed instead.
  expect(overflowing.documentScrollHeight).toBeGreaterThan(overflowing.viewportHeight);

  // The last line sits past the region's own bottom edge, read against that edge rather than
  // against the region's height.
  expect(overflowing.lastLineBottom).toBeGreaterThan(overflowing.regionBottom);

  // Not scaled: a line renders at the size it renders at when the content fits.
  expect(overflowing.lineFontSizePx).toBeCloseTo(fitting.lineFontSizePx, 2);
});
