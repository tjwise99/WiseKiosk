import type { Component } from 'svelte';

/**
 * Every module the page can render, by the name a configuration places into a region. Empty until
 * the first module lands (#12 first module end-to-end): a configuration naming one today renders
 * that region's own unknown-module state rather than nothing.
 */
export const modules: Record<string, Component> = {};
