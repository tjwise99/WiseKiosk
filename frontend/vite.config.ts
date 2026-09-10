import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

import { configValidator } from './vite-plugin-config-validator.ts';
import { moduleGraph } from './vite-plugin-module-graph.ts';

/** One of the backend's tracked, served header values, trimmed the way it serves them (#266 security response headers). */
function servedHeader(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../backend/internal/headers/${file}`, import.meta.url)), 'utf8').trim();
}

/**
 * Sets `preview.headers` from the backend's tracked csp.txt and permissions-policy.txt, inside a
 * `config` hook gated on `isPreview`.
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
