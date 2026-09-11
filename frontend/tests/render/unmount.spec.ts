import { LIVENESS_INTERVAL_MS } from '../../src/lib/liveness';
import { advanceHostClock, expect, holdHostClock, render, test, type Fixture } from './harness';

/**
 * The page's real teardown path: `main.ts`'s re-exported `unmount`, called on the instance its own
 * `mountApp()` produced — the same call an operator's own script would make, not a stand-in for one.
 * Uncited: this covers behaviour the display's own lifecycle holds itself to, not an obligation the
 * tree states.
 */
const FIXTURE: Fixture = {
  modules: [{ region: 'top_bar', module: 'clock' }],
};

/** Wraps the page's current `fetch` to count calls asking `/healthz`, without changing its answer. */
async function countHealthzAsks(page: Parameters<typeof render>[0]): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const answering = window.fetch;
    (window as unknown as { __healthzAsks: number }).__healthzAsks = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/healthz') {
        (window as unknown as { __healthzAsks: number }).__healthzAsks += 1;
      }
      return answering(input, init);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __healthzAsks: number }).__healthzAsks);
}

test('stops polling the backend, and stops a module’s own interval, once unmounted', async ({ page }) => {
  await holdHostClock(page, new Date('2024-01-01T00:00:00.000Z'));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await render(page, FIXTURE);
  const healthzAsks = await countHealthzAsks(page);
  await advanceHostClock(page, LIVENESS_INTERVAL_MS);
  const askedBeforeUnmount = await healthzAsks();
  expect(askedBeforeUnmount).toBeGreaterThan(0);

  // A string rather than a function: `import('/src/main.ts')` is an absolute browser-served path,
  // not one `tsc` can resolve as a module specifier of this file's own.
  await page.evaluate("import('/src/main.ts').then((main) => main.unmount(main.default))");

  await advanceHostClock(page, LIVENESS_INTERVAL_MS * 3);
  const askedAfterUnmount = await healthzAsks();

  expect(askedAfterUnmount).toBe(askedBeforeUnmount);
  expect(pageErrors).toHaveLength(0);
});
