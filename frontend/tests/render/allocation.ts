import type { Page } from '@playwright/test';

/**
 * Counts the page's use of the four allocation-heavy platform APIs a display module is easiest to
 * misuse from a timer callback. The counters are installed as an init script, so they are in place
 * before any bundle code runs and are re-installed by the navigation `render` makes.
 *
 * What is counted is *calls*, not bytes. A heap reading is the direct measure and is not available
 * here: the page under test is a browser process the runner drives, and what the deployed host's
 * collector responds to is promoted-object churn, which no number the browser exposes reports
 * separately. A call count over these four is deterministic under a driven clock — the same fixture
 * counts the same on every run and on every machine — and each of the four is a known driver of
 * exactly that churn (meta-wisekiosk #100 gpu-compositing):
 *
 * - **`matchMedia`** allocates a `MediaQueryList` the document retains for its lifetime, so a call
 *   from a per-tick path is an unbounded retained set rather than transient garbage.
 * - **An `Intl` formatter construction** builds and caches a locale-resolved object an order of
 *   magnitude more expensive than the formatting it performs; one built per tick is the whole cost
 *   paid per tick rather than once.
 * - **A format call** walks the formatter's parts and allocates the strings (and, for
 *   `formatToParts`, the part objects) it returns. Cheap against a construction, not against doing
 *   nothing, and a string re-formatted per second when one field of it changes per minute is the
 *   clock's share of the churn.
 * - **A node creation** is the re-render's own cost: a module re-drawing its subtree per tick
 *   promotes a subtree's worth of objects per tick, which is the dominant driver measured on the
 *   board.
 */
export interface AllocationCounts {
  /** `window.matchMedia` calls. */
  matchMedia: number;
  /** `Intl` formatter objects built, by `new` or by call. */
  intlConstructions: number;
  /** Formatting performed: a formatter's own methods, and the `toLocale*`/`localeCompare` paths that
      format through an engine-internal one. */
  intlFormatCalls: number;
  /** DOM nodes created: `document.create*`, and `cloneNode`, which is how Svelte 5 instantiates a
      template rather than element by element. */
  nodesCreated: number;
}

/** The counter names, so a caller can walk a reading without restating them. */
export const COUNTERS = [
  'matchMedia',
  'intlConstructions',
  'intlFormatCalls',
  'nodesCreated',
] as const satisfies readonly (keyof AllocationCounts)[];

/**
 * Wraps the counted APIs, in the page. Serialised into it, so it reaches nothing declared out here
 * and names every API itself. Idempotent: a second run over a document already wrapped returns,
 * rather than double-counting through two layers of wrapper.
 *
 * The `Intl` constructors are read off `Intl` itself by `getOwnPropertyNames` rather than listed, so
 * a formatter class the engine gains — or one a module starts using — is counted without this file
 * being edited. Their formatting methods are taken the same way, off each prototype, and both the
 * data-property form (`formatToParts`) and the accessor form (`format`, which ECMA-402 defines as a
 * getter returning a bound function) are re-installed in the form they were found in.
 */
function countAllocations(): void {
  type Counts = Record<string, number>;
  const held = window as unknown as { __allocationCounts?: Counts };
  if (held.__allocationCounts) {
    return;
  }
  const counts: Counts = {
    matchMedia: 0,
    intlConstructions: 0,
    intlFormatCalls: 0,
    nodesCreated: 0,
  };
  held.__allocationCounts = counts;

  type Unknowns = (...args: unknown[]) => unknown;
  /** Replaces `object[name]` with a counting wrapper, where it is a function to begin with. */
  const countCalls = (object: object, name: string, counter: string): void => {
    const held = object as Record<string, Unknowns>;
    const asked = held[name];
    if (typeof asked !== 'function') {
      return;
    }
    held[name] = function (this: unknown, ...args: unknown[]): unknown {
      counts[counter] += 1;
      return asked.apply(this, args);
    };
  };

  countCalls(window, 'matchMedia', 'matchMedia');

  for (const name of ['createElement', 'createElementNS', 'createTextNode', 'createComment']) {
    countCalls(Document.prototype, name, 'nodesCreated');
  }
  countCalls(Node.prototype, 'cloneNode', 'nodesCreated');

  for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    countCalls(Date.prototype, name, 'intlFormatCalls');
  }
  countCalls(Number.prototype, 'toLocaleString', 'intlFormatCalls');
  countCalls(BigInt.prototype, 'toLocaleString', 'intlFormatCalls');
  countCalls(String.prototype, 'localeCompare', 'intlFormatCalls');

  // Every formatting method a formatter prototype carries, by the shape of its name: each of them
  // walks the resolved formatter and allocates what it returns, and naming them by shape rather
  // than one by one is what carries a method a future class adds.
  const formatting = /^(format|select|compare|segment)/;
  for (const name of Object.getOwnPropertyNames(Intl)) {
    const intl = Intl as unknown as Record<string, Unknowns>;
    const asked = intl[name];
    if (typeof asked !== 'function' || typeof asked.prototype !== 'object') {
      continue;
    }

    const proto = asked.prototype as object;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (!formatting.test(method)) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(proto, method);
      if (descriptor?.value !== undefined) {
        countCalls(proto, method, 'intlFormatCalls');
      } else if (typeof descriptor?.get === 'function') {
        // `format` is an accessor whose getter returns a bound function. Counting the getter would
        // count the binding rather than the formatting, so the returned function is what is wrapped.
        const askedGet = descriptor.get;
        Object.defineProperty(proto, method, {
          ...descriptor,
          get(this: unknown): unknown {
            const bound = askedGet.call(this) as Unknowns;
            return function (this: unknown, ...args: unknown[]): unknown {
              counts.intlFormatCalls += 1;
              return bound.apply(this, args);
            };
          },
        });
      }
    }

    // The constructor. Both call forms are counted — ECMA-402 lets several of these be called
    // without `new` — and `new.target` is forwarded so a subclass still resolves its own prototype.
    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      counts.intlConstructions += 1;
      return new.target === undefined
        ? asked(...args)
        : Reflect.construct(asked as never, args, new.target as never);
    };
    Object.defineProperty(wrapped, 'name', { value: name });
    wrapped.prototype = proto;
    Object.setPrototypeOf(wrapped, asked);
    intl[name] = wrapped as Unknowns;
  }
}

/**
 * Installs the counters for every document this page loads from here on. Called before `render`,
 * since an init script registered after the navigation misses the load — and the load is where a
 * module mounts.
 */
export async function countAllocationsIn(page: Page): Promise<void> {
  await page.addInitScript(countAllocations);
}

/** The counters as the page holds them now. */
export async function readAllocations(page: Page): Promise<AllocationCounts> {
  return page.evaluate(
    () => (window as unknown as { __allocationCounts: AllocationCounts }).__allocationCounts,
  );
}

/** `later` less `earlier`, counter by counter. */
export function growth(later: AllocationCounts, earlier: AllocationCounts): AllocationCounts {
  const difference = {} as AllocationCounts;
  for (const counter of COUNTERS) {
    difference[counter] = later[counter] - earlier[counter];
  }
  return difference;
}
