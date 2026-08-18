import { expect, test } from '@playwright/test';

import { regionBoxes, render, type Fixture } from './harness';

/**
 * TST049. No laid-out region enters the band the configuration declares, on any edge, over
 * configurations chosen to load the display rather than a single fixture.
 *
 * Regions are read rather than content: content overflows its region by design, so a content-level
 * assertion would fail on a display behaving exactly as obliged.
 */
const BAND = 4;

const LOADED: { name: string; fixture: Fixture }[] = [
  {
    name: 'every framed region occupied',
    fixture: {
      edge_band: BAND,
      modules: [
        'top_bar',
        'top_left',
        'top_center',
        'top_right',
        'upper_third',
        'middle_center',
        'lower_third',
        'bottom_left',
        'bottom_center',
        'bottom_right',
        'bottom_bar',
      ].map((region) => ({ region, module: 'fits' })),
    },
  },
  {
    name: 'the four corners only',
    fixture: {
      edge_band: BAND,
      modules: ['top_left', 'top_right', 'bottom_left', 'bottom_right'].map((region) => ({
        region,
        module: 'grouped',
      })),
    },
  },
  {
    name: 'a fullscreen layer over an occupied frame',
    fixture: {
      edge_band: BAND,
      modules: [
        { region: 'top_bar', module: 'fits' },
        { region: 'bottom_bar', module: 'fits' },
        { region: 'fullscreen_above', module: 'fits' },
      ],
    },
  },
  {
    name: 'a region carrying content larger than itself',
    fixture: {
      edge_band: BAND,
      modules: [
        { region: 'middle_center', module: 'overflows' },
        { region: 'top_left', module: 'fits' },
      ],
    },
  },
];

for (const { name, fixture } of LOADED) {
  test(`keeps every region clear of the band, with ${name}`, async ({ page }) => {
    await render(page, fixture);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const { width, height } = viewport!;
    const band = (BAND / 100) * height;

    const boxes = await regionBoxes(page);
    expect(boxes.size).toBeGreaterThan(0);

    for (const [region, box] of boxes) {
      expect(box.left, `${region} left`).toBeGreaterThanOrEqual(band - 0.5);
      expect(box.top, `${region} top`).toBeGreaterThanOrEqual(band - 0.5);
      expect(box.right, `${region} right`).toBeLessThanOrEqual(width - band + 0.5);
      expect(box.bottom, `${region} bottom`).toBeLessThanOrEqual(height - band + 0.5);
    }
  });
}
