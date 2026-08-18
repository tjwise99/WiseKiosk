<script lang="ts">
  import { loadConfiguration, type ConfigurationOutcome } from './config/load';
  import ConfigurationError from './lib/ConfigurationError.svelte';
  import RegionFrame from './lib/RegionFrame.svelte';

  // Started once, at mount: the display never navigates, so there is nothing to re-run or tear down.
  // The rejection arm is not unreachable: `loadConfiguration` maps every failure it anticipates onto
  // an outcome, and anything it does not — a throw from inside the validator — would otherwise leave
  // the page on its loading state for as long as the display runs.
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
