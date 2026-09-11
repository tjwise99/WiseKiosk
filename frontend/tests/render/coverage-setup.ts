import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Runs once before any coverage-project worker starts. Clears last run's raw coverage and report,
 * rather than letting `coverage-teardown.ts` fold a stale worker's file into this run's map — a run
 * with fewer workers than the last would otherwise still pick up the extra ones' leftovers.
 */
export default async function globalSetup(): Promise<void> {
  await rm(fileURLToPath(new URL('../../coverage/render', import.meta.url)), {
    recursive: true,
    force: true,
  });
}
