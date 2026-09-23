<script lang="ts">
  import { ParkWaitTimesState, type ParkWaitTimesPark, type ParkWaitTimesRide } from '../../lib/boundary/client';
  import {
    heldRides,
    hoursText,
    noOpenRides as ridesAreClosed,
    pageCount as pageCountOf,
    pageSlice,
    remainingRides,
    tourPadding as tourPaddingOf,
  } from './park_wait_times';
  import { registerMarquee, unregisterMarquee } from './marquee-clock';
  import type { Action } from 'svelte/action';

  /**
   * One park's card (./README.md § The card). Advances on the placement's single shared rotation
   * clock, passed in as `tick` (SRS059<!-- The park-wait-times module tours the remaining rides on
   * an interval its configuration sets -->), so every card flips on the same tick rather than each
   * running its own interval and drifting out of step with the others.
   */
  const {
    park,
    icon,
    tick,
  }: { park: ParkWaitTimesPark; icon: string | undefined; tick: number } = $props();

  /** How many rides the leaderboard holds, and how many the tour shows at a time — composition,
      fixed here rather than configured (./README.md § Leaderboard, § More waits). */
  const HELD_COUNT = 3;
  const TOUR_SIZE = 2;

  /** The Closed state's hidden skeleton row counts — always a full leaderboard (`HELD_COUNT`) and
      one full tour page (`TOUR_SIZE`), never this park's own rides: a stable reference so a Closed
      card reserves the same footprint a full card draws. */
  const SKELETON_LEADERBOARD_ROWS = Array.from({ length: HELD_COUNT }, (_unused, index) => index);
  const SKELETON_TOUR_ROWS = Array.from({ length: TOUR_SIZE }, (_unused, index) => index);

  const rides = $derived(park.rides ?? []);
  const held = $derived(heldRides(rides, HELD_COUNT));
  /** No ride reporting a length of time draws this park as closed (`.closed`, below). */
  const noOpenRides = $derived(ridesAreClosed(rides));
  const remaining = $derived(remainingRides(rides, held));
  const pageCount = $derived(pageCountOf(remaining.length, TOUR_SIZE));

  /** `tick` is the placement's shared advancing counter (ParkWaitTimes.svelte owns the one interval);
      read modulo `pageCount` everywhere below, so a payload that shrinks the pool between two ticks
      cannot leave this pointing past the end of it. */
  const page = $derived(tick % pageCount);
  const shown = $derived(pageSlice(remaining, page, TOUR_SIZE));
  const pages = $derived(Array.from({ length: pageCount }, (_unused, index) => index));
  /** A short last tour page draws hidden placeholder rows so the card keeps a full page's height
      (`data-pwt-tour-placeholder`, below) rather than shrinking on the final page. */
  const tourPadding = $derived(tourPaddingOf(shown.length, TOUR_SIZE));

  // The reduced-motion query is a constant for the life of the page, so the MediaQueryList is cached
  // rather than made fresh on every re-registration — each `matchMedia` call otherwise leaves a
  // document-retained object behind, promoted allocation that paces the periodic full GC on this
  // host (meta-wisekiosk #100 gpu-compositing).
  let reducedMotionQuery: MediaQueryList | undefined;
  function reducedMotion(): boolean {
    reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
    return reducedMotionQuery.matches;
  }

  /** A ride name too wide for its own column scrolls to reveal itself rather than growing the card
      (ParkWaitTimes.svelte's fixed `--pwt-card-width`). The motion belongs to the placement's one
      marquee clock (marquee-clock.ts), which scrolls the clipping column itself rather than
      translating the text inside it — the cheaper paint on this host
      (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->) — so this action only measures
      and registers. Honors `prefers-reduced-motion: reduce` by leaving the row static and
      unregistered. The row's own `{#each}` keys on its position, not the ride's name, so a re-sort
      leaves this node in place while the ride it shows changes underneath it;
      `use:marquee={ride.name}` re-runs the measurement (the action's `update`) on each such change
      and reconciles the registration both ways, so the column scrolls or sits static to match its
      current text without being rebuilt. */
  // The `string` parameter is the ride name; the action never reads it — Svelte watches it to fire
  // `update` when the ride under this row changes (`use:marquee={ride.name}`), and the measurement
  // reads the rendered geometry live rather than the name.
  const marquee: Action<HTMLElement, string> = (node) => {
    // node itself is an unconstrained inline-block sized to its own text; `.ride-name`, its parent,
    // is the clipping column that scrolls and the element registered against the clock. Captured
    // here, while the node is still in place: `destroy` can run with the node already detached.
    const column = node.parentElement as HTMLElement;
    let pending: number | null = null;

    // Measured next frame, not at mount: ParkWaitTimes.svelte sets `--pwt-card-width` on the grid
    // root, which mounts after this row's — reading `.ride-name`'s clientWidth before that applies
    // would catch it unconstrained and never find an overflow.
    function measure(): void {
      if (pending !== null) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        pending = null;
        const distance = column.scrollWidth - column.clientWidth;
        if (distance <= 0 || reducedMotion()) {
          // A name that fits — or a re-sort that moved a shorter ride under this row — does not
          // scroll: dropped here so a registration left by a previous, wider ride cannot keep a
          // now-fitting column moving, and returned home by `unregisterMarquee`.
          unregisterMarquee(column);
          node.classList.remove('marquee');
          return;
        }
        registerMarquee(column, distance);
        node.classList.add('marquee');
      });
    }

    measure();
    return {
      update: measure,
      destroy() {
        // The pending measurement too: left to fire, it would register a detached column the clock
        // would then hold and scroll for the life of the page.
        if (pending !== null) cancelAnimationFrame(pending);
        unregisterMarquee(column);
      },
    };
  };
