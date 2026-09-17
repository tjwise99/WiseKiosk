import { afterEach, describe, expect, it, vi } from 'vitest';

import Clock from '../modules/clock/Clock.svelte';
import ParkWaitTimes from '../modules/park_wait_times/ParkWaitTimes.svelte';
import Weather from '../modules/weather/Weather.svelte';
import { modules } from './modules';

/** A fetcher answering with `response`, ignoring what it is asked. */
function answering(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the module registry', () => {
  it('registers the clock with no reading of its own', () => {
    expect(modules.clock.component).toBe(Clock);
    expect(modules.clock.read).toBeUndefined();
  });

  it('registers weather, read on the cadence SRS046/SRS047 set', () => {
    expect(modules.weather.component).toBe(Weather);
    expect(modules.weather.readIntervalMs).toBe(5 * 60 * 1000);
  });

  it('reads weather by the point its placement names, and nothing else of it', async () => {
    let body: unknown;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return answering(new Response('{}', { status: 200 }))(input, init);
    });

    await modules.weather.read!({ location: { lat: 42.36, lon: -71.06 } });

    expect(body).toEqual({ lat: 42.36, lon: -71.06 });
  });

  it('registers park-wait-times, read on the cadence SRS062/SRS063 set', () => {
    expect(modules.park_wait_times.component).toBe(ParkWaitTimes);
    expect(modules.park_wait_times.readIntervalMs).toBe(5 * 60 * 1000);
  });

  // `read`'s own two fields under this module's control — `useDefaultBlacklist`, renamed from
  // the config's own `use_default_blacklist` (config/schema.json's own spelling), and `blacklist`,
  // forwarded unrenamed — are otherwise untested: `parks` and `blacklist` are both `string[]`, so a
  // swap between them compiles clean, and either field silently failing to forward would still
  // leave the backend's own default (`useDefaultBlacklist` nil-as-true, route.go's own
  // `blacklistToggle`) reading as correct while an operator's `use_default_blacklist: false` and
  // their own blacklist entries were dropped without an error anywhere.
  it('reads park-wait-times by the parks, blacklist toggle and blacklist its placement names, correctly renamed and not swapped', async () => {
    let body: unknown;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return answering(new Response('{}', { status: 200 }))(input, init);
    });

    await modules.park_wait_times.read!({
      parks: ['magic-kingdom', 'epcot'],
      columns: 2,
      rows: 1,
      use_default_blacklist: false,
      blacklist: ['Cinderella Castle'],
    });

    expect(body).toEqual({
      parks: ['magic-kingdom', 'epcot'],
      useDefaultBlacklist: false,
      blacklist: ['Cinderella Castle'],
    });
  });
});
