import type { Component } from 'svelte';

import Clock from '../modules/clock/Clock.svelte';

/**
 * Every module the page can render, by the name a configuration places into a region. An entry here
 * is what registers one for rendering; a configuration naming no entry renders that region's own
 * unknown-module state rather than nothing. A module's configuration section is named separately, in
 * the schema, so removing a module means removing both.
 */
export const modules: Record<string, Component> = {
  clock: Clock,
};
