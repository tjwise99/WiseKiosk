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
  const pages = $derived(Array.from({ length: pageCount }, (_unused, index) => index));

  /** The hours right-aligned in the header — a plain `HH:MM` read off each timestamp's own local
      clock, dropped straight from the string rather than re-read against the host's zone. */
  function clockTime(iso: string): string {
    const match = /T(\d{2}):(\d{2})/.exec(iso);
    return match ? `${match[1]}:${match[2]}` : iso;
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
      <span class="hours" data-pwt-hours>{clockTime(park.hours.open)}–{clockTime(park.hours.close)}</span>
    {/if}
  </div>

  {#if !park.available}
    <p class="unavailable" data-pwt-unavailable>{park.message}</p>
  {:else}
    <ol class="leaderboard" data-pwt-leaderboard>
      {#each held as ride (ride.name)}
        <li class="row" data-pwt-leaderboard-row>
          <span class="ride-name">{ride.name}</span>
          {#if isMinutes(ride.wait)}
            <span class="wait tabular-figures" data-pwt-wait data-pwt-wait-kind="minutes">{ride.wait}</span>
          {:else}
            <span class="wait state" data-pwt-wait data-pwt-wait-kind="state">{ride.wait}</span>
          {/if}
        </li>
      {/each}
    </ol>

    {#if remaining.length > 0}
      <div class="more" data-pwt-more-waits>
        <h3 class="more-label section-label">More waits</h3>
        <ol class="tour">
          {#each shown as ride (ride.name)}
            <li class="row" data-pwt-tour-row>
              <span class="ride-name">{ride.name}</span>
              {#if isMinutes(ride.wait)}
                <span class="wait tabular-figures" data-pwt-wait data-pwt-wait-kind="minutes">{ride.wait}</span>
              {:else}
                <span class="wait state" data-pwt-wait data-pwt-wait-kind="state">{ride.wait}</span>
              {/if}
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
  }

  .unavailable {
    margin: 0;
    font-size: var(--type-section-header);
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
    justify-content: space-between;
    gap: var(--space-sm);
    font-size: var(--type-section-header);
    /* Row readings take body's own 600 weight at the owner-stepped section-header SIZE — decoupled
       from the section-header token's 700 so the ride name reads as content, not a label, and the
       wait figure's explicit 700 (below) stays the one bold mark on the row, distinguishing the
       number from its name (./README.md § Type and spacing). */
    font-weight: var(--type-body-weight);
  }

  .ride-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .wait {
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
    /* The label-to-rows and rows-to-footer gaps are both this one flex gap — the styling
       contract's own md step (./README.md § Type and spacing) — rather than a margin or padding
       on either neighbour, which would stack with it rather than set it. */
    gap: var(--space-md);
  }

  .more-label {
    margin: 0;
    padding-bottom: var(--space-xs);
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
    /* A group heading names what follows and is read left-to-right, so it stays left-aligned
       whichever side the module itself is justified to — the same idiom, and the same reason, as the
       weather module's `Next hours` / `Next days` headings. Without this it inherits the region's
       content anchor and floats centred (or right) above the left-starting rotation rows. */
    text-align: left;
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
