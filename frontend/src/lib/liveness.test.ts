import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIVENESS_INTERVAL_MS, LIVENESS_TIMEOUT_MS, checkLiveness } from './liveness';

/**
 * Seams the ask at the global `fetch`, which is where the generated client makes it. The route and
 * the request are the client's, so a test hands in the answer rather than the fetcher.
 */
function asking(fetcher: typeof fetch): void {
  vi.stubGlobal('fetch', fetcher);
}

/** A fetcher answering with `response`, whatever is asked of it. */
function answering(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the liveness check', () => {
  it('reports the backend reachable when it answers', async () => {
    // Bodiless, the way the route answers: the schema declares no body, so the status is the answer.
    asking(answering(new Response(null, { status: 200 })));

    expect(await checkLiveness()).toBe(true);
  });

  it('reports it unreachable when it answers with a failure', async () => {
    asking(answering(new Response(null, { status: 503 })));

    expect(await checkLiveness()).toBe(false);
  });

  it('reports it unreachable when the request throws rather than answering', async () => {
    asking(() => Promise.reject(new Error('connection refused')));

    expect(await checkLiveness()).toBe(false);
  });

  it('reports it unreachable when its own deadline ends the ask', async () => {
    // The stub answers nothing at all, the way a process that accepts the connection and never
    // replies does. What ends the ask is the deadline the check attached to it, so this runs for
    // that deadline rather than resolving at once — a rejection handed in from outside would be the
    // case above, and would pass whether or not a deadline exists.
    asking(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );

    expect(await checkLiveness()).toBe(false);
  });

  it('bounds one ask inside the wait between two, so none overlaps the next', () => {
    expect(LIVENESS_TIMEOUT_MS).toBeLessThan(LIVENESS_INTERVAL_MS);
  });
});
