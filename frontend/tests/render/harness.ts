import { expect, type Page } from '@playwright/test';

/** A configuration the page is driven with, in the shape `config.json` carries. */
export interface Fixture {
  modules: { region: string; module: string; options?: Record<string, unknown> }[];
  edge_band?: number;
}

/** What a fixture puts on screen: the frame, or the report of why there is none. */
export type Rendered = 'frame' | 'configuration-error';

/** How the backend answers the page's liveness ask: serving, or gone. */
export type Liveness = 'ok' | 'abort';

/**
 * Answers the page's liveness ask, `abort` being the connection failing the way a stopped service
 * fails it. Playwright matches routes most-recently-registered first, so calling this again over a
 * served page is what induces the transition a test is asserting. One spelling of the glob, for the
 * same reason the configuration's is one. The served answer carries no body, because the route
 * declares none and the generated client parses whatever one it is handed.
 */
export async function serveLiveness(page: Page, liveness: Liveness): Promise<void> {
  await page.route('**/healthz', (route) =>
    liveness === 'ok' ? route.fulfill({ status: 200 }) : route.abort('failed'),
  );
}

/**
 * Serves `fixture` as the configuration and waits for the frame to be laid out. The configuration is
 * fulfilled from the test rather than written to disk, so one server serves every fixture and each
 * test states the configuration it is asserting against. The backend answers the liveness ask unless
 * a test says otherwise, so a fixture not asserting the unreachable state never raises one.
 */
export async function render(
  page: Page,
  fixture: unknown,
  expected: Rendered = 'frame',
  { healthz = 'ok' }: { healthz?: Liveness } = {},
): Promise<void> {
  // Matched as a glob rather than by importing `CONFIGURATION_URL`: a spec file runs in Node, and
  // that constant's module reaches the validator's virtual module, which only Vite can resolve. The
  // two spellings are held together by construction — disagree and the frame never renders, failing
  // every test in the tier rather than one.
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture) }),
  );
  await serveLiveness(page, healthz);
  await page.goto('/');
  const settled =
    expected === 'frame' ? page.locator('[data-frame]') : page.locator('[data-configuration-error]');
  await expect(settled).toBeVisible();
  // The bundled face is loaded blocking, so text is not laid out at its final size until it arrives.
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Puts the browser host's clock under the test's control, standing at `when`. Installed before any
 * navigation, because it is delivered as an init script and a document already loaded has the real
 * one; it survives the navigations `render` makes afterwards. Time then stands still until a test
 * advances it with `page.clock.runFor`, which is what lets a check assert over an advancing clock
 * without waiting for real seconds — and what makes the value on screen attributable to this clock
 * rather than to whatever the runner's own happened to read.
 */
export async function holdHostClock(page: Page, when: Date): Promise<void> {
  await page.clock.install({ time: when });
}

/** What the page asked for, and what it opened, while a test watched. */
export interface Traffic {
  /** Every request the page issued, by URL and by the kind of thing that issued it. */
  readonly requests: { url: string; resourceType: string }[];
  /** Every WebSocket the page opened, by URL. */
  readonly channels: string[];
}

/**
 * Watches what the page asks for from here on, so a test can assert an absence over it. Registered
 * before `render`, since a listener added after the navigation misses everything the load did.
 *
 * The reading is bounded by construction and deliberately so: it sees requests the browser makes and
 * WebSockets it opens, and a delivery mechanism outside both — anything already in the bundle, or a
 * channel Playwright does not surface — is outside what an assertion over it can claim. That bound
 * is the one the verification items using this already state for themselves.
 */
export function watchTraffic(page: Page): Traffic {
  const requests: { url: string; resourceType: string }[] = [];
  const channels: string[] = [];
  page.on('request', (request) =>
    requests.push({ url: request.url(), resourceType: request.resourceType() }),
  );
  page.on('websocket', (socket) => channels.push(socket.url()));
  return { requests, channels };
}

/**
 * The resource types a page uses to ask a server for data, as against the ones that fetch the bundle
 * itself. `eventsource` is among them because a server-sent-events stream is a request of this kind
 * rather than a WebSocket, and it is exactly the shape a module would take a pushed value over.
 */
export const ASKING_RESOURCE_TYPES = new Set(['fetch', 'xhr', 'eventsource']);

/**
 * The paths the page shell asks for on its own account: its configuration, once at mount, and the
 * backend's liveness, on the shell's own interval. Every other ask is some module's.
 */
export const SHELL_PATHS = new Set(['/config.json', '/healthz']);

/** Every ask that was not the shell's own, by path — what is left is attributable to a module. */
export function asksBeyondTheShell(traffic: Traffic): string[] {
  return traffic.requests
    .filter((request) => ASKING_RESOURCE_TYPES.has(request.resourceType))
    .map((request) => new URL(request.url).pathname)
    .filter((path) => !SHELL_PATHS.has(path));
}

/**
 * Every channel the page opened that the tier did not open on its own account. The tier is served by
 * a dev server, and its injected client holds one WebSocket at the served root carrying a handshake
 * token; that shape is excepted, and it is the only exception — a channel a module opens addresses a
 * route on the backend, so it is left over rather than absorbed. The exception is by shape rather
 * than by counting, so a second channel of any kind still shows up.
 */
export function channelsBeyondTheTier(traffic: Traffic): string[] {
  return traffic.channels.filter((channel) => {
    const opened = new URL(channel);
    return !(opened.pathname === '/' && opened.searchParams.has('token'));
  });
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
