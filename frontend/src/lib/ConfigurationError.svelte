<script lang="ts">
  import { CONFIGURATION_URL, type ConfigurationOutcome } from '../config/load';

  type Failure = Exclude<ConfigurationOutcome, { kind: 'applied' }>;

  const { outcome }: { outcome: Failure } = $props();

  /** What went wrong, and what an operator does about it, in the terms they edit the file in. */
  const HEADLINES: Record<Failure['kind'], { title: string; advice: string }> = {
    absent: {
      title: 'No configuration file',
      advice: `Nothing is served at ${CONFIGURATION_URL}. Mount the configuration file there and reload.`,
    },
    unfetchable: {
      title: 'The configuration could not be fetched',
      advice: `${CONFIGURATION_URL} could not be read. Check that it is served and readable, then reload.`,
    },
    unparsable: {
      title: 'The configuration is not valid JSON',
      advice: `${CONFIGURATION_URL} could not be parsed. Correct the JSON and reload.`,
    },
    rejected: {
      title: 'The configuration was rejected',
      advice: 'Every fault is listed below. Correct them and reload.',
    },
  };

  const headline = $derived(HEADLINES[outcome.kind]);
</script>

<main class="report" data-configuration-error={outcome.kind}>
  <h1>{headline.title}</h1>
  <p class="advice">{headline.advice}</p>

  {#if outcome.kind === 'rejected'}
    <ul class="faults">
      {#each outcome.faults as fault, index (index)}
        <li><span class="where">{fault.where || CONFIGURATION_URL}</span><span>{fault.what}</span></li>
      {/each}
    </ul>
  {:else}
    <p class="detail">{outcome.detail}</p>
  {/if}
</main>

<style>
  .report {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-height: 100vh;
    padding: var(--edge-band);
  }

  h1 {
    margin: 0;
    font-size: var(--type-headline);
    font-weight: var(--type-headline-weight);
  }

  .advice,
  .detail {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  .faults {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  /* The gap between the pointer and the fault's own text as layout rather than a literal space in
     the text node it would otherwise share with `fault.what`: a text node mixing static and dynamic
     content compiles to a template Svelte itself gives a nullish fallback, which the real value can
     never take and no test can reach — kept as a plain identifier interpolation avoids that branch
     rather than leaving it unreachable. */
  .faults li {
    display: flex;
    gap: var(--space-xs);
  }

  .where {
    font-weight: var(--type-section-header-weight);
  }
</style>
