/**
 * The park-wait-times component's props, and the pinning of what they carry to the boundary the
 * route answers over. A `.svelte` file's props are opaque to `tsc`, so the pairing is declared here
 * rather than in the component, which narrows `CommonProps` to
 * `ParkWaitTimesOptions`/`Payload<ParkWaitTimesPayload>` via its own cast; this file is compiled by
 * `just check-boundary` against a freshly regenerated client, which is what makes the pinning a
 * check rather than a claim.
 */

import type { ParkWaitTimesOptions } from '../../config/types';
import type {
  postApiParkWaitTimesResponseError,
  postApiParkWaitTimesResponseSuccess,
  ParkWaitTimesPayload,
} from '../../lib/boundary/client';
import type { Payload } from '../../lib/payload';

/** What the host hands this module: whether the backend is there, the placement's configuration, and its payload. */
export interface ParkWaitTimesProps {
  reachable: boolean;
  config: ParkWaitTimesOptions;
  payload: Payload<ParkWaitTimesPayload>;
}

/** The read arm as the component receives it, and as the route answers it at its one success status. */
declare const drawnReading: Extract<ParkWaitTimesProps['payload'], { state: 'ok' }>['data'];
declare const servedReading: postApiParkWaitTimesResponseSuccess['data'];

/**
 * The failure arm, both ways round. What the component renders of a failure is projected off the
 * bodies the route answers with at every failing status, so it is pinned against the same projection
 * rather than against either body whole — the module renders the reason and nothing else of them.
 */
declare const drawnFailure: Extract<ParkWaitTimesProps['payload'], { state: 'unavailable' }>['failure'];
declare const servedFailure: Pick<postApiParkWaitTimesResponseError['data'], 'message'>;

/**
 * Both arms, pinned in both directions: one direction alone admits a component reading a subset of
 * what it is handed, the other alone a component reading fields no answer carries.
 */
drawnReading satisfies postApiParkWaitTimesResponseSuccess['data'];
servedReading satisfies Extract<ParkWaitTimesProps['payload'], { state: 'ok' }>['data'];
drawnFailure satisfies Pick<postApiParkWaitTimesResponseError['data'], 'message'>;
servedFailure satisfies Extract<ParkWaitTimesProps['payload'], { state: 'unavailable' }>['failure'];
