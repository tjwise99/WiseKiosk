<!-- The same content as Fits, repeated until its box exceeds any region's. -->
<div class="stub" data-stub="overflows">
  {#each Array.from({ length: 60 }, (_, line) => line) as line (line)}
    <p class="line">Overflows {line}</p>
  {/each}
</div>

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
