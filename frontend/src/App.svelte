<script lang="ts">
  import { loadConfiguration, type ConfigurationOutcome } from './config/load';
  import ConfigurationError from './lib/ConfigurationError.svelte';
  import RegionFrame from './lib/RegionFrame.svelte';

  // Started once, at mount: the display never navigates, so there is nothing to re-run or tear down.
  let outcome: ConfigurationOutcome | undefined = $state();
  loadConfiguration().then((result) => {
    outcome = result;
  });
</script>

{#if outcome === undefined}
  <main class="waiting" data-state="loading">
    <p>Loading the display configuration…</p>
  </main>
{:else if outcome.kind === 'applied'}
  <RegionFrame configuration={outcome.configuration} />
{:else}
  <ConfigurationError {outcome} />
{/if}

<style>
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
