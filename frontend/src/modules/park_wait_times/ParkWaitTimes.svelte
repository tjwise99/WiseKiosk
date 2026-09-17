<script lang="ts">
  import { untrack } from 'svelte';

  import type { ParkWaitTimesOptions } from '../../config/types';
  import type { ParkWaitTimesPayload } from '../../lib/boundary/client';
  import type { CommonProps } from '../../lib/modules';
  import type { Payload } from '../../lib/payload';

  import { iconFor } from './park_wait_times';
  import ParkCard from './ParkCard.svelte';

  /**
   * Draws from props, fetches nothing (docs/contracts/module-contract.md § The six parts, part 1);
   * `reachable` acted on — while false the module renders nothing, the page reports the one outage
   * (§ An unavailable module and an unreachable backend are different states).
   */
  const { reachable, config, payload }: CommonProps = $props();

  const pwtConfig = $derived(config as ParkWaitTimesOptions);
  const pwtPayload = $derived(payload as Payload<ParkWaitTimesPayload>);

  /** The placement's rotation cadence; `config/schema.json`'s own `default: 8` is filled in by
      ajv's `useDefaults` (vite-plugin-config-validator.ts) before this component sees the config. */
  const rotationSeconds = $derived(pwtConfig.rotation_interval_seconds as number);

  /** The grid's own column and row counts, read once rather than tracked: fixed at the config load
      that named the placement. `untrack` suppresses Svelte's "only captures the initial value"
      warning — intentional here. */
  const gridColumns = untrack(() => pwtConfig.columns);
  const gridRows = untrack(() => pwtConfig.rows);

  /** Sets the grid's column/row counts as CSS custom properties, once. `.grid` reads them back
      with `var()`. */
  function gridShape(node: HTMLElement, shape: { columns: number; rows: number }): void {
    node.style.setProperty('--pwt-columns', String(shape.columns));
    node.style.setProperty('--pwt-rows', String(shape.rows));
  }

  let gridEl: HTMLElement | undefined = $state();

  /** The width every card and grid column takes: the widest a park's own header draws across the
      roster. Read off the real rendered elements — each header's own `.identity` and `.hours`
      (both nowrap, so each keeps its own content width whatever width the card is given), the gap
      between them, and the card's own padding and border — never a reconstruction of their CSS. The
      browser is the single source of the box model, so a change to any of those rules in
      `ParkCard.svelte` cannot leave a measured width that disagrees with what is drawn. Re-measures
      whenever the payload changes the headers on screen. A name too wide for its fixed column then
      scrolls (`ParkCard.svelte`'s `marquee`) rather than growing the card. */
  $effect(() => {
    void pwtPayload;
    const grid = gridEl;
    if (grid === undefined) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-pwt-card]'));
    if (cards.length === 0) return;
    const widest = Math.max(
      ...cards.map((card) => {
        const identity = card.querySelector<HTMLElement>('.identity');
        const header = card.querySelector<HTMLElement>('[data-pwt-header]');
        const hours = card.querySelector<HTMLElement>('[data-pwt-hours]');
        if (identity === null || header === null) return 0;
        const cardStyle = getComputedStyle(card);
        const chrome =
          parseFloat(cardStyle.paddingLeft) +
          parseFloat(cardStyle.paddingRight) +
          parseFloat(cardStyle.borderLeftWidth) +
          parseFloat(cardStyle.borderRightWidth);
        let content = identity.getBoundingClientRect().width;
        if (hours !== null) {
          content += parseFloat(getComputedStyle(header).columnGap) + hours.getBoundingClientRect().width;
        }
        return content + chrome;
      }),
    );
    grid.style.setProperty('--pwt-card-width', `${Math.ceil(widest)}px`);
  });
</script>

{#if reachable}
  <div class="park-wait-times" data-park-wait-times>
    {#if pwtPayload.state === 'loading'}
      <p class="waiting" data-module-loading>Reading wait times…</p>
    {:else if pwtPayload.state === 'unavailable'}
      <p class="waiting" data-module-unavailable>{pwtPayload.failure.message}</p>
    {:else}
      <ol
        class="grid"
        data-pwt-grid
        bind:this={gridEl}
        use:gridShape={{ columns: gridColumns, rows: gridRows }}
      >
        {#each pwtPayload.data.parks as park (park.id)}
          <ParkCard {park} icon={iconFor(park.id)} {rotationSeconds} />
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .park-wait-times {
    /* Sizes to its own content, takes the region's anchor (RegionFrame's `placementStyle()`). */
    min-width: 0;
    /* Left, against the region's own inherited text-align; `.wait` (ParkCard.svelte) and the Closed
       state opt back to `right`/`center` explicitly. */
    text-align: left;
  }

  .waiting {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  .grid {
    display: grid;
    /* Every column the same fixed width — `--pwt-card-width`, the widest a park's own header draws,
       measured once the cards are rendered (script). Before that measurement lands it falls back to
       each column's own content, so nothing renders at zero width. A name too wide for its column
       scrolls (`ParkCard.svelte`'s `marquee`) rather than growing the card. */
    grid-template-columns: repeat(var(--pwt-columns), var(--pwt-card-width, max-content));
    grid-template-rows: repeat(var(--pwt-rows), auto);
    gap: var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
    /* Grid's own default (`stretch`) would fill every card to its row's tallest; `start` leaves
       each at its own natural height (ParkCard.svelte). */
    align-items: start;
  }
</style>
