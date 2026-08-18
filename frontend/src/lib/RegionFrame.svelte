<script lang="ts">
  import type { Region, WiseKioskDisplayConfiguration } from '../config/types';
  import { modules } from './modules';
  import { FRAME_COLUMNS, FRAME_ROWS, edgeBandLength, placementStyle } from './regions';

  const { configuration }: { configuration: WiseKioskDisplayConfiguration } = $props();

  /**
   * The regions the configuration names, each with the modules placed there in the order it names
   * them. A region no entry names is not laid out at all.
   */
  const occupied = $derived.by(() => {
    const byRegion = new Map<Region, string[]>();
    for (const placement of configuration.modules) {
      const here = byRegion.get(placement.region) ?? [];
      here.push(placement.module);
      byRegion.set(placement.region, here);
    }
    return [...byRegion];
  });

  const frameStyle = $derived(
    [
      `--edge-band:${edgeBandLength(configuration.edge_band)}`,
      `grid-template-columns:${FRAME_COLUMNS}`,
      `grid-template-rows:${FRAME_ROWS}`,
    ].join(';'),
  );
</script>

<div class="frame" style={frameStyle} data-frame>
  {#each occupied as [region, names] (region)}
    <section class="region" data-region={region} style={placementStyle(region)}>
      {#each names as name, index (index)}
        {@const Module = modules[name]}
        {#if Module}
          <Module />
        {:else}
          <p class="unknown">No module named “{name}” — nothing renders here until one is added.</p>
        {/if}
      {/each}
    </section>
  {/each}
</div>

<style>
  .frame {
    display: grid;
    box-sizing: border-box;
    min-height: 100vh;
    padding: var(--edge-band);
  }

  /* No overflow rule: content too large for its region overflows rather than being clipped. */
  .region {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .unknown {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
  }
</style>
