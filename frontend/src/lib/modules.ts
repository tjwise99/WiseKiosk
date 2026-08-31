import type { Component } from 'svelte';

import Clock from '../modules/clock/Clock.svelte';

/**
 * Every module the page can render, by the name a configuration places into a region. This is the
 * one file of shared framework code that names a module, and an entry is the whole of what
 * registering one takes; a configuration naming no entry here renders that region's own
 * unknown-module state rather than nothing.
 */
export const modules: Record<string, Component> = {
  clock: Clock,
};
