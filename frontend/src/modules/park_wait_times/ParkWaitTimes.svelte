<script lang="ts">
  import { untrack } from 'svelte';

  import type { ParkWaitTimesOptions } from '../../config/types';
  import type { ParkWaitTimesPayload } from '../../lib/boundary/client';
  import type { CommonProps } from '../../lib/modules';
  import type { Payload } from '../../lib/payload';

  import castle from './icons/castle.svg?raw';
  import clapperboard from './icons/clapperboard.svg?raw';
  import coaster from './icons/coaster.svg?raw';
  import globe from './icons/globe.svg?raw';
  import sorcererHat from './icons/sorcerer-hat.svg?raw';
  import tree from './icons/tree.svg?raw';
  import ParkCard from './ParkCard.svelte';

  /**
   * The module draws from its props and fetches nothing
   * (docs/contracts/module-contract.md § The six parts, part 1): the shell reads the route and
   * hands the answer down as `payload`, one entry per park the configuration named.
   *
   * `reachable` is declared and acted on, this module being fed by the backend: while it is false
   * the module stands down and renders nothing, the page reporting the one outage for the whole
   * display (§ An unavailable module and an unreachable backend are different states).
   */
  const { reachable, config, payload }: CommonProps = $props();

  const pwtConfig = $derived(config as ParkWaitTimesOptions);
  const pwtPayload = $derived(payload as Payload<ParkWaitTimesPayload>);

  /** The placement's rotation cadence. `ParkWaitTimesOptions` types this optional because a
      placement is free to omit it in the source file, but `config/schema.json`'s own `default: 8`
      is filled in by ajv's `useDefaults` before this component ever sees the config
      (vite-plugin-config-validator.ts) — the value is always present by the time it is read here. */
  const rotationSeconds = $derived(pwtConfig.rotation_interval_seconds as number);

  /** The grid's own column and row counts, read once rather than tracked: a placement's shape is
      fixed at the config load that named it (the shell loads config once at boot, never live), so
      there is no later change for a reactive binding to catch — a plain snapshot, not a `$derived`.
      `untrack` is the deliberate spelling of that: without it Svelte's compiler warns that this
      reference "only captures the initial value" (state_referenced_locally), which is exactly and
      intentionally what it does. */
  const gridColumns = untrack(() => pwtConfig.columns);
  const gridRows = untrack(() => pwtConfig.rows);

  /** Sets the grid's own column and row counts as CSS custom properties, once: an action rather
      than a `style:` binding, so nothing here carries Svelte's per-render dirty-check for a shape
      that cannot change after mount. `.grid`'s own rule (below) reads them back with `var()`. */
  function gridShape(node: HTMLElement, shape: { columns: number; rows: number }): void {
    node.style.setProperty('--pwt-columns', String(shape.columns));
    node.style.setProperty('--pwt-rows', String(shape.rows));
  }

  /** Resolves a CSS declaration to real pixels by applying it, literally, to an absolutely
      positioned probe and reading the box it lays out — never a class name: `ParkCard.svelte`'s own
      rules are scoped to that component, so an element this module creates would not match them, and
      a custom property's own computed text (e.g. `"1vh"`) is not its resolved size either way. Each
      caller below passes the exact declaration the row/name/wait mark it stands in for uses, so the
      one thing keeping this in step with `ParkCard.svelte`'s CSS is that the two are read side by
      side, not a shared class. */
  function resolved(root: HTMLElement, cssText: string, text = ''): DOMRect {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;${cssText}`;
    probe.textContent = text;
    root.appendChild(probe);
    const box = probe.getBoundingClientRect();
    root.removeChild(probe);
    return box;
  }

  /** A ride name too wide for its column scrolls to reveal itself rather than growing the card
      (`ParkCard.svelte`'s `marquee` action), so the card is a fixed width — long enough to lay the
      configured columns out across the viewport without running past its edge, and no wider. Read
      once, geometry only — the viewport, the frame's own inset (RegionFrame.svelte's
      `--edge-band`) and the grid's own column gap — never the payload, so this never moves as
      parks or rides change. */
  function cardWidthPx(root: HTMLElement, columns: number): number {
    const frame = document.querySelector('[data-frame]') as HTMLElement | null;
    const edgeBand = frame ? Number.parseFloat(getComputedStyle(frame).paddingLeft) : 0;
    const gap = resolved(root, 'width:var(--space-xs);').width;
    const available = document.documentElement.clientWidth - edgeBand * 2 - gap * (columns - 1);
    return Math.floor(available / columns);
  }

  /** The wait column's own fixed width — long enough for whichever of the three not-operating words
      (SRS061<!-- The park-wait-times module draws a wait as the time or the not-operating state it
      is handed -->) or a worst-case length of time it is ever handed, so a wait changing under the
      display never shifts the column (SRS058<!-- The park-wait-times module keeps each park's
      longest current waits in view -->). The declarations mirror `ParkCard.svelte`'s `.wait`/
      `.wait.state` rules, read side by side with them for the same reason `cardWidthPx` reads
      `.row`'s. */
  function waitColumnWidthPx(root: HTMLElement): number {
    const numericWait = 'font-size:var(--type-caption);font-weight:700;';
    const stateWait = 'font-size:var(--type-caption);font-weight:var(--type-caption-weight);text-transform:uppercase;';
    return Math.ceil(
      Math.max(
        resolved(root, numericWait, '999').width,
        resolved(root, stateWait, 'Down').width,
        resolved(root, stateWait, 'Closed').width,
        resolved(root, stateWait, 'Refurb').width,
      ),
    );
  }

  /** Writes `--pwt-card-width` and `--pwt-wait-width`, once: both are geometry and token driven,
      never the payload's, so — unlike `gridShape`'s own shape, which is the placement's — there is
      nothing here for a later poll to move either. `.grid`'s and `ParkCard.svelte`'s own rules read
      them back with `var()`. */
  function cardGeometry(node: HTMLElement, columns: number): void {
    node.style.setProperty('--pwt-card-width', `${cardWidthPx(node, columns)}px`);
    node.style.setProperty('--pwt-wait-width', `${waitColumnWidthPx(node)}px`);
  }

  /**
   * This module's own park icon set (the park-wait-times UI design spec § The park icon set), keyed
   * by the same slug the configuration and the boundary payload use. A configured park with no
   * matching glyph draws no icon, name only — the fallback the design spec names — so a lookup miss
   * below is `undefined` and read as an absence rather than an error.
   */
  const ICONS: Record<string, string> = {
    'magic-kingdom': castle,
    epcot: globe,
    'hollywood-studios': sorcererHat,
    'animal-kingdom': tree,
    'universal-studios': clapperboard,
    'islands-of-adventure': coaster,
  };
</script>

{#if reachable}
  <div class="park-wait-times" data-park-wait-times>
    {#if pwtPayload.state === 'loading'}
      <p class="waiting" data-module-loading>Reading wait times…</p>
    {:else if pwtPayload.state === 'unavailable'}
      <p class="waiting" data-module-unavailable>{pwtPayload.failure.message}</p>
    {:else}
      <ol
        class="grid"
        data-pwt-grid
        use:gridShape={{ columns: gridColumns, rows: gridRows }}
        use:cardGeometry={gridColumns}
      >
        {#each pwtPayload.data.parks as park (park.id)}
          <ParkCard {park} icon={ICONS[park.id]} {rotationSeconds} />
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .park-wait-times {
    /* The module sizes to its own content and takes the region's anchor, the same as every other
       module's root (RegionFrame's `placementStyle()`). */
    min-width: 0;
  }

  .waiting {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  .grid {
    display: grid;
    /* Every column the same fixed width — `--pwt-card-width`, `cardGeometry`'s own — long enough
       for the configured columns to lay out across the viewport without running past its edge. A
       ride name too wide for its own column scrolls to reveal itself (`ParkCard.svelte`'s
       `marquee`) rather than growing the card. */
    grid-template-columns: repeat(var(--pwt-columns), var(--pwt-card-width));
    grid-template-rows: repeat(var(--pwt-rows), auto);
    /* Stepped down from --space-lg to the spacing scale's own floor: three fixed-width cards at
       --pwt-columns: 3 need the module's own spacing tightened to fit the corner. */
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
