import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig, type Plugin } from 'vite';
import istanbul from 'vite-plugin-istanbul';

import viteConfig from './vite.config.ts';

const PRODUCT_REGISTRY = fileURLToPath(new URL('./src/lib/modules.ts', import.meta.url));
const STUB_REGISTRY = fileURLToPath(new URL('./tests/render/stubs/registry.ts', import.meta.url));

/**
 * Redirects the module registry to the render tier's, which is the product's augmented with the
 * framework stubs. Matched on the resolved path rather than on the import specifier, so it catches
 * every importer's spelling of it and nothing else. The stub registry's own import of the product
 * one is left alone, or the redirect would send that file to itself.
 */
function augmentRegistry(): Plugin {
  return {
    name: 'wisekiosk:augment-registry',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer === STUB_REGISTRY) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === PRODUCT_REGISTRY ? STUB_REGISTRY : null;
    },
  };
}

/**
 * The production configuration with the module registry augmented. The framework obligations are
 * read against shapes no product module has to supply — a box that overflows, a surface above the
 * emission ceiling — so the stubs are added rather than the product's entries replaced: a module's
 * own render test then exercises the registration the display ships with, which a substituted
 * registry could not tell apart from a registration that was never made.
 *
 * `build.assetsInlineLimit: 0` keeps every imported asset a served file rather than an inlined
 * `data:` URI (#266 security response headers).
 *
 * The Istanbul plugin only instruments when `VITE_COVERAGE=true` is set on the dev-server process
 * (`requireEnv: true`), which `playwright.coverage.config.ts` alone sets — `check-render` and
 * `check-render-policy` boot this same config without it, and a production `vite build` never loads
 * this file at all, so instrumented code cannot reach the shipped kiosk build.
 *
 * `.ts` and `.svelte` both: `frontend/scripts/merge-coverage.ts` unions this tier's coverage with
 * the unit tier's into one frontend-wide gate, so a `.ts` file the render tier also executes (a
 * module the page mounts, `config/load.ts`) is instrumented here too rather than only where the unit
 * tier reaches it — the same excludes `vitest.config.ts` states for the unit tier apply here so
 * neither a boundary-generated file nor a test file itself is instrumented as product code.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [
      augmentRegistry(),
      istanbul({
        include: 'src/**/*.{ts,svelte}',
        extension: ['.ts', '.svelte'],
        exclude: [
          'src/lib/boundary/**',
          'src/config/types.ts',
          'src/modules/weather/props.ts',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/*.d.ts',
        ],
        requireEnv: true,
      }),
    ],
    build: { assetsInlineLimit: 0, sourcemap: true },
  }),
);
