import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const DOCS_BUILD_ROOT = fileURLToPath(new URL('./_build/html/', import.meta.url));

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
 * Serves the already-built docs site (`_build/html`, `just check-site`'s output) whole, at this
 * server's root — every page, `_static` asset and the search index, not the explorer alone. A path
 * ending in `/` serves that directory's `index.html`, mirroring `staticserve.Handler`'s own rule
 * (`backend/internal/staticserve`) — the built site's own `index.html` is a redirect stub to
 * `site/`, so `/` behaves the same way opening the file directly would.
 *
 * Read-only and additive: 404s (falls through to Vite's own 404) when the docs build hasn't been
 * run yet, rather than failing outright — `just docs-serve` always builds first, so this is a
 * safety net, not the documented path.
 */
function docsSite(): Plugin {
  return {
    name: 'wisekiosk:docs-site-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
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

/**
 * The docs silo's own, self-contained dev server (#195 ADR 0029): serves the built docs site and
 * proxies `/api`,`/healthz` to the backend on its fixed port (ADR 0020 rev 4), the same target
 * `frontend/vite.config.ts`'s own dev proxy uses for the same reason — a real duplication (see ADR
 * 0029), accepted rather than solved with new shared machinery for one port number.
 */
export default defineConfig({
  plugins: [docsSite()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
});