</script>

<li class="card" data-pwt-card data-pwt-park={park.name}>
  <div class="header" data-pwt-header>
    <div class="identity">
      {#if icon}
        <!-- icon is one of this module's own bundled .svg files, inlined at build time via
             Vite's `?raw` import — never a network response or anything a viewer's configuration
             can reach. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span class="icon" data-pwt-icon aria-hidden="true">{@html icon}</span>
      {/if}
      <span class="name section-label">{park.name}</span>
    </div>
    {#if park.hours}
      <span class="hours" data-pwt-hours>{hoursText(park.hours)}</span>
    {/if}
  </div>

  {#snippet rideRow(ride: ParkWaitTimesRide)}
    <span class="ride-name" data-pwt-ride-name>
      <span class="ride-name-text" use:marquee={ride.name}>{ride.name}</span>
    </span>
    {#if ride.state === ParkWaitTimesState.Operating}
      <span class="wait tabular-figures" data-pwt-wait data-pwt-wait-kind="minutes">{ride.waitMinutes}</span>
    {:else}
      <span class="wait state" data-pwt-wait data-pwt-wait-kind="state">{ride.state}</span>
    {/if}
  {/snippet}

  {#snippet fullCardSkeleton()}
    <!-- Hidden, not absent: the skeleton reserves this frame's height at a full card's footprint,
         shared by the Closed state and a park-unavailable card alike. -->
    <ol class="leaderboard skeleton" aria-hidden="true">
      {#each SKELETON_LEADERBOARD_ROWS as index (index)}
        <li class="row"><span class="ride-name">&nbsp;</span></li>
      {/each}
    </ol>
    <div class="more skeleton" aria-hidden="true">
      <div class="more-divider"></div>
      <ol class="tour">
        {#each SKELETON_TOUR_ROWS as index (index)}
          <li class="row"><span class="ride-name">&nbsp;</span></li>
        {/each}
      </ol>
      <div class="footer"><span class="segment"></span></div>
    </div>
  {/snippet}

  {#if !park.available}
    <div class="full-frame">
      {@render fullCardSkeleton()}
      <p class="unavailable" data-pwt-unavailable>{park.message}</p>
    </div>
  {:else if noOpenRides}
    <div class="full-frame">
      {@render fullCardSkeleton()}
      <div class="closed" data-pwt-closed>
        {#if icon}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <span class="closed-icon" aria-hidden="true">{@html icon}</span>
        {/if}
        <span class="closed-label section-label" data-pwt-closed-label>Closed</span>
      </div>
    </div>
  {:else}
    <ol class="leaderboard" data-pwt-leaderboard>
      {#each held as ride, index (index)}
        <li class="row" data-pwt-leaderboard-row>
          {@render rideRow(ride)}
        </li>
      {/each}
    </ol>

    {#if remaining.length > 0}
      <div class="more" data-pwt-more-waits>
        <div class="more-divider" data-pwt-more-divider aria-hidden="true"></div>
        <ol class="tour">
          {#each shown as ride, index (index)}
            <li class="row" data-pwt-tour-row>
              {@render rideRow(ride)}
            </li>
          {/each}
          {#each tourPadding as index (index)}
            <li class="row" data-pwt-tour-placeholder aria-hidden="true">
              <span class="ride-name">&nbsp;</span>
            </li>
          {/each}
        </ol>
        <div class="footer" data-pwt-footer>
          {#each pages as index (index)}
            <span class="segment" class:filled={index === page} data-pwt-footer-segment></span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</li>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
    border: calc(var(--divider-stroke-width) * 2) solid var(--emission-stroke);
    border-radius: var(--space-sm);
    /* `--pwt-card-width` (ParkWaitTimes.svelte) is measured as a border box — the widest header's
       content plus this card's own padding and border. Without this, the grid's fixed column width
       would apply that total to the content box instead, growing every card past its own column. */
    box-sizing: border-box;
  }

  /* A failed park (`!park.available`) draws the reason over the hidden skeleton (`.skeleton`,
     below), holding the card's place at a full card's height. Reads left, this module's own
     default (`.park-wait-times`, ParkWaitTimes.svelte). */
  .unavailable {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  /* Shared by the park-unavailable message and the Closed state: the hidden skeleton (`.skeleton`,
     below) reserves this frame's height at a full card's footprint. */
  .full-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  /* Kept in layout, not painted: a `.leaderboard`/`.more` skeleton takes exactly the height its
     real counterpart would, without drawing anything — `.closed`/`.unavailable` (above) are what
     the card shows. */
  .skeleton {
    visibility: hidden;
  }

  .closed {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    /* The one exception to this module's own left default (`.park-wait-times`,
       ParkWaitTimes.svelte): centred, opted back in explicitly. */
    text-align: center;
  }

  .closed-icon {
    width: var(--type-annotation);
    height: var(--type-annotation);
    color: var(--emission-content);
  }

  .closed-icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .closed-label {
    font-size: var(--type-body);
    font-weight: var(--type-section-header-weight);
  }

  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    padding-bottom: var(--space-sm);
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
  }

  .icon {
    display: inline-flex;
    align-items: center;
    width: var(--type-body);
    height: var(--type-body);
    color: var(--emission-content);
  }

  .icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .name {
    font-size: var(--type-body);
    /* The card's most prominent row; weight decoupled from the size token here (./README.md §
       Type and spacing) so this name out-weights the row readings below. */
    font-weight: var(--type-section-header-weight);
    /* A park name never wraps, even where a ride name may need to scroll to be read in full
       (`.ride-name`, below) — the header is not part of that trade. */
    white-space: nowrap;
  }

  .hours {
    font-size: var(--type-section-header);
    /* The hours are the park name's quiet peer (./README.md § Header): section-header SIZE, body's
       lighter weight. */
    font-weight: var(--type-body-weight);
    white-space: nowrap;
  }

  .leaderboard,
  .tour {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour {
    gap: var(--space-sm);
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    font-size: var(--type-section-header);
    /* Row readings take body's own 600 weight at section-header SIZE, decoupled from the
       section-header token's 700 — the wait figure's explicit 700 (below) is the one bold mark on
       the row (./README.md § Type and spacing). */
    font-weight: var(--type-body-weight);
  }

  .ride-name {
    /* The name column — `flex: 1` takes every pixel the row's own gap leaves between it and
       `.wait`'s fixed reservation, so a name overflows only where it exceeds that whole width.
       `overflow: hidden` both clips a name too wide for the column and makes this the scroll
       container the marquee clock moves (marquee-clock.ts writes its `scrollLeft`). Reads left
       (`.park-wait-times`, ParkWaitTimes.svelte); `.wait` opts back to `right`. */
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .ride-name-text {
    /* Sized to its own text, unwrapped — what makes the column's content wider than the column, and
       so what gives `.ride-name` something to scroll. */
    display: inline-block;
    white-space: nowrap;
  }

  .wait {
    /* One constant reservation for the wait column, so it never moves under a changing value or
       between a numeric reading and a not-operating word (SRS058, SRS061). Reserves the width of the
       widest reading: the longest not-operating word, "REFURB"/"CLOSED" — six glyphs at the caption
       step, whose rendered width (glyphs plus tracking) runs ~4.75x that step, wider than a
       three-digit "999" at the larger figure step. Sized off the caption TOKEN, not the element's
       own `ch`, so both readings get this one width: `.wait.state` (below) draws at the caption step
       and `.wait` at the figure step, so a font-relative `ch` resolves to two different widths and
       shifts the column between them (proven by the constant-column render test below). */
    flex: 0 0 auto;
    min-width: calc(var(--type-caption) * 4.75);
    text-align: right;
    font-weight: 700;
    white-space: nowrap;
  }

  /* The not-operating state word, drawn as a different kind of mark from a figure
     (the park-wait-times UI design spec § The wait slot). */
  .wait.state {
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    text-transform: uppercase;
    letter-spacing: var(--type-section-header-tracking);
  }

  .more {
    display: flex;
    flex-direction: column;
    /* The divider-to-rows and rows-to-footer gaps are both this one flex gap (./README.md § Type
       and spacing), not a margin/padding on either neighbour. */
    gap: var(--space-md);
  }

  .more-divider {
    /* The rule separating the leaderboard from the tour rows — a bare divider, no label
       (./README.md § More waits). */
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
  }

  .footer {
    display: flex;
    gap: var(--space-xs);
  }

  .segment {
    flex: 1;
    height: var(--divider-stroke-width);
    background: var(--emission-stroke);
  }

  .segment.filled {
    background: var(--emission-content);
  }
</style>
