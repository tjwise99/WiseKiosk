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
    // No real HTTP response drives this: `loadConfiguration` maps every failure it anticipates
    // onto a resolved outcome, so only a throw from inside the validator itself reaches here,
    // which nothing this repository controls can serve in a test.
    .catch(/* istanbul ignore next */ (cause: unknown) => {
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
  <!-- A plain `style={edgeBandStyle}` binding rather than the mixed literal-and-expression
       `style="--edge-band:{...}"` form: a text node or attribute mixing static and dynamic content
       compiles to a template Svelte itself gives a nullish fallback, which the real value can never
       take and which no source-level comment survives Svelte's own compilation of to reach — kept
       as a plain identifier binding avoids that branch rather than leaving it uncovered. -->
  {@const edgeBandStyle = `--edge-band:${edgeBandLength(outcome.configuration.edge_band)}`}
  <div class="page" class:banded={!reachable} style={edgeBandStyle}>
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
     band above it and the frame in what is left. The band displaces rather than covers, on SYS001's
     terms — whether the display carries a covering region at all is ADR 0025 rev 3's to decide. The
     masked depth is declared here rather than on the frame, so everything the page draws inside it
     reads the one value
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
