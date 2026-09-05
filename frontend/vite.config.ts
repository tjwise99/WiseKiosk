import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

import { configValidator } from './vite-plugin-config-validator.ts';
import { moduleGraph } from './vite-plugin-module-graph.ts';

/** One of the backend's tracked, served header values, trimmed the way it serves them (#266). */
function servedHeader(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../backend/internal/headers/${file}`, import.meta.url)), 'utf8').trim();
}

/**
 * Sets `preview.headers` from the same tracked files the backend embeds, so `just preview` and the
 * render tier's policy project serve the identical values under test (headers_test.go asserts the
 * backend side). Read inside the `config` hook, gated on `isPreview`, rather than inline in the
 * config object: `vite build` resolves this same file (the image build's frontend stage has no
 * `backend/` in its context) and must never read these paths.
 */
function previewSecurityHeaders(): Plugin {
  return {
    name: 'wisekiosk:preview-security-headers',
    config(_config, { isPreview }) {
      if (!isPreview) return;
      return {
        preview: {
          headers: {
            'Content-Security-Policy': servedHeader('csp.txt'),
            'Permissions-Policy': servedHeader('permissions-policy.txt'),
          },
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [svelte(), configValidator(), moduleGraph(), previewSecurityHeaders()],
  // Dev only: forward the backend's paths to `just serve`; the built bundle reaches them same-origin.
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
});
