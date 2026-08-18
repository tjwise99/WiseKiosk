import { expect, test } from '@playwright/test';

import { readEmission } from './emission';
import { render, type Fixture } from './harness';

/**
 * TST047. Every text element the page presents for reading renders at the display's maximum
 * emission rather than a reduced level. The value asserted is the one the page chose; what the
 * panel emits and what a viewer sees over the reflected room are both outside it.
 */
const FIXTURE: Fixture = {
  modules: [
    { region: 'top_bar', module: 'type-scale' },
    { region: 'middle_center', module: 'grouped' },
    { region: 'bottom_left', module: 'fits' },
  ],
};

test('renders every text element at full emission', async ({ page }) => {
  await render(page, FIXTURE);

  const { text, unreadable } = await readEmission(page);
  expect(text.length).toBeGreaterThan(0);
  expect(unreadable, JSON.stringify(unreadable, null, 2)).toHaveLength(0);

  // Asserted on the emission rather than on the spelling: `rgb(255, 255, 255)` and `oklch(1 0 0)`
  // are the same white, and the obligation is about the value the page renders at.
  for (const element of text) {
    expect(element.luminance, `${element.element}: ${element.text} (${element.colour})`).toBeCloseTo(
      1,
      6,
    );
  }
});

test('renders the configuration report at full emission too', async ({ page }) => {
  // The error state is the page's own text, and the emission rule is the page's rather than a
  // module's: a configuration that cannot be applied leaves no modules at all.
  await render(page, { modules: [{ region: 'nowhere', module: 'fits' }] }, 'configuration-error');

  await expect(page.locator('[data-configuration-error="rejected"]')).toBeVisible();
  const { text } = await readEmission(page);
  expect(text.length).toBeGreaterThan(0);
  for (const element of text) {
    expect(element.luminance, `${element.element} (${element.colour})`).toBeCloseTo(1, 6);
  }
});
