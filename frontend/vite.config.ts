import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { configValidator } from './vite-plugin-config-validator.ts';
import { moduleGraph } from './vite-plugin-module-graph.ts';

export default defineConfig({
  plugins: [svelte(), configValidator(), moduleGraph()],
  // Dev only: forward the backend's paths to `just serve`; the built bundle reaches them same-origin.
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
});
