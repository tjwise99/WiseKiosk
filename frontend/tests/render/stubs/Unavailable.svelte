<script lang="ts">
  /**
   * A module fed by the backend, in the state its own source failing calls for: it renders the
   * unavailable box while the backend answers (SRS001), and stands down to nothing while the backend
   * does not (SRS026). Both arms are needed for the second to mean anything — a stub that never drew
   * the box would read as suppressed however the page behaved.
   */
  const { reachable }: { reachable: boolean } = $props();
</script>

{#if reachable}
  <div class="stub" data-stub="unavailable" data-stub-unavailable>
    <p class="line">Unavailable — this module’s own source did not answer.</p>
  </div>
{/if}

<style>
  .stub {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .line {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }
</style>
