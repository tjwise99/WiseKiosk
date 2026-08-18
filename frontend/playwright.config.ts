import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * The three viewports the display supports: the kiosk it is built for, and the two desktop widths it
 * is read at. Every render test runs at each, which is what makes the resolution-invariant
 * obligations readable at more than one resolution
 * ([ADR 0027 rev 1](../docs/decisions/0027-frontend-test-runners.md)).
 */
const VIEWPORTS = {
  kiosk: { width: 1920, height: 1080 },
  'desktop-1280': { width: 1280, height: 800 },
  'desktop-1440': { width: 1440, height: 900 },
};

export default defineConfig({
  testDir: './tests/render',
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

  // The dev server runs the production configuration with the module registry substituted, so what
  // is measured is the page as it is built rather than a second assembly of it.
  webServer: {
    command: `node_modules/.bin/vite --config vite.config.render.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
