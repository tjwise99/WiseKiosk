/**
 * The placement's one marquee clock: a single `requestAnimationFrame` loop that scrolls every
 * overflowing ride-name column (ParkCard.svelte's `marquee`), and one cycle timestamp they all read.
 *
 * A scroll, not a transform. On the deployed host, painting a clipped container's `scrollLeft` costs
 * a fraction of `transform: translateX` with every marquee moving — measured at 38 fps against 14
 * (meta-wisekiosk #100 gpu-compositing, SRS021<!-- Frontend runs on a Pi Zero-class browser host
 * -->). One loop for the whole page rather than one per row holds the frame cost to a single
 * callback whatever the roster size, and the per-frame work is a `scrollLeft` write and nothing
 * else: a geometry or computed-style read here would spend the paint win the mechanism exists for,
 * so each column's distance is measured at registration and cached.
 *
 * One timestamp read by every column is what starts them together, and ParkWaitTimes.svelte resets
 * it on the same rotation tick the cards flip on (SRS059<!-- The park-wait-times module tours the
 * remaining rides on an interval its configuration sets -->) — a card flip and a marquee restart are
 * one event on one clock rather than two that drift apart. Staggering the starts to spread their
 * first paint was measured on the board and rejected: it left the stall rate unchanged (0.042/s
 * against 0.04/s, still clustered at the scroll-start) and bought nothing for the synchronized start
 * it gave up.
 */

/** The one pace every name scrolls at, px/s. Constant velocity across rows: a longer name takes
    proportionally longer to reveal itself rather than dashing to fit a shared duration. */
export const MARQUEE_PX_PER_S = 30;

/** Still at home before the scroll, seconds — long enough to read the start of the name, and enough
    to keep the motion clear of the card flip's own repaint: starting on the flip itself puts the two
    in the same frames and reads as a stutter. */
export const HOLD_HOME_S = 2;

/** Still at the end after the scroll, seconds, so the end of a name can be read before its column
    jumps home. */
export const HOLD_END_S = 2;

/** Each registered column against the distance it scrolls — its own `scrollWidth - clientWidth`,
    measured at registration and re-measured only when the ride under the row changes. */
const columns = new Map<HTMLElement, number>();

/** The frame request in flight, or null while no column is registered. */
let frame: number | null = null;

/** When the current cycle started. `registerMarquee` sets it before the first frame runs. */
let cycleStartMs = 0;

/**
 * One frame: every column moved to its own point in the shared cycle. Four phases off the one
 * elapsed time — held home for `HOLD_HOME_S`, scrolled to the end at `MARQUEE_PX_PER_S`, held there
 * for `HOLD_END_S`, then home again until the next reset. Once per cycle, never looped:
 * `startMarqueeCycle` is the only thing that begins another.
 *
 * Every column reads the one elapsed time, so they leave home on the same frame. Each column's
 * `moveTime` is its own (`distance / MARQUEE_PX_PER_S`), so the rows share a velocity rather than a
 * duration and reach their ends at different moments. A name needing more travel than the cycle
 * leaves it — `MARQUEE_PX_PER_S × (rotation_interval_seconds - HOLD_HOME_S - HOLD_END_S)`, well above
 * observed geometry at `rotation_interval_seconds`'s schema default — is cut short by the reset
 * rather than speeding up to fit.
 */
function step(nowMs: number): void {
  // Floored at zero: a cycle reset timestamped inside an interval callback can sit later than the
  // frame timestamp of the frame already in flight, which would otherwise read as negative elapsed.
  const elapsed = Math.max(0, (nowMs - cycleStartMs) / 1000);
  for (const [column, distance] of columns) {
    const moveTime = distance / MARQUEE_PX_PER_S;
    // The two home phases share a branch; `Math.min` covers the rest, clamping the ramp to
    // `distance` for the whole of the end hold rather than needing a phase test of its own.
    column.scrollLeft =
      elapsed < HOLD_HOME_S || elapsed >= HOLD_HOME_S + moveTime + HOLD_END_S
        ? 0
        : Math.min((elapsed - HOLD_HOME_S) * MARQUEE_PX_PER_S, distance);
  }
  frame = requestAnimationFrame(step);
}

/** Starts a cycle — every registered column scrolls from home again, together. ParkWaitTimes.svelte
    calls this on the rotation tick that flips the cards. */
export function startMarqueeCycle(): void {
  cycleStartMs = performance.now();
}

/** Registers a column, or re-measures one already registered; `distance` is its own
    `scrollWidth - clientWidth`. A column registering while the loop runs joins the cycle in flight,
    at the phase every other column is already at. */
export function registerMarquee(column: HTMLElement, distance: number): void {
  columns.set(column, distance);
  if (frame !== null) return;
  // The loop starting from empty is a cycle boundary in its own right: without this, a stale
  // `cycleStartMs` left by the previous teardown reads as a cycle already run out, and every column
  // would sit home unscrolled until the next rotation tick.
  cycleStartMs = performance.now();
  frame = requestAnimationFrame(step);
}

/** Drops a column and returns it home. Cancels the loop with the last one, so a torn-down placement
    leaves no frame callback running. */
export function unregisterMarquee(column: HTMLElement): void {
  if (!columns.delete(column)) return;
  column.scrollLeft = 0;
  if (columns.size === 0 && frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}
