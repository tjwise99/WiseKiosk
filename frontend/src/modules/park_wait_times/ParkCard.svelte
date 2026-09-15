<script lang="ts">
  import type { ParkWaitTimesPark, ParkWaitTimesRide } from '../../lib/boundary/client';

  /**
   * One park's card (./README.md § The card, top to bottom). Owns its own rotation timer — each
   * card's tour runs independent of every other's (./README.md § More waits;
   * SRS059<!-- The park-wait-times module tours the remaining rides on an interval its
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

  /** A ride's wait is either a number of minutes or one of the not-operating state words
      (boundary/openapi.yaml's ParkWaitTimesWait); this is the one place that is told apart. */
  function isMinutes(wait: unknown): wait is number {
    return typeof wait === 'number';
  }

  /**
   * The park's numeric-wait rides ranked worst first, longest wait leading
   * (SRS058<!-- The park-wait-times module keeps each park's longest current waits in view -->). A
   * not-operating ride carries no minute figure to rank by and is not among these — it is not
   * dropped from the reading, it tours instead (`remaining`, below).
   */
  function ranked(rides: ParkWaitTimesRide[]): ParkWaitTimesRide[] {
    return rides.filter((ride) => isMinutes(ride.wait)).sort((a, b) => (b.wait as number) - (a.wait as number));
  }

  const rides = $derived(park.rides ?? []);
  const held = $derived(ranked(rides).slice(0, HELD_COUNT));
  /** No ride reporting a length of time — not a schedule or an hours comparison, purely the ride
      data itself — draws this park as closed (`.closed`, below) in place of its leaderboard and
      tour. Distinct from `!park.available`, a failed reading; this is a successful one that simply
      found nothing open. */
  const noOpenRides = $derived(held.length === 0);
  /** Everything the leaderboard does not hold, in the source's own order — the tour reaches all of
      it eventually rather than reordering it around the leaderboard's own ranking. */
  const remaining = $derived(rides.filter((ride) => !held.includes(ride)));
  const pageCount = $derived(Math.max(1, Math.ceil(remaining.length / TOUR_SIZE)));

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
  const shown = $derived(remaining.slice(page * TOUR_SIZE, page * TOUR_SIZE + TOUR_SIZE));
  /** How many blank rows the tour's *current* page is short of a full one — zero on every page
      except a last page whose remainder does not divide evenly by `TOUR_SIZE`; that one page alone
      is padded with blank rows of the same row height, so the footer beneath the tour holds its
      normal line rather than moving up for having one fewer ride to show. A full page carries no
      padding at all — there is nothing permanent reserved here, unlike a fixed `TOUR_SIZE`-slot
      pool would be. */
  const tourPadding = $derived(
    Array.from({ length: TOUR_SIZE - shown.length }, (_unused, index) => index),
  );
  const pages = $derived(Array.from({ length: pageCount }, (_unused, index) => index));

  /** The hours right-aligned in the header — a plain `HH:MM` read off each timestamp's own local
      clock, dropped straight from the string rather than re-read against the host's zone. */
  function clockTime(iso: string): string {
    const match = /T(\d{2}):(\d{2})/.exec(iso);
    return match ? `${match[1]}:${match[2]}` : iso;
  }

  /** A ride name too wide for its own column scrolls to reveal itself — paused, scrolled left to
      the end, paused, snapped back, on loop (`.marquee`'s own keyframes, below) — rather than
      growing the card (ParkWaitTimes.svelte's fixed `--pwt-card-width`); a name that already fits
      is left static. `transform` is the one property animated, the one a
      compositor can move without a layout pass, and only a row that actually overflows ever carries
      the class — this module's deployment target is a Pi Zero
      (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->). Honors
      `prefers-reduced-motion: reduce` by leaving the row static; the full name is in the DOM either
      way, scrolling being how it is read rather than whether it is there. Read once: the ride a row
      is for does not change under it — `rideRow`, below, keys each row on the ride's own name. */
  function marquee(node: HTMLElement): void {
    // Measured next frame, not at mount: ParkWaitTimes.svelte's `cardGeometry` sets the grid's
    // `--pwt-card-width`/`--pwt-wait-width` from its own action on the grid's own root, which
    // mounts after this row's — reading `.ride-name`'s clientWidth before that has applied would
    // catch it unconstrained (still its own content's width) and never find an overflow.
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

<li class="card" class:card-closed={park.available && noOpenRides} data-pwt-card data-pwt-park={park.id}>
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
      <span class="hours" data-pwt-hours>{clockTime(park.hours.open)}–{clockTime(park.hours.close)}</span>
    {/if}
  </div>

  {#snippet rideRow(ride: ParkWaitTimesRide)}
    <span class="ride-name" data-pwt-ride-name>
      <span class="ride-name-text" use:marquee>{ride.name}</span>
    </span>
    {#if isMinutes(ride.wait)}
      <span class="wait tabular-figures" data-pwt-wait data-pwt-wait-kind="minutes">{ride.wait}</span>
    {:else}
      <span class="wait state" data-pwt-wait data-pwt-wait-kind="state">{ride.wait}</span>
    {/if}
  {/snippet}

  {#if !park.available}
    <p class="unavailable" data-pwt-unavailable>{park.message}</p>
  {:else if noOpenRides}
    <div class="closed" data-pwt-closed>
      {#if icon}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span class="closed-icon" aria-hidden="true">{@html icon}</span>
      {/if}
      <span class="closed-label section-label" data-pwt-closed-label>Closed</span>
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
    /* `--pwt-card-height` (below) is `getBoundingClientRect().height` — a border box. Without this,
       `min-height`'s content-box default would add this card's own padding and border on top of
       that measurement a second time, growing the Closed card past the full card it is meant to
       match. */
    box-sizing: border-box;
  }

  /* Only the Closed card — the one with real content shorter than a real park's leaderboard plus
     its own More Waits block — is forced to match: `--pwt-card-height` (ParkWaitTimes.svelte's
     `cardHeightPx`) is the tallest card actually laid out, in practice a full card. An open card is
     left at its own natural height, so it never holds slack for `.closed`'s centring to fill and
     there is nothing between its own leaderboard and More Waits but the card's own `gap` above. */
  .card-closed {
    min-height: var(--pwt-card-height);
  }

  .unavailable {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  /* A park with no ride reporting a length of time (`noOpenRides`) draws its icon and `Closed` in
     place of the leaderboard and tour, filling the rest of the card's own box — `flex: 1` against
     `.card`'s column so this centres in the height `.card-closed` (above) forces, rather than
     leaving the card short and misaligned with its neighbours. */
  .closed {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
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
    /* The card's most prominent element leads its rows — at the owner-stepped body SIZE but the
       heavier weight, so the identity carries by size, weight, and its uppercase-tracked idiom
       together (./README.md § Type and spacing). Weight is decoupled from the size token here
       because the shared tokens pair section-header's 700 with a smaller size than body's; the row
       readings below take body's own 600 weight so this name out-weights them. */
    font-weight: var(--type-section-header-weight);
    /* A park name never wraps, even where a ride name may need to scroll to be read in full
       (`.ride-name-text.marquee`, below) — the header is not part of that trade. */
    white-space: nowrap;
  }

  .hours {
    font-size: var(--type-section-header);
    /* The hours are the park name's quiet peer (./README.md § Header): the section-header SIZE the
       owner stepped them to, at body's lighter weight rather than the section-header token's own 700,
       so they read as the quiet reading they are and do not compete with the name. */
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
    /* Row readings take body's own 600 weight at the owner-stepped section-header SIZE — decoupled
       from the section-header token's 700 so the ride name reads as content, not a label, and the
       wait figure's explicit 700 (below) stays the one bold mark on the row, distinguishing the
       number from its name (./README.md § Type and spacing). */
    font-weight: var(--type-body-weight);
  }

  .ride-name {
    /* The column a name is read in — fixed by `flex: 1` against `.wait`'s own fixed reservation
       (below), never the region or the name's own length, so no two cards' columns ever land at a
       different width. `overflow: hidden` is what a name too wide for it scrolls inside of
       (`.ride-name-text.marquee`, below) rather than an ellipsis mechanism. */
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
    /* The divider-to-rows and rows-to-footer gaps are both this one flex gap — the styling
       contract's own md step (./README.md § Type and spacing) — rather than a margin or padding
       on either neighbour, which would stack with it rather than set it. Natural height (`.card`,
       above) leaves nothing to anchor the footer against; it is flush at `.card`'s own bottom
       because it is `.more`'s own last row. */
    gap: var(--space-md);
  }

  .more-divider {
    /* The rule that set the *More waits* label off from the rows below it, kept as a bare divider
       now that the label itself is dropped to save vertical space — the leaderboard and the tour
       stay visually separated by the line alone. */
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
