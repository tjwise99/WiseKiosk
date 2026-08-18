import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig, type Plugin } from 'vite';

import viteConfig from './vite.config.ts';

const PRODUCT_REGISTRY = fileURLToPath(new URL('./src/lib/modules.ts', import.meta.url));
const STUB_REGISTRY = fileURLToPath(new URL('./tests/render/stubs/registry.ts', import.meta.url));

/**
 * Redirects the module registry to the render tier's stubs. Matched on the resolved path rather than
 * on the import specifier, so it catches every importer's spelling of it and nothing else.
 */
function stubRegistry(): Plugin {
  return {
    name: 'wisekiosk:stub-registry',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === PRODUCT_REGISTRY ? STUB_REGISTRY : null;
    },
  };
}

/**
 * The production configuration with the module registry substituted. The registry is the one thing a
 * render test cannot use as it ships — the product's is empty until the first module lands — so it
 * is replaced here rather than made overridable in the product.
 */
export default mergeConfig(viteConfig, defineConfig({ plugins: [stubRegistry()] }));
