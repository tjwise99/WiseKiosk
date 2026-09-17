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

  /**
   * One park's card (./README.md § The card). Owns its rotation timer, independent per card
   * (SRS059<!-- The park-wait-times module tours the remaining rides on an interval its
   * configuration sets -->).
   */
  const {
    park,
    icon,
    rotationSeconds,
  }: { park: ParkWaitTimesPark; icon: string | undefined; rotationSeconds: number } = $props();

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
  /** No ride reporting a length of time draws this park as closed (`.closed`, below); distinct
      from `!park.available`, a failed reading — this is a successful one that found nothing open. */
  const noOpenRides = $derived(ridesAreClosed(rides));
  const remaining = $derived(remainingRides(rides, held));
  const pageCount = $derived(pageCountOf(remaining.length, TOUR_SIZE));

  /** The raw advancing counter; read modulo `pageCount` everywhere below, so a payload that shrinks
      the pool between two ticks cannot leave this pointing past the end of it. */
  let tick = $state(0);
  $effect(() => {
    const toggle = setInterval(() => {
      tick++;
    }, rotationSeconds * 1000);
    return () => clearInterval(toggle);
  });

  const page = $derived(tick % pageCount);
  const shown = $derived(pageSlice(remaining, page, TOUR_SIZE));
  const tourPadding = $derived(tourPaddingOf(shown.length, TOUR_SIZE));
  const pages = $derived(Array.from({ length: pageCount }, (_unused, index) => index));

  /** A ride name too wide for its own column scrolls to reveal itself (`.marquee`'s keyframes,
      below) rather than growing the card (ParkWaitTimes.svelte's fixed `--pwt-card-width`).
      `transform` is the one property animated — a compositor can move it without a layout pass —
      and only an overflowing row ever carries the class
      (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->). Honors
      `prefers-reduced-motion: reduce` by leaving the row static. Read once: `rideRow` keys each row
      on the ride's own name. */
  function marquee(node: HTMLElement): void {
    // Measured next frame, not at mount: ParkWaitTimes.svelte's `cardGeometry` sets
    // `--pwt-card-width`/`--pwt-wait-width` on the grid root, which mounts after this row's —
    // reading `.ride-name`'s clientWidth before that applies would catch it unconstrained and
    // never find an overflow.
    requestAnimationFrame(() => {
      // node itself is an unconstrained inline-block, sized to its own text — `.ride-name`, its
      // parent, is the clipping column `scrollWidth` must be read against.
      const column = node.parentElement as HTMLElement;
      const overflow = node.scrollWidth - column.clientWidth;
      if (overflow <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      node.style.setProperty('--pwt-marquee-distance', `-${overflow}px`);
      node.classList.add('marquee');
    });
  }
</script>

<li class="card" data-pwt-card data-pwt-park={park.id}>
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
      <span class="ride-name-text" use:marquee>{ride.name}</span>
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
      {#each held as ride (ride.name)}
        <li class="row" data-pwt-leaderboard-row>
          {@render rideRow(ride)}
        </li>
      {/each}
    </ol>

    {#if remaining.length > 0}
      <div class="more" data-pwt-more-waits>
        <div class="more-divider" data-pwt-more-divider aria-hidden="true"></div>
        <ol class="tour">
          {#each shown as ride (ride.name)}
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
    /* `--pwt-card-width` (ParkWaitTimes.svelte's `headerWidthPx`) is computed as a border box —
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
       (`.ride-name-text.marquee`, below) — the header is not part of that trade. */
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
    /* The name column — fixed by `flex: 1` against `.wait`'s own fixed reservation. `overflow:
       hidden` is what a name too wide for it scrolls inside of (`.ride-name-text.marquee`, below).
       Reads left (`.park-wait-times`, ParkWaitTimes.svelte); `.wait` opts back to `right`. */
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .ride-name-text {
    /* The element `marquee` measures and, for a name that overflows, animates — kept apart from
       `.ride-name`'s own clipping box so the translation moves the text, not the column. */
    display: inline-block;
    white-space: nowrap;
  }

  /* :global — `marquee` adds this class imperatively (`classList.add`), which the compiler cannot
     see statically the way a `class:` directive would, and would otherwise prune as unused. */
  .ride-name-text:global(.marquee) {
    animation: pwt-marquee 8s ease-in-out infinite;
  }

  /* Paused at the start, scrolled left to reveal the end, paused, snapped back — the 65.01%/100%
     pair is what makes the reset read as a snap rather than a visible reverse scroll. */
  @keyframes pwt-marquee {
    0%,
    15% {
      transform: translateX(0);
    }
    50%,
    65% {
      transform: translateX(var(--pwt-marquee-distance));
    }
    65.01%,
    100% {
      transform: translateX(0);
    }
  }

  .wait {
    /* Fixed by ParkWaitTimes.svelte's `--pwt-wait-width` — long enough for whichever not-operating
       word or worst-case figure a wait is ever handed, so the column never moves under a changing
       value and never shrinks the name column to make room for one that just grew. */
    flex: 0 0 auto;
    min-width: var(--pwt-wait-width);
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
