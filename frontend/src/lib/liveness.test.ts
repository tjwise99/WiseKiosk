import { describe, expect, it } from 'vitest';

import { checkLiveness } from './liveness';

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

  it('carries a deadline, and reports it unreachable when the ask is cut off at one', async () => {
    let deadline: AbortSignal | null | undefined;
    const wedged: typeof fetch = (_input, init) => {
      deadline = init?.signal;
      return Promise.reject(new DOMException('signal timed out', 'TimeoutError'));
    };

    expect(await checkLiveness(wedged)).toBe(false);
    expect(deadline).toBeInstanceOf(AbortSignal);
  });
});
