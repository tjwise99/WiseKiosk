<script lang="ts">
  import type { ModuleOptions } from '../config/types';
  import ModuleHost from './ModuleHost.svelte';
  import { modules } from './modules';

  /**
   * One placement, by the module name its configuration entry carries — read here rather than passed
   * as the registry entry itself, so the "not registered" case is this component's own to report
   * (`RegionFrame`'s `{#each}` otherwise nests the same choice one level deeper than monocart's
   * V8-to-branch attribution correctly reaches).
   */
  const { moduleName, config, reachable }: { moduleName: string; config: ModuleOptions; reachable: boolean } =
    $props();

  const entry = $derived(modules[moduleName]);
</script>

{#if entry}
  <ModuleHost {entry} {reachable} {config} />
{:else}
  <p class="unknown">
    No module named “{moduleName}” — nothing renders here until one is added.
  </p>
{/if}

<style>
  .unknown {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
  }
</style>
