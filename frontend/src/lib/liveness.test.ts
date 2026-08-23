import { describe, expect, it } from 'vitest';

import { LIVENESS_INTERVAL_MS, LIVENESS_TIMEOUT_MS, checkLiveness } from './liveness';

/** A fetcher answering with `response`, whatever is asked of it. */
function answering(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

describe('the liveness check', () => {
  it('reports the backend reachable when it answers', async () => {
    expect(await checkLiveness(answering(new Response('ok', { status: 200 })))).toBe(true);
  });

  it('reports it unreachable when it answers with a failure', async () => {
    expect(await checkLiveness(answering(new Response('', { status: 503 })))).toBe(false);
  });

  it('reports it unreachable when the request throws rather than answering', async () => {
    const refused: typeof fetch = () => Promise.reject(new Error('connection refused'));

    expect(await checkLiveness(refused)).toBe(false);
  });

  it('reports it unreachable when its own deadline ends the ask', async () => {
    // The stub answers nothing at all, the way a process that accepts the connection and never
    // replies does. What ends the ask is the deadline the check attached to it, so this runs for
    // that deadline rather than resolving at once — a rejection handed in from outside would be the
    // case above, and would pass whether or not a deadline exists.
    const wedged: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });

    expect(await checkLiveness(wedged)).toBe(false);
  });

  it('bounds one ask inside the wait between two, so none overlaps the next', () => {
    expect(LIVENESS_TIMEOUT_MS).toBeLessThan(LIVENESS_INTERVAL_MS);
  });
});
