import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

/**
 * The three viewports the display supports, the same set `playwright.config.ts` reads them at
 * ([ADR 0027 rev 1](../docs/decisions/0027-frontend-test-runners.md)).
 */
const VIEWPORTS = {
  kiosk: { width: 1920, height: 1080 },
  'desktop-1280': { width: 1280, height: 800 },
  'desktop-1440': { width: 1440, height: 900 },
};

/**
 * Previews the render tier's production build, through `vite.config.render.ts`
 * (#266 security response headers), running `example-configuration.spec.ts`,
 * `content-emission.spec.ts` and `emitting-surfaces.spec.ts` against it. `preview.headers` is set
 * from the backend's tracked `csp.txt` and `permissions-policy.txt`, carried over by
 * `vite.config.render.ts`'s own `mergeConfig` of `vite.config.ts`. `harness.ts`'s `render` asserts no
 * console warning of a rejected directive or an unrecognised feature while these run.
 */
export default defineConfig({
  testDir: '.',
  testMatch: [
    'tests/render/example-configuration.spec.ts',
    'tests/render/content-emission.spec.ts',
    'tests/render/emitting-surfaces.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'list' : 'line',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },

  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: { ...devices['Desktop Chrome'], viewport },
  })),

  webServer: {
    command: `node_modules/.bin/vite build --config vite.config.render.ts && node_modules/.bin/vite preview --config vite.config.render.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
