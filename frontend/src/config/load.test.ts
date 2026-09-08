import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONFIGURATION_URL, loadConfiguration } from './load';

/** A fetcher answering with `response`, ignoring what it is asked. */
function answering(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

describe('loadConfiguration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the global fetch when the caller names no fetcher of its own', async () => {
    const stub = vi.fn(answering(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', stub);

    await loadConfiguration();

    expect(stub).toHaveBeenCalledOnce();
  });

  it('applies a configuration the schema accepts', async () => {
    const body = JSON.stringify({ modules: [{ region: 'top_bar', module: 'clock' }] });
    const result = await loadConfiguration(answering(new Response(body, { status: 200 })));

    expect(result.kind).toBe('applied');
  });

  it('asks the one path the backend serves the configuration at', async () => {
    let asked: string | undefined;
    await loadConfiguration((input) => {
      asked = String(input);
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    expect(asked).toBe(CONFIGURATION_URL);
  });

  it('reports absent when the backend has none', async () => {
    const result = await loadConfiguration(answering(new Response(null, { status: 404 })));

    expect(result).toEqual({ kind: 'absent', detail: `${CONFIGURATION_URL} is not there` });
  });

  it('reports unfetchable when the backend answers a failure other than 404', async () => {
    const result = await loadConfiguration(
      answering(new Response(null, { status: 503, statusText: 'Service Unavailable' })),
    );

    expect(result).toEqual({ kind: 'unfetchable', detail: '503 Service Unavailable' });
  });

  it('reports unfetchable, by the thrown error’s message, when the request itself fails', async () => {
    const result = await loadConfiguration(() => Promise.reject(new Error('connection refused')));

    expect(result).toEqual({ kind: 'unfetchable', detail: 'connection refused' });
  });

  it('reports unfetchable, by its string form, when what is thrown is not an Error', async () => {
    const result = await loadConfiguration(() => Promise.reject('offline'));

    expect(result).toEqual({ kind: 'unfetchable', detail: 'offline' });
  });

  it('reports unparsable when the body is not JSON', async () => {
    const result = await loadConfiguration(answering(new Response('not json', { status: 200 })));

    expect(result.kind).toBe('unparsable');
  });

  it('reports rejected, carrying the validator’s faults, when the schema refuses the document', async () => {
    const result = await loadConfiguration(answering(new Response('[]', { status: 200 })));

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') {
      return;
    }
    expect(result.faults.length).toBeGreaterThan(0);
  });
});
