<script lang="ts">
  import type { ParkWaitTimesPark, ParkWaitTimesRide } from '../../lib/boundary/client';

  /**
   * One park's card (./README.md § The card, top to bottom). Owns its own rotation timer, because
   * the "more waits" tour advances independently per park
   * (SRS059<!-- The park-wait-times module tours the remaining rides on an interval its
   * configuration sets -->) — a `{#each}` block in the parent has nowhere of its own to hold that
   * state, so each card is its own component instead.
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
   * The park's rides ranked by how long a viewer would wait, worst first: a ride that is not
   * operating is an effectively infinite wait and sorts ahead of every numeric one
   * (SRS058<!-- The park-wait-times module keeps each park's longest current waits in view -->);
   * among ties (including every not-operating ride, which carries no minute figure to break the
   * tie with) the source's own order is kept, so the ranking is stable rather than arbitrary.
   */
  function ranked(rides: ParkWaitTimesRide[]): ParkWaitTimesRide[] {
    return rides
      .map((ride, index) => ({ ride, index }))
      .sort((a, b) => {
        const aMinutes = isMinutes(a.ride.wait);
        const bMinutes = isMinutes(b.ride.wait);
        if (aMinutes !== bMinutes) return aMinutes ? 1 : -1;
        if (aMinutes && bMinutes) return (b.ride.wait as number) - (a.ride.wait as number);
        return a.index - b.index;
      })
      .map(({ ride }) => ride);
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
  {#if !park.available}
    <p class="unavailable" data-pwt-unavailable>{park.message}</p>
  {:else}
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
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
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
    width: var(--type-annotation);
    height: var(--type-annotation);
    color: var(--emission-content);
  }

  .icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .name {
    font-size: var(--type-annotation);
    font-weight: var(--type-annotation-weight);
  }

  .hours {
    font-size: var(--type-body);
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
    gap: var(--space-xs);
  }

  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    font-size: var(--type-body);
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
    gap: var(--space-xs);
  }

  .more-label {
    margin: 0 0 var(--space-xs) 0;
    padding-bottom: var(--space-xs);
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
  }

  .footer {
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-md);
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
