/**
 * Files neither coverage tier instruments, and which `scripts/merge-coverage.ts`'s expected-file
 * glob does not require present: generated code, type-only declarations with no runtime statement to
 * instrument, and test/spec files themselves. Shared by `vite.config.render.ts`, `vitest.config.ts`
 * and `scripts/merge-coverage.ts` so the three populations can't drift apart.
 */
export const COVERAGE_EXCLUDE = [
  'src/lib/boundary/**',
  'src/config/types.ts',
  'src/modules/weather/props.ts',
  'src/lib/payload.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.d.ts',
];
