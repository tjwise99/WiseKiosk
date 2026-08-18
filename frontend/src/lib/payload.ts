import type { components } from './boundary/schema';

/** The body a module's failed data request carries back. */
export type UpstreamFailure = components['schemas']['UpstreamFailure'];

/** The body a request rejected before any upstream call carries back. */
export type ClientRejection = components['schemas']['ClientRejection'];

/**
 * What asking for a module's payload produced. `unreadable` is the page's own knowledge that it got
 * something it could not read, not a body the boundary defines.
 */
export type PayloadOutcome<Payload> =
  | { readonly kind: 'payload'; readonly payload: Payload }
  | { readonly kind: 'failure'; readonly failure: UpstreamFailure | ClientRejection }
  | { readonly kind: 'unreadable'; readonly detail: string };

/**
 * Asks the backend for one module's payload. Both error bodies are the types generated from the
 * boundary schema rather than shapes declared here
 * ([ADR 0008 rev 2](../../../docs/decisions/0008-boundary-contract-openapi-codegen.md)), and nothing
 * re-validates a body against the schema: agreement rests on the schema and its drift gate. The two
 * error components share `cause` and `message`, so a caller renders a failure without telling them
 * apart.
 */
export async function fetchPayload<Payload>(
  source: string,
  fetcher: typeof fetch = fetch,
): Promise<PayloadOutcome<Payload>> {
  const response = await fetcher(`/api/${source}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return {
      kind: 'unreadable',
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }

  return response.ok
    ? { kind: 'payload', payload: body as Payload }
    : { kind: 'failure', failure: body as UpstreamFailure | ClientRejection };
}
