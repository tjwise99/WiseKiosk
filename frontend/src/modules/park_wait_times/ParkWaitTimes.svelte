<script lang="ts">
  import { untrack } from 'svelte';

  import type { ParkWaitTimesOptions } from '../../config/types';
  import type { ParkWaitTimesPayload } from '../../lib/boundary/client';
  import type { CommonProps } from '../../lib/modules';
  import type { Payload } from '../../lib/payload';

  import { hoursText, iconFor } from './park_wait_times';
  import ParkCard from './ParkCard.svelte';
  import { WAIT_STATE_WORDS } from './wait-state-words';

  /**
   * Draws from props, fetches nothing (docs/contracts/module-contract.md § The six parts, part 1);
   * `reachable` acted on — while false the module renders nothing, the page reports the one outage
   * (§ An unavailable module and an unreachable backend are different states).
   */
  const { reachable, config, payload }: CommonProps = $props();

  const pwtConfig = $derived(config as ParkWaitTimesOptions);
  const pwtPayload = $derived(payload as Payload<ParkWaitTimesPayload>);

  /** The placement's rotation cadence; `config/schema.json`'s own `default: 8` is filled in by
      ajv's `useDefaults` (vite-plugin-config-validator.ts) before this component sees the config. */
  const rotationSeconds = $derived(pwtConfig.rotation_interval_seconds as number);

  /** The grid's own column and row counts, read once rather than tracked: fixed at the config load
      that named the placement. `untrack` suppresses Svelte's "only captures the initial value"
      warning — intentional here. */
  const gridColumns = untrack(() => pwtConfig.columns);
  const gridRows = untrack(() => pwtConfig.rows);

  /** Sets the grid's column/row counts as CSS custom properties, once. `.grid` reads them back
      with `var()`. */
  function gridShape(node: HTMLElement, shape: { columns: number; rows: number }): void {
    node.style.setProperty('--pwt-columns', String(shape.columns));
    node.style.setProperty('--pwt-rows', String(shape.rows));
  }

  /** Resolves a CSS declaration to real pixels via an absolutely positioned probe — never a class
      name, since `ParkCard.svelte`'s rules are scoped to that component. Each caller passes the
      exact declaration the mark it stands in for uses. */
  function resolved(root: HTMLElement, cssText: string, text = ''): DOMRect {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;${cssText}`;
    probe.textContent = text;
    root.appendChild(probe);
    const box = probe.getBoundingClientRect();
    root.removeChild(probe);
    return box;
  }

  /** One park's header content, read from the payload: its name, and its hours as the text the
      header draws, where it has hours to draw. */
  const headers = $derived(
    pwtPayload.state === 'ok'
      ? pwtPayload.data.parks.map((park) => ({
          name: park.name,
          hours: park.hours ? hoursText(park.hours) : undefined,
        }))
      : [],
  );

  /** The width every card and grid column takes: the widest a park's own header (icon, name,
      hours) draws across the roster, plus the card's own padding/border. Mirrors `ParkCard.svelte`'s
      `.card`/`.identity`/`.icon`/`.name`/`.header`/`.hours` rules. */
  function headerWidthPx(root: HTMLElement, rows: { name: string; hours: string | undefined }[]): number {
    const icon = resolved(root, 'width:var(--type-body);').width;
    const identityGap = resolved(root, 'width:var(--space-xs);').width;
    const nameFont =
      'font-size:var(--type-body);font-weight:var(--type-section-header-weight);' +
      'text-transform:uppercase;letter-spacing:var(--type-section-header-tracking);';
    const headerGap = resolved(root, 'width:var(--space-sm);').width;
    // `.hours` (ParkCard.svelte) renders at body's own lighter weight, not section-header's —
    // this probe mirrors that exactly.
    const hoursFont = 'font-size:var(--type-section-header);font-weight:var(--type-body-weight);';
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
      longest current waits in view -->). Mirrors `ParkCard.svelte`'s `.row`/`.wait`/`.wait.state`
      rules. */
  function waitColumnWidthPx(root: HTMLElement): number {
    // `.tabular-figures` (app.css) sets `font-variant-numeric:tabular-nums` on the rendered figure —
    // mirrored here so '999' probes the same glyph widths the column actually draws.
    const numericWait = 'font-size:var(--type-section-header);font-weight:700;font-variant-numeric:tabular-nums;';
    const stateWait =
      'font-size:var(--type-caption);font-weight:var(--type-caption-weight);' +
      'text-transform:uppercase;letter-spacing:var(--type-section-header-tracking);';
    return Math.ceil(
      Math.max(
        resolved(root, numericWait, '999').width,
        ...WAIT_STATE_WORDS.map((word) => resolved(root, stateWait, word).width),
      ),
    );
  }

  /** Writes `--pwt-card-width` and `--pwt-wait-width` from `headers`, reapplied whenever `headers`
      changes. A card's own height is never written here — every card draws its own
      (`ParkCard.svelte`'s natural-height leaderboard/tour, or its hidden skeleton). */
  function cardGeometry(
    node: HTMLElement,
    rows: { name: string; hours: string | undefined }[],
  ): { update(rows: { name: string; hours: string | undefined }[]): void } {
    function apply(current: { name: string; hours: string | undefined }[]): void {
      node.style.setProperty('--pwt-card-width', `${headerWidthPx(node, current)}px`);
      node.style.setProperty('--pwt-wait-width', `${waitColumnWidthPx(node)}px`);
    }
    apply(rows);
    return { update: apply };
  }

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
          <ParkCard {park} icon={iconFor(park.id)} {rotationSeconds} />
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .park-wait-times {
    /* Sizes to its own content, takes the region's anchor (RegionFrame's `placementStyle()`). */
    min-width: 0;
    /* Left, against the region's own inherited text-align; `.wait` (ParkCard.svelte) and the Closed
       state opt back to `right`/`center` explicitly. */
    text-align: left;
  }

  .waiting {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }

  .grid {
    display: grid;
    /* Every column the same fixed width — `--pwt-card-width` (`cardGeometry`) — the widest a
       park's own header draws. A name too wide for its column scrolls (`ParkCard.svelte`'s
       `marquee`) rather than growing the card. */
    grid-template-columns: repeat(var(--pwt-columns), var(--pwt-card-width));
    grid-template-rows: repeat(var(--pwt-rows), auto);
    gap: var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
    /* Grid's own default (`stretch`) would fill every card to its row's tallest; `start` leaves
       each at its own natural height (ParkCard.svelte). */
    align-items: start;
  }
</style>
