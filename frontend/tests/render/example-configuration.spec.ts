import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { render, serveModuleData } from './harness';

/**
 * #139 example-configuration check. The configuration shipped at `deploy/config.example.json` is
 * the one an operator's first bring-up copies (docs/CI.md § Deployment and bring-up), so it is read
 * from the repository here rather than restated as a fixture — a case asserting against a copy
 * could drift from what is actually shipped and pass regardless.
 *
 * Asserts only what the frame mounted from the configuration, never a module's own data: every
 * module route answers 503, so what a placement then renders is each module's own business,
 * covered by that module's own render spec. The framework-level fact this check owns is that a
 * configuration the schema accepts renders with no validation report, and mounts the modules it
 * names in the regions it names them for.
 */
const EXAMPLE = JSON.parse(
  readFileSync(new URL('../../../deploy/config.example.json', import.meta.url), 'utf8'),
) as { modules: { region: string; module: string }[] };

test('renders the shipped example configuration with no validation report', async ({ page }) => {
  await serveModuleData(page, () => ({
    status: 503,
    data: { message: 'not served in this check' },
  }));
  await render(page, EXAMPLE);

  await expect(page.locator('[data-configuration-error]')).toHaveCount(0);
  await expect(page.locator('[data-frame]')).toBeVisible();

  for (const { region, module } of EXAMPLE.modules) {
    await expect(page.locator(`[data-region="${region}"][data-modules~="${module}"]`)).toHaveCount(
      1,
    );
  }
});
