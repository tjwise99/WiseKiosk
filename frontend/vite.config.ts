import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { configValidator } from './vite-plugin-config-validator.ts';
import { moduleGraph } from './vite-plugin-module-graph.ts';

export default defineConfig({
  plugins: [svelte(), configValidator(), moduleGraph()],
});
