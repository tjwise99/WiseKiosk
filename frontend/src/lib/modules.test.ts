import { afterEach, describe, expect, it, vi } from 'vitest';

import Clock from '../modules/clock/Clock.svelte';
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
});
