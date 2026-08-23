/**
 * Where the page asks whether the backend is still there. The endpoint consults nothing and answers
 * from the process alone, on the same origin as the bundle.
 */
export const LIVENESS_URL = '/healthz';

/**
 * How long the page waits between asks. The value is held in code rather than in the configuration
 * surface, and bounds how long the display can be wrong about the backend being there — the figure
 * itself is reconciled with the rest of the cadences by #6 cadence and TTL values.
 */
export const LIVENESS_INTERVAL_MS = 5000;

/**
 * How long one ask may take before it counts as no answer. A process that accepts the connection and
 * never answers is the outage nothing else in a deployment acts on
 * ([`DEPLOYMENT.md`](../../../docs/DEPLOYMENT.md) § The health signal), and the browser's own
 * network timeout is minutes away. Shorter than the interval, so at most one ask is ever in flight.
 */
export const LIVENESS_TIMEOUT_MS = 2000;

/**
 * Whether the backend answered. Every failure is one answer — a refused connection, an ask cut off at
 * its deadline and a 503 are all the backend not being reachable — so nothing here throws and there
 * is no arm the caller has to render separately.
 */
export async function checkLiveness(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(LIVENESS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
