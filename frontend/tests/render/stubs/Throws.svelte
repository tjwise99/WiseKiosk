<script lang="ts">
  /**
   * A module that throws as the backend goes away — the field failure ParkWaitTimes.svelte's `gridEl`
   * guard fixed at one site, reproduced here as the shape rather than as that module's particular
   * arithmetic. What the framework owes a module that throws is the same whichever module threw, so
   * the obligation is read against a stub rather than against whichever module last held the defect.
   *
   * The shape matters and is not simplified. An `$effect` that merely throws is survivable: Svelte
   * reports it and goes on flushing, and a check staged on one would be green with no containment
   * anywhere. What is not survivable is this — an effect held by the component, outliving the block
   * that owns the element it reads, re-run by the very write that unbinds it. Svelte writes `null`
   * back through `bind:this` as it destroys that block; the guard here tests only `undefined`, so the
   * `null` reaches `querySelectorAll`, and the throw lands mid-flush of the batch that was tearing the
   * block down. That stops the page's reactive rendering for as long as it runs — every module and the
   * outage report with it.
   *
   * The fault is raised and cleared by the one signal a test can drive into a module already mounted:
   * it throws while the backend is unreachable and renders while it answers, so the backend answering
   * again is the fault clearing. A module holds nothing else a test can reach — its configuration is
   * fixed at load, and a throw from a timer of its own is not raised under any render that could catch
   * it.
   *
   * Local rather than backed: no `read` in the registry, so nothing of the outage reaches it but the
   * reachability every module is handed alike.
   */
  const { reachable }: { reachable: boolean } = $props();

  /** Typed to two values where the binding carries three — the defect itself, kept deliberately. */
  let el: HTMLElement | undefined = $state();

  $effect(() => {
    const node = el;
    if (node === undefined) return;
    node.querySelectorAll('.line');
  });
</script>

{#if reachable}
  <div class="stub" data-stub="throws" bind:this={el}>
    <p class="line">Throws</p>
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
