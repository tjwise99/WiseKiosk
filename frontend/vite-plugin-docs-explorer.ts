import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

/** The path the built docs site is mounted under during `vite dev`. */
export const DOCS_MOUNT = '/docs';

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
 * Serves the already-built docs site (`docs/site/_build/html`, `just check-site`'s output) whole
 * at `/docs` under `vite dev` — every page, `_static` asset and the search index, not just the API
 * explorer — riding this file's existing `server.proxy` for `/api` and `/healthz`. That is the same
 * same-origin path the frontend bundle itself reaches the backend through, so the API explorer
 * page's "Try it out" needs no CORS header and no backend change (#195, ADR 0029 rev 1).
 * `configureServer` is a dev-server-only Vite hook: `vite build`/`vite preview` never call it, so
 * this cannot reach the production bundle or its CSP.
 *
 * A path ending in `/` serves that directory's `index.html`, mirroring `staticserve.Handler`'s own
 * rule (`backend/internal/staticserve`) — the built site's own `index.html` is a redirect stub to
 * `site/`, so `/docs/` behaves the same way opening the file directly would.
 *
 * Read-only and additive: 404s (falls through to Vite's own 404) when the docs build hasn't been
 * run yet, rather than failing `vite dev` outright — `just docs-serve` always builds first, so this
 * is a safety net, not the documented path.
 */
export function docsExplorer(): Plugin {
  return {
    name: 'wisekiosk:docs-explorer',
    configureServer(server) {
      server.middlewares.use(DOCS_MOUNT, (req, res, next) => {
        const requestPath = (req.url ?? '/').split('?')[0] || '/';
        const relative = normalize(requestPath.endsWith('/') ? `${requestPath}index.html` : requestPath);
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
