import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig, type Plugin } from 'vite';

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
 */
export default mergeConfig(viteConfig, defineConfig({ plugins: [augmentRegistry()] }));
