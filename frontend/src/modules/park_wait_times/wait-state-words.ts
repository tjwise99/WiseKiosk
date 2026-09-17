import { ParkWaitTimesState } from '../../lib/boundary/client';

/**
 * The not-operating word set
 * (SRS061<!-- The park-wait-times module draws a wait as the time or the not-operating state it is
 * handed -->), read from the generated boundary enum
 * (boundary/openapi.yaml's ParkWaitTimesState) so the width reservation
 * (ParkWaitTimes.svelte's waitColumnWidthPx) reads the one set both sides derive from, rather than
 * a hand-kept copy.
 */
export const WAIT_STATE_WORDS = Object.values(ParkWaitTimesState).filter(
  (state) => state !== ParkWaitTimesState.Operating,
);
