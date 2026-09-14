<script lang="ts">
  import { untrack } from 'svelte';

  import type { ParkWaitTimesOptions } from '../../config/types';
  import type { ParkWaitTimesPayload } from '../../lib/boundary/client';
  import type { CommonProps } from '../../lib/modules';
  import type { Payload } from '../../lib/payload';

  import castle from './icons/castle.svg?raw';
  import clapperboard from './icons/clapperboard.svg?raw';
  import coaster from './icons/coaster.svg?raw';
  import globe from './icons/globe.svg?raw';
  import sorcererHat from './icons/sorcerer-hat.svg?raw';
  import tree from './icons/tree.svg?raw';
  import ParkCard from './ParkCard.svelte';

  /**
   * The module draws from its props and fetches nothing
   * (docs/contracts/module-contract.md § The six parts, part 1): the shell reads the route and
   * hands the answer down as `payload`, one entry per park the configuration named.
   *
   * `reachable` is declared and acted on, this module being fed by the backend: while it is false
   * the module stands down and renders nothing, the page reporting the one outage for the whole
   * display (§ An unavailable module and an unreachable backend are different states).
   */
  const { reachable, config, payload }: CommonProps = $props();

  const pwtConfig = $derived(config as ParkWaitTimesOptions);
  const pwtPayload = $derived(payload as Payload<ParkWaitTimesPayload>);

  /** The placement's rotation cadence. `ParkWaitTimesOptions` types this optional because a
      placement is free to omit it in the source file, but `config/schema.json`'s own `default: 8`
      is filled in by ajv's `useDefaults` before this component ever sees the config
      (vite-plugin-config-validator.ts) — the value is always present by the time it is read here. */
  const rotationSeconds = $derived(pwtConfig.rotation_interval_seconds as number);

  /** The grid's own column and row counts, read once rather than tracked: a placement's shape is
      fixed at the config load that named it (the shell loads config once at boot, never live), so
      there is no later change for a reactive binding to catch — a plain snapshot, not a `$derived`.
      `untrack` is the deliberate spelling of that: without it Svelte's compiler warns that this
      reference "only captures the initial value" (state_referenced_locally), which is exactly and
      intentionally what it does. */
  const gridColumns = untrack(() => pwtConfig.columns);
  const gridRows = untrack(() => pwtConfig.rows);

  /** Sets the grid's own column and row counts as CSS custom properties, once: an action rather
      than a `style:` binding, so nothing here carries Svelte's per-render dirty-check for a shape
      that cannot change after mount. `.grid`'s own rule (below) reads them back with `var()`. */
  function gridShape(node: HTMLElement, shape: { columns: number; rows: number }): void {
    node.style.setProperty('--pwt-columns', String(shape.columns));
    node.style.setProperty('--pwt-rows', String(shape.rows));
  }

  /**
   * This module's own park icon set (the park-wait-times UI design spec § The park icon set), keyed
   * by the same slug the configuration and the boundary payload use. A configured park with no
   * matching glyph draws no icon, name only — the fallback the design spec names — so a lookup miss
   * below is `undefined` and read as an absence rather than an error.
   */
  const ICONS: Record<string, string> = {
    'magic-kingdom': castle,
    epcot: globe,
    'hollywood-studios': sorcererHat,
    'animal-kingdom': tree,
    'universal-studios': clapperboard,
    'islands-of-adventure': coaster,
  };
</script>

{#if reachable}
  <div class="park-wait-times" data-park-wait-times>
    {#if pwtPayload.state === 'loading'}
      <p class="waiting" data-module-loading>Reading wait times…</p>
    {:else if pwtPayload.state === 'unavailable'}
      <p class="waiting" data-module-unavailable>{pwtPayload.failure.message}</p>
    {:else}
      <ol class="grid" data-pwt-grid use:gridShape={{ columns: gridColumns, rows: gridRows }}>
        {#each pwtPayload.data.parks as park (park.id)}
          <ParkCard {park} icon={ICONS[park.id]} {rotationSeconds} />
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .park-wait-times {
    /* The module sizes to its own content and takes the region's anchor, the same as every other
       module's root (RegionFrame's `placementStyle()`). */
    min-width: 0;
  }

  .waiting {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  .grid {
    display: grid;
    /* minmax(0, 1fr) rather than bare 1fr: a track's automatic minimum is otherwise its content's
       min-content, so a card's own name or ride text can force every track wider than the grid's
       own container. */
    grid-template-columns: repeat(var(--pwt-columns), minmax(0, 1fr));
    grid-template-rows: repeat(var(--pwt-rows), auto);
    gap: var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
