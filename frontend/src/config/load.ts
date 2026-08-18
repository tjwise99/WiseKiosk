import { validateConfiguration, type ConfigurationFault } from './validate';
import type { WiseKioskDisplayConfiguration } from './types';

/**
 * Where the page asks for its configuration. The file is static content the backend serves without
 * interpreting it, from the same origin as the bundle.
 */
export const CONFIGURATION_URL = '/config.json';

/**
 * The outcome of asking for a configuration and applying it. Every arm but `applied` is a failure
 * class the page has to render: absent, unfetchable, unparsable, or rejected by the schema.
 */
export type ConfigurationOutcome =
  | { readonly kind: 'applied'; readonly configuration: WiseKioskDisplayConfiguration }
  | { readonly kind: 'absent'; readonly detail: string }
  | { readonly kind: 'unfetchable'; readonly detail: string }
  | { readonly kind: 'unparsable'; readonly detail: string }
  | { readonly kind: 'rejected'; readonly faults: readonly ConfigurationFault[] }
  // Not produced here: the arm the page falls back to when applying a configuration throws
  // something this does not anticipate, so no path ends without a state to render.
  | { readonly kind: 'unreadable'; readonly detail: string };

/**
 * Fetches the configuration and runs it past the one validator. `no-store` bypasses every HTTP
 * cache, which is what makes the freshness floor the page's rather than a server header's
 * ([ADR 0007 rev 2](../../../docs/decisions/0007-config-validation-allocation.md)).
 */
export async function loadConfiguration(fetcher: typeof fetch = fetch): Promise<ConfigurationOutcome> {
  let response: Response;
  try {
    response = await fetcher(CONFIGURATION_URL, { cache: 'no-store' });
  } catch (cause) {
    return { kind: 'unfetchable', detail: describeCause(cause) };
  }

  if (response.status === 404) {
    return { kind: 'absent', detail: `${CONFIGURATION_URL} is not there` };
  }
  if (!response.ok) {
    return { kind: 'unfetchable', detail: `${response.status} ${response.statusText}`.trim() };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    return { kind: 'unparsable', detail: describeCause(cause) };
  }

  const result = validateConfiguration(parsed);
  return result.valid
    ? { kind: 'applied', configuration: result.configuration }
    : { kind: 'rejected', faults: result.faults };
}

/** A thrown value rendered as text, whatever was thrown. */
function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
