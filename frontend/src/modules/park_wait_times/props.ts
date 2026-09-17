/**
 * Pins the component's props to the boundary; `.svelte` props are opaque to `tsc`, so pinned here.
 * `just check-boundary` compiles this against a freshly regenerated client.
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
 * The failure arm, both ways round: what the component renders is projected off the bodies the
 * route answers with at every failing status.
 */
declare const drawnFailure: Extract<ParkWaitTimesProps['payload'], { state: 'unavailable' }>['failure'];
declare const servedFailure: Pick<postApiParkWaitTimesResponseError['data'], 'message'>;

/** Both arms, pinned in both directions. */
drawnReading satisfies postApiParkWaitTimesResponseSuccess['data'];
servedReading satisfies Extract<ParkWaitTimesProps['payload'], { state: 'ok' }>['data'];
drawnFailure satisfies Pick<postApiParkWaitTimesResponseError['data'], 'message'>;
servedFailure satisfies Extract<ParkWaitTimesProps['payload'], { state: 'unavailable' }>['failure'];
