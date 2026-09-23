<script lang="ts">
  /**
   * The seed the steady-state allocation gate is proven against: a module whose per-second tick does
   * every one of the things that gate exists to catch. It queries a media list the document then
   * retains, builds an `Intl` formatter, formats through it, and tears down and rebuilds its own
   * subtree — all once a second, although nothing it draws changes faster than the second it shows.
   * Each of the four is the shape the ablation on the board actually found
   * (meta-wisekiosk #100 gpu-compositing), not an exaggeration of it.
   *
   * It is registered rather than written inside the spec because the gate reads a *mounted* module: a
   * seed the spec constructed some other way would prove the counters work without proving the gate
   * reaches a module the page renders. Nothing but `steady-state-allocation.spec.ts` places it, and a
   * defect this deliberate passing that gate is the gate having stopped measuring.
   */
  import type { CommonProps } from '../../../src/lib/modules';

  /** Taken and acted on like any module's, so this stub is registered under the same contract the
      ones it stands in for are (docs/contracts/module-contract.md § The six parts, part 1). */
  const { reachable }: CommonProps = $props();

  let now = $state(new Date());
  let still = $state('moving');

  $effect(() => {
    const tick = setInterval(() => {
      now = new Date();
      // On the tick, not at mount: every call leaves a `MediaQueryList` the document holds for its
      // own lifetime, so a per-tick call is an unbounded retained set.
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'moving';
    }, 1000);
    return () => clearInterval(tick);
  });

  // A whole locale resolution built and thrown away per tick, and a whole string re-derived from it,
  // although only the seconds field moved.
  const shown = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now),
  );
</script>

<!-- Keyed on the reading, so the block is destroyed and rebuilt each second rather than having its
     text node written: the per-tick subtree re-render that was the dominant driver on the board. -->
{#if reachable}
  {#key shown}
    <p data-churns>{shown} {still}</p>
  {/key}
{/if}

<style>
  p {
    margin: 0;
    font-size: var(--type-title);
  }
</style>
