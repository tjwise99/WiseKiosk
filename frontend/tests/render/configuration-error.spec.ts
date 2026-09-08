import { expect, render, test } from './harness';

/**
 * The four `ConfigurationError` outcomes `content-emission.spec.ts`'s `rejected` case does not
 * reach: the backend serving no configuration at all, refusing the ask outright, and answering with
 * a body that is not JSON. Each names the outcome by `data-configuration-error` and renders the
 * detail paragraph the `rejected` case does not — `outcome.detail` rather than a fault list.
 *
 * `/config.json` is spelled literally rather than imported from `config/load`: that module reaches
 * the validator's virtual module, which only Vite resolves, not the Node process a spec file runs in.
 */
const CONFIGURATION_URL = '/config.json';

test('reports no configuration where the backend serves none', async ({ page }) => {
  await render(page, undefined, 'configuration-error', { configResponse: { status: 404, body: '' } });

  await expect(page.locator('[data-configuration-error="absent"]')).toBeVisible();
  await expect(page.locator('.detail')).toContainText(CONFIGURATION_URL);
});

test('reports the configuration unfetchable when the backend refuses the ask', async ({ page }) => {
  await render(page, undefined, 'configuration-error', { configResponse: { status: 503, body: '' } });

  await expect(page.locator('[data-configuration-error="unfetchable"]')).toBeVisible();
  await expect(page.locator('.detail')).toContainText('503');
});

test('reports the configuration unparsable where the body is not JSON', async ({ page }) => {
  await render(page, undefined, 'configuration-error', {
    configResponse: { status: 200, body: 'not json' },
  });

  await expect(page.locator('[data-configuration-error="unparsable"]')).toBeVisible();
  await expect(page.locator('.detail')).toContainText('JSON');
});

test('names the document itself, rather than a location inside it, when nothing in it is a configuration at all', async ({
  page,
}) => {
  // Valid JSON that is not an object at all: the schema's root `type` fault has no property or
  // array index to point a JSON Pointer at, which is what exercises the fault list's fallback to
  // naming the document as a whole (`ConfigurationError.svelte`'s `fault.where || CONFIGURATION_URL`).
  await render(page, undefined, 'configuration-error', { configResponse: { status: 200, body: '[]' } });

  await expect(page.locator('[data-configuration-error="rejected"]')).toBeVisible();
  await expect(page.locator('.where')).toHaveText(CONFIGURATION_URL);
});
