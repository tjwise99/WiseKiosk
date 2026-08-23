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
 * Whether the backend answered. Every failure is one answer — a refused connection, a timeout and a
 * 503 are all the backend not being reachable — so nothing here throws and there is no arm the
 * caller has to render separately.
 */
export async function checkLiveness(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(LIVENESS_URL, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}
