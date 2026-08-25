<script lang="ts">
  import type { Region, WiseKioskDisplayConfiguration } from '../config/types';
  import { modules } from './modules';
  import { FRAME_COLUMNS, FRAME_ROWS, placementStyle } from './regions';

  /**
   * `reachable` is the page shell's answer about the backend, forwarded to every module: one fed by
   * the backend stands down while it is false, the page reporting the outage once, and one fed by
   * nothing ignores it (docs/contracts/module-contract.md § An unavailable module and an unreachable
   * backend are different states). The frame reads it for its own top inset below, and for nothing
   * else — which modules an outage covers is each module's question, not a placement decision.
   */
  const {
    configuration,
    reachable,
  }: { configuration: WiseKioskDisplayConfiguration; reachable: boolean } = $props();

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

  const frameStyle = [
    `grid-template-columns:${FRAME_COLUMNS}`,
    `grid-template-rows:${FRAME_ROWS}`,
  ].join(';');
</script>

<div class="frame" class:below-report={!reachable} style={frameStyle} data-frame>
  {#each occupied as [region, names] (region)}
    <section class="region" data-region={region} style={placementStyle(region)}>
      {#each names as name, index (index)}
        {@const Module = modules[name]}
        {#if Module}
          <Module {reachable} />
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
    /* A definite height, not a minimum: in an auto-height grid an `fr` track is sized to its
       content, so the three bands would grow to whatever they were given instead of dividing the
       display. Content larger than its band then leaves the frame, which is what it must do. The
       height is the track the page gives the frame, which is the display less whatever band the
       page carries above it. */
    height: 100%;
    padding: var(--edge-band);
  }

  /* The masked band is at the display's own edge, and where the page raises a report it takes the
     row above and insets that edge itself. The frame's top inset would then be a second one, below
     an edge no region is near; the other three edges are still the frame's to hold. */
  .below-report {
    padding-top: 0;
  }

  /* No overflow rule: content too large for its region overflows rather than being clipped. */
  .region {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    /* A grid item's automatic minimum is its content, which would grow a region past the track it
       was given and leave the content inside it. The region holds its track; the content leaves. */
    min-width: 0;
    min-height: 0;
  }

  .unknown {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
  }
</style>
