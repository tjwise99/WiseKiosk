<script lang="ts">
  import { loadConfiguration, type ConfigurationOutcome } from './config/load';
  import BackendUnreachable from './lib/BackendUnreachable.svelte';
  import ConfigurationError from './lib/ConfigurationError.svelte';
  import RegionFrame from './lib/RegionFrame.svelte';
  import { LIVENESS_INTERVAL_MS, checkLiveness } from './lib/liveness';
  import { edgeBandLength } from './lib/regions';

  // Read once, at mount: the display never navigates, so the configuration is asked for a single
  // time. The rejection arm is not unreachable: `loadConfiguration` maps every failure it
  // anticipates onto an outcome, and anything it does not — a throw from inside the validator —
  // would otherwise leave the page on its loading state for as long as the display runs.
  let outcome: ConfigurationOutcome | undefined = $state();
  loadConfiguration()
    .then((result) => {
      outcome = result;
    })
    .catch((cause: unknown) => {
      outcome = {
        kind: 'unreadable',
        detail: cause instanceof Error ? cause.message : String(cause),
      };
    });

  // Whether the backend answered its last ask. It is asked only once a configuration has been
  // applied: the other outcomes render a report of their own, which a second failure state over the
  // top of would not help an operator read.
  let reachable = $state(true);
  $effect(() => {
    if (outcome?.kind !== 'applied') {
      return;
    }
    const ask = async () => {
      reachable = await checkLiveness();
    };
    void ask();
    const asking = setInterval(() => void ask(), LIVENESS_INTERVAL_MS);
    return () => clearInterval(asking);
  });
</script>

{#if outcome === undefined}
  <main class="waiting" data-state="loading">
    <p>Loading the display configuration…</p>
  </main>
{:else if outcome.kind === 'applied'}
  <div
    class="page"
    class:banded={!reachable}
    style="--edge-band:{edgeBandLength(outcome.configuration.edge_band)}"
  >
    {#if !reachable}
      <BackendUnreachable />
    {/if}
    <RegionFrame {reachable} configuration={outcome.configuration} />
  </div>
{:else}
  <ConfigurationError {outcome} />
{/if}

<style>
  /* The display's own height, divided between the states the page carries: the frame alone, or a
     band above it and the frame in what is left. The band displaces the layout rather than covering
     it, so no region is ever hidden behind a failure report (SYS001). The masked depth is declared
     here rather than on the frame, so everything the page draws inside it reads the one value
     (docs/contracts/display-styling-contract.md § Spacing scale and the edge band). */
  .page {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100vh;
  }

  .banded {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .waiting {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--edge-band);
  }

  p {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }
</style>
