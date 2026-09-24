import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The marquee clock's own loop lifecycle: which registrations start the single
 * `requestAnimationFrame` loop and which stop it. The render tier reads what the loop *draws* — a
 * column's `scrollLeft` moving on the schedule (`park_wait_times.spec.ts`) — and cannot see whether
 * a frame callback is still running behind a torn-down placement, because a page holding a leaked
 * loop looks exactly like one that stopped. That is what this reads, so the two tiers answer
 * different questions about the same module rather than the same question twice.
 *
 * The module holds the loop in its own closure, so each case takes a fresh copy of it
 * (`vi.resetModules()` via the dynamic import below) rather than inheriting the registrations the
 * case before it left behind.
 */

/** The animation-frame scheduler the module is handed, standing in for the host's. Node has none,
    and a real one would make the loop's own bookkeeping unobservable: what these cases read is which
    handle was requested and which was cancelled. */
interface FakeFrames {
  /** Callbacks queued and not yet run or cancelled, by the handle `requestAnimationFrame` returned. */
  readonly queued: Map<number, FrameRequestCallback>;
  /** Every handle passed to `cancelAnimationFrame`, in order. */
  readonly cancelled: number[];
  /** Runs the single callback the loop has in flight, at `nowMs` on the module's own timebase. */
  runOneFrame(nowMs?: number): void;
}

let frames: FakeFrames;
let realRaf: typeof globalThis.requestAnimationFrame;
let realCaf: typeof globalThis.cancelAnimationFrame;

function installFakeFrames(): FakeFrames {
  const queued = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  let nextHandle = 1;

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = nextHandle++;
    queued.set(handle, callback);
    return handle;
  };
  globalThis.cancelAnimationFrame = (handle: number): void => {
    cancelled.push(handle);
    queued.delete(handle);
  };

  return {
    queued,
    cancelled,
    runOneFrame(nowMs = performance.now()) {
      // One in flight at a time by construction: `step` requests the next only as it returns.
      const [handle, callback] = [...queued.entries()][0] ?? [];
      if (handle === undefined || callback === undefined) {
        throw new Error('no animation frame in flight');
      }
      queued.delete(handle);
      callback(nowMs);
    },
  };
}

/** A column stands for its own `scrollLeft` and nothing else — the one property the loop writes. */
function aColumn(): HTMLElement {
  return { scrollLeft: 0 } as HTMLElement;
}

/** A fresh copy of the module, its registrations and its loop empty. */
async function freshClock(): Promise<typeof import('./marquee-clock')> {
  vi.resetModules();
  return import('./marquee-clock');
}

beforeEach(() => {
  realRaf = globalThis.requestAnimationFrame;
  realCaf = globalThis.cancelAnimationFrame;
  frames = installFakeFrames();
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCaf;
});

describe('registerMarquee', () => {
  it('starts the loop on the first column, and does not start a second for the next', async () => {
    const { registerMarquee } = await freshClock();

    registerMarquee(aColumn(), 100);
    expect(frames.queued.size, 'the first registration puts one frame in flight').toBe(1);

    registerMarquee(aColumn(), 100);
    expect(frames.queued.size, 'the second joins the loop already running rather than starting its own').toBe(1);
  });
});

describe('unregisterMarquee', () => {
  it('cancels the loop with the last column, leaving no frame callback running', async () => {
    const { registerMarquee, unregisterMarquee } = await freshClock();
    const column = aColumn();

    registerMarquee(column, 100);
    // The handle the loop is holding, taken before it is dropped: what makes the cancel below an
    // assertion about the frame in flight rather than about any number having been passed.
    const inFlight = [...frames.queued.keys()][0];

    unregisterMarquee(column);

    expect(frames.cancelled, 'the frame the loop held is the one cancelled').toEqual([inFlight]);
    expect(frames.queued.size, 'and nothing is left in flight behind a torn-down placement').toBe(0);
  });

  it('leaves the loop running while any other column is still registered', async () => {
    const { registerMarquee, unregisterMarquee } = await freshClock();
    const staying = aColumn();
    const leaving = aColumn();
    registerMarquee(staying, 100);
    registerMarquee(leaving, 100);

    unregisterMarquee(leaving);

    // The pair to the case above: the cancel is conditional on the last column leaving, not on any
    // column leaving, so a placement losing one row goes on scrolling the rest.
    expect(frames.cancelled, 'no frame is cancelled while a column still needs one').toEqual([]);
    expect(frames.queued.size, 'the loop is still in flight').toBe(1);
  });

  it('returns a dropped column home', async () => {
    const { registerMarquee, unregisterMarquee } = await freshClock();
    const column = aColumn();
    registerMarquee(column, 100);
    // Driven far enough into the cycle to be away from home, so "home" below is a value the drop
    // wrote rather than one it never left.
    frames.runOneFrame(performance.now() + 4000);
    expect(column.scrollLeft, 'the column has left home before it is dropped').toBeGreaterThan(0);

    unregisterMarquee(column);

    expect(column.scrollLeft, 'a dropped column is put back rather than left mid-scroll').toBe(0);
  });

  it('does nothing for a column it never held, the loop included', async () => {
    const { registerMarquee, unregisterMarquee } = await freshClock();
    registerMarquee(aColumn(), 100);

    unregisterMarquee(aColumn());

    // An unknown column must not be allowed to take the running loop down with it — the registered
    // column above is still owed its frames.
    expect(frames.cancelled, 'an unheld column cancels nothing').toEqual([]);
    expect(frames.queued.size, 'and leaves the loop in flight for the column that is held').toBe(1);
  });

  it('starts a fresh loop when a column registers after the last one left', async () => {
    const { registerMarquee, unregisterMarquee } = await freshClock();
    const first = aColumn();
    registerMarquee(first, 100);
    unregisterMarquee(first);
    expect(frames.queued.size).toBe(0);

    const second = aColumn();
    registerMarquee(second, 100);

    // The teardown left no frame in flight, so this registration has to start one: without it a
    // placement re-entered after every row left would sit still for the life of the page.
    expect(frames.queued.size, 'the loop runs again for a column registered after the teardown').toBe(1);
  });
});
