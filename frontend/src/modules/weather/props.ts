/**
 * The weather component's props, and the pinning of what they carry to the boundary the route
 * answers over. A `.svelte` file's props are opaque to `tsc`, so the type is declared here and the
 * component takes it; this file is compiled by `just check-boundary` against a freshly regenerated
 * client, which is what makes the pinning a check rather than a claim.
 */

import type { WeatherOptions } from '../../config/types';
import type {
  postApiWeatherResponseError,
  postApiWeatherResponseSuccess,
  WeatherPayload,
} from '../../lib/boundary/client';
import type { Payload } from '../../lib/payload';

/** What the host hands this module: whether the backend is there, the placement's configuration, and its payload. */
export interface WeatherProps {
  reachable: boolean;
  config: WeatherOptions;
  payload: Payload<WeatherPayload>;
}

/** The read arm as the component receives it, and as the route answers it at its one success status. */
declare const drawnReading: Extract<WeatherProps['payload'], { state: 'ok' }>['data'];
declare const servedReading: postApiWeatherResponseSuccess['data'];

/**
 * The failure arm, both ways round. What the component renders of a failure is projected off the
 * bodies the route answers with at every failing status, so it is pinned against the same projection
 * rather than against either body whole — the module renders the reason and nothing else of them.
 */
declare const drawnFailure: Extract<WeatherProps['payload'], { state: 'unavailable' }>['failure'];
declare const servedFailure: Pick<postApiWeatherResponseError['data'], 'message'>;

/**
 * Both arms, pinned in both directions: one direction alone admits a component reading a subset of
 * what it is handed, the other alone a component reading fields no answer carries.
 */
drawnReading satisfies postApiWeatherResponseSuccess['data'];
servedReading satisfies Extract<WeatherProps['payload'], { state: 'ok' }>['data'];
drawnFailure satisfies Pick<postApiWeatherResponseError['data'], 'message'>;
servedFailure satisfies Extract<WeatherProps['payload'], { state: 'unavailable' }>['failure'];
