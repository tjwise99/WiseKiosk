<script lang="ts">
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

  /** The switch cadence to fall back to should the config arrive without the schema's own default
      populated — the placement's `rotation_interval_seconds`, config/schema.json's own default. */
  const DEFAULT_ROTATION_SECONDS = 8;
  const rotationSeconds = $derived(pwtConfig.rotation_interval_seconds ?? DEFAULT_ROTATION_SECONDS);

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
      <ol
        class="grid"
        data-pwt-grid
        style:grid-template-columns="repeat({pwtConfig.columns}, 1fr)"
        style:grid-template-rows="repeat({pwtConfig.rows}, auto)"
      >
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
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  .grid {
    display: grid;
    gap: var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
