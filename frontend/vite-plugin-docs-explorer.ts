import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

/** The path the built docs site is mounted under during `vite dev`. */
export const DOCS_EXPLORER_MOUNT = '/docs-explorer';

const DOCS_BUILD_ROOT = fileURLToPath(new URL('../docs/site/_build/html/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the already-built docs site (`docs/site/_build/html`, `just check-site`'s output) at
 * `/docs-explorer` under `vite dev`, riding this file's existing `server.proxy` for `/api` and
 * `/healthz` — the same same-origin path the frontend bundle itself reaches the backend through,
 * so the API explorer page's "Try it out" needs no CORS header and no backend change (#195 ADR
 * 0029). `configureServer` is a dev-server-only Vite hook: `vite build`/`vite preview` never call
 * it, so this cannot reach the production bundle or its CSP.
 *
 * Read-only and additive: 404s (falls through to Vite's own 404) when the docs build hasn't been
 * run yet, rather than failing `vite dev` outright — this stays a soft, undeclared dependency on
 * `just check-site` having run once, not a `just dev` prerequisite (that would pull the whole
 * Sphinx/Doorstop toolchain into every ordinary frontend dev-loop start).
 */
export function docsExplorer(): Plugin {
  return {
    name: 'wisekiosk:docs-explorer',
    configureServer(server) {
      server.middlewares.use(DOCS_EXPLORER_MOUNT, (req, res, next) => {
        const requestPath = (req.url ?? '/').split('?')[0];
        const relative = normalize(requestPath === '/' ? '/api-explorer.html' : requestPath);
        const filePath = join(DOCS_BUILD_ROOT, relative);
        if (!filePath.startsWith(DOCS_BUILD_ROOT)) {
          next();
          return;
        }
        readFile(filePath)
          .then((body) => {
            res.setHeader('Content-Type', CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream');
            res.end(body);
          })
          .catch(() => next());
      });
    },
  };
}
