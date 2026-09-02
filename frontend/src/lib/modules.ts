import type { Component } from 'svelte';

import type { ModuleOptions, WeatherOptions } from '../config/types';
import Clock from '../modules/clock/Clock.svelte';
import Weather from '../modules/weather/Weather.svelte';
import { postApiWeather } from './boundary/client';
import type { ModuleAnswer } from './payload';

/**
 * One registered module: what draws it, and — where it is fed by the backend — how its payload is
 * read. A module with no `read` is a local one: it renders from something already present and the
 * shell fetches nothing for it.
 */
export interface ModuleEntry {
  readonly component: Component;
  readonly read?: (config: ModuleOptions, options?: RequestInit) => Promise<ModuleAnswer>;
}

/**
 * Every module the page can render, by the name a configuration places into a region. An entry here
 * is what registers one for rendering; a configuration naming no entry renders that region's own
 * unknown-module state rather than nothing. A module's configuration section is named separately, in
 * the schema, so removing a module means removing both.
 *
 * This is the one file in the shared frontend that names a module
 * (docs/contracts/module-contract.md § Dependency direction). The reading is bound here rather than
 * in the module so that the component stays fed by its props alone (part 1); what does the reading
 * is the client generated from the boundary schema, so no request is written by hand
 * (ADR 0008 rev 4).
 */
export const modules: Record<string, ModuleEntry> = {
  clock: { component: Clock },
  weather: {
    component: Weather,
    // The narrowing is what validation already guarantees rather than an assumption: the schema
    // requires a weather placement to carry its location, and the configuration has been through
    // that schema before any of this runs. The two names are taken off it and handed over one at a
    // time, so the request body carries the point and nothing else the placement holds.
    read: (config, options) => {
      const { lat, lon } = (config as WeatherOptions).location;
      return postApiWeather({ lat, lon }, options);
    },
  },
};
