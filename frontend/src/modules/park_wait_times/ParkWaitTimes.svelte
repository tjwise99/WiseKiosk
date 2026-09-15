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

  /** The `HH:MM–HH:MM` a park's header draws (`ParkCard.svelte`'s own `clockTime`, mirrored here so
      the width this measures is the text that actually renders — a plain read off each timestamp's
      own local clock, not re-read against the host's zone). */
  function clockTime(iso: string): string {
    const match = /T(\d{2}):(\d{2})/.exec(iso);
    return match ? `${match[1]}:${match[2]}` : iso;
  }

  /** One park's header content, read from the payload: its name, and its hours as the text the
      header draws, where it has hours to draw. */
  const headers = $derived(
    pwtPayload.state === 'ok'
      ? pwtPayload.data.parks.map((park) => ({
          name: park.name,
          hours: park.hours ? `${clockTime(park.hours.open)}–${clockTime(park.hours.close)}` : undefined,
        }))
      : [],
  );

  /** The one width every card, and so every grid column, takes: the widest a park's own header —
      icon, name, hours — draws across the configured roster, plus the card's own padding and
      border around it, and nothing past that. A ride name too wide for its column scrolls to
      reveal itself (`ParkCard.svelte`'s `marquee` action) rather than growing the card past this.
      The declarations mirror `ParkCard.svelte`'s `.card`/`.identity`/`.icon`/`.name`/`.header`/
      `.hours` rules, read side by side with them for the same reason `waitColumnWidthPx` reads
      `.wait`'s. */
  function headerWidthPx(root: HTMLElement, rows: { name: string; hours: string | undefined }[]): number {
    const icon = resolved(root, 'width:var(--type-body);').width;
    const identityGap = resolved(root, 'width:var(--space-xs);').width;
    const nameFont =
      'font-size:var(--type-body);font-weight:var(--type-section-header-weight);' +
      'text-transform:uppercase;letter-spacing:var(--type-section-header-tracking);';
    const headerGap = resolved(root, 'width:var(--space-sm);').width;
    const hoursFont = 'font-size:var(--type-section-header);font-weight:var(--type-section-header-weight);';
    const cardPadding = resolved(root, 'width:var(--space-md);').width;
    const cardBorder = resolved(root, 'width:calc(var(--divider-stroke-width) * 2);').width;

    const contentWidth = Math.max(
      0,
      ...rows.map((row) => {
        const nameWidth = resolved(root, nameFont, row.name).width;
        const hoursWidth = row.hours ? headerGap + resolved(root, hoursFont, row.hours).width : 0;
        return icon + identityGap + nameWidth + hoursWidth;
      }),
    );
    return Math.ceil(contentWidth + cardPadding * 2 + cardBorder * 2);
  }

  /** The wait column's own fixed width — long enough for whichever of the three not-operating words
      (SRS061<!-- The park-wait-times module draws a wait as the time or the not-operating state it
      is handed -->) or a worst-case length of time it is ever handed, so a wait changing under the
      display never shifts the column (SRS058<!-- The park-wait-times module keeps each park's
      longest current waits in view -->). The declarations mirror `ParkCard.svelte`'s `.row`/`.wait`/
      `.wait.state` rules, read side by side with them for the same reason `headerWidthPx` reads
      `.name`'s. */
  function waitColumnWidthPx(root: HTMLElement): number {
    const numericWait = 'font-size:var(--type-section-header);font-weight:700;';
    const stateWait =
      'font-size:var(--type-caption);font-weight:var(--type-caption-weight);' +
      'text-transform:uppercase;letter-spacing:var(--type-section-header-tracking);';
    return Math.ceil(
      Math.max(
        resolved(root, numericWait, '999').width,
        resolved(root, stateWait, 'Down').width,
        resolved(root, stateWait, 'Closed').width,
        resolved(root, stateWait, 'Refurb').width,
      ),
    );
  }

  /** The one height every card takes: the tallest a card actually lays out to, so a Closed card
      (icon and a word) or an open one with fewer rides and no tour never comes up shorter than its
      neighbours — the same "identical at every park count" rule `--pwt-card-width` already holds
      for width, read here for height. `--pwt-card-height` is cleared first so a floor a previous
      measurement set cannot hold a card that has since drawn less content up to a height nothing
      here still needs; every card is a `[data-pwt-card]`. */
  function cardHeightPx(root: HTMLElement): number {
    root.style.removeProperty('--pwt-card-height');
    const cards = root.querySelectorAll('[data-pwt-card]');
    return Math.ceil(Math.max(0, ...Array.from(cards, (card) => card.getBoundingClientRect().height)));
  }

  /** Writes `--pwt-card-width`, `--pwt-wait-width` and `--pwt-card-height` — the first from
      `headers`, the payload's own park names and hours, reapplied whenever `headers` changes rather
      than only at mount (the pattern `gridShape` does not need, its shape being the placement's own
      and fixed for good); the second geometry and token driven, fixed once; the third read off the
      cards themselves once the first two have already set their own width, so `cardHeightPx` measures
      the layout those two produce rather than one still pending them. */
  function cardGeometry(
    node: HTMLElement,
    rows: { name: string; hours: string | undefined }[],
  ): { update(rows: { name: string; hours: string | undefined }[]): void } {
    function apply(current: { name: string; hours: string | undefined }[]): void {
      node.style.setProperty('--pwt-card-width', `${headerWidthPx(node, current)}px`);
      node.style.setProperty('--pwt-wait-width', `${waitColumnWidthPx(node)}px`);
      node.style.setProperty('--pwt-card-height', `${cardHeightPx(node)}px`);
    }
    apply(rows);
    return { update: apply };
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
        use:cardGeometry={headers}
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
    /* Every column the same fixed width — `--pwt-card-width`, `cardGeometry`'s own — the widest a
       park's own header draws, and no wider. A ride name too wide for its own column scrolls to
       reveal itself (`ParkCard.svelte`'s `marquee`) rather than growing the card past it. */
    grid-template-columns: repeat(var(--pwt-columns), var(--pwt-card-width));
    grid-template-rows: repeat(var(--pwt-rows), auto);
    gap: var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
