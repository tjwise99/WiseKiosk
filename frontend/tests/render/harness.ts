import { expect, type Page } from '@playwright/test';

/** A configuration the page is driven with, in the shape `config.json` carries. */
export interface Fixture {
  modules: { region: string; module: string }[];
  edge_band?: number;
}

/** What a fixture puts on screen: the frame, or the report of why there is none. */
export type Rendered = 'frame' | 'configuration-error';

/**
 * Serves `fixture` as the configuration and waits for the frame to be laid out. The configuration is
 * fulfilled from the test rather than written to disk, so one server serves every fixture and each
 * test states the configuration it is asserting against.
 */
export async function render(
  page: Page,
  fixture: unknown,
  expected: Rendered = 'frame',
): Promise<void> {
  // Matched as a glob rather than by importing `CONFIGURATION_URL`: a spec file runs in Node, and
  // that constant's module reaches the validator's virtual module, which only Vite can resolve. The
  // two spellings are held together by construction — disagree and the frame never renders, failing
  // every test in the tier rather than one.
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture) }),
  );
  await page.goto('/');
  const settled =
    expected === 'frame' ? page.locator('[data-frame]') : page.locator('[data-configuration-error]');
  await expect(settled).toBeVisible();
  // The bundled face is loaded blocking, so text is not laid out at its final size until it arrives.
  await page.evaluate(() => document.fonts.ready);
}

/** A rendered box, in CSS pixels relative to the viewport. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Every laid-out region, by name, with the box the browser gave it. */
export async function regionBoxes(page: Page): Promise<Map<string, Box>> {
  const measured = await page.evaluate(() =>
    [...document.querySelectorAll('[data-region]')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        region: element.getAttribute('data-region') ?? '',
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      };
    }),
  );
  return new Map(measured.map(({ region, box }) => [region, box]));
}

/**
 * Whether two boxes share any area. Touching edges are not an overlap, and a tolerance absorbs the
 * sub-pixel geometry a fractional viewport division produces.
 */
export function overlaps(a: Box, b: Box, tolerance = 0.5): boolean {
  return (
    a.left < b.right - tolerance &&
    b.left < a.right - tolerance &&
    a.top < b.bottom - tolerance &&
    b.top < a.bottom - tolerance
  );
}
