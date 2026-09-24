<script lang="ts">
  import type { ClockOptions } from '../../config/types';
  import type { CommonProps } from '../../lib/modules';
  import { partValue } from './parts';

  // No `reachable` prop is declared: the module fetches nothing, so an outage takes nothing from it
  // (docs/contracts/module-contract.md § An unavailable module and an unreachable backend are
  // different states). Svelte drops the prop the frame forwards to every module alike.
  const { config }: CommonProps = $props();

  // Narrowed to the concrete options type — safe because config validation already ran by the
  // time this does (ADR 0007 rev 2), same basis as modules.ts's `read` cast. `$derived` keeps the
  // cast reactive to `config`.
  const clockConfig = $derived(config as ClockOptions);

  // Read as given: the validator writes each key's schema default into the configuration, so an
  // absent key arrives already at its default rather than being defaulted a second time here.
  const twentyFourHour = $derived(clockConfig.twenty_four_hour);
  const showSeconds = $derived(clockConfig.show_seconds);
  const showDate = $derived(clockConfig.show_date);

  // The host clock is re-read every second, so the shown time stays current to the second whether or
  // not seconds are drawn. A cadence, not a phase: the reading trails the host by wherever in the
  // second the page mounted, and each reading takes the host's value afresh, so nothing accumulates.
  const READ_INTERVAL_MS = 1000;

  // The per-second update is what paces the periodic full GC on this host: not the value it computes
  // but Svelte's reactive re-render of it, once a second, for the life of the page (meta-wisekiosk
  // #100 gpu-compositing — the reactive update is the driver, not the allocation inside it). So the
  // seconds are written straight to the DOM node (`secondsEl.textContent`), off the reactive graph
  // entirely; only the minute and the day — which change rarely — go through `$state`/`$derived`,
  // where a reactive update once a minute or once a day costs nothing.
  // Typed to the three values the binding carries, not two: Svelte writes `null` back through
  // `bind:this` as it destroys the block owning the element, so a type admitting only `undefined`
  // leaves the guard below looking total to the compiler though a `null` is what the runtime writes.
  // Precautionary, not a reachable path: this block is gated on `clockConfig`, fixed at load, so it
  // only tears down with the whole component — unlike ParkWaitTimes.svelte's `gridEl`, which turns
  // over on a live `reachable` toggle.
  let secondsEl: HTMLElement | null | undefined = $state();
  let minuteDate = $state(new Date());
  let dayDate = $state(new Date());
  function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n);
  }
  $effect(() => {
    const write = (): void => {
      const d = new Date();
      // The write is the fix, not an oversight: the seconds are kept off the reactive graph because
      // Svelte's re-render of them once a second is what paced the periodic full GC on this host
      // (meta-wisekiosk #100 gpu-compositing), so the rule's own remedy — render it reactively — is
      // the defect here. Confined to this one text node, which no template expression also writes.
      // eslint-disable-next-line svelte/no-dom-manipulating
      if (secondsEl) secondsEl.textContent = pad2(d.getSeconds());
      if (d.getHours() !== minuteDate.getHours() || d.getMinutes() !== minuteDate.getMinutes()) {
        minuteDate = d;
      }
      if (
        d.getDate() !== dayDate.getDate() ||
        d.getMonth() !== dayDate.getMonth() ||
        d.getFullYear() !== dayDate.getFullYear()
      ) {
        dayDate = d;
      }
    };
    write();
    const reading = setInterval(write, READ_INTERVAL_MS);
    return () => clearInterval(reading);
  });

  // `formatToParts()` splits one Intl.DateTimeFormat covering hour, minute and — in twelve-hour form
  // — the day period into its named parts, off `minuteDate` so it re-runs once a minute rather than
  // once a second. Hour precedes minute in every locale's part ordering, but the day period does not
  // reliably follow both (some locales lead the whole string with it), so the core time is sliced
  // from hour's own index rather than from 0; the day period feeds the meridiem annotation below.
  const timeFormat = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: twentyFourHour ? 'h23' : 'h12',
    }),
  );
  const timeParts = $derived(timeFormat.formatToParts(minuteDate));
  const hoursMinutes = $derived(
    timeParts
      .slice(
        timeParts.findIndex((part) => part.type === 'hour'),
        timeParts.findIndex((part) => part.type === 'minute') + 1,
      )
      .map((part) => part.value)
      .join(''),
  );
  const meridiemText = $derived(partValue(timeParts, 'dayPeriod'));

  // The date's two lines each read from their own formatter — weekday, then day/month/year — off
  // `dayDate`, so each re-runs once a day rather than once a second, in its own locale ordering.
  const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const fullDateFormat = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
</script>

<div class="clock" data-clock>
  <div class="time-group">
    <p class="time tabular-figures" data-clock-time>{hoursMinutes}</p>
    {#if showSeconds || !twentyFourHour}
      <div class="annotations">
        {#if showSeconds}
          <span class="seconds-slot tabular-figures">
            <span class="seconds tabular-figures" bind:this={secondsEl}></span>
          </span>
        {/if}
        {#if !twentyFourHour}
          <span class="meridiem">{meridiemText}</span>
        {/if}
      </div>
    {/if}
  </div>
  {#if showDate}
    <div class="rule"></div>
    <div class="date" data-clock-date>
      <p class="weekday section-label">{weekdayFormat.format(dayDate)}</p>
      <p class="full-date tabular-figures">{fullDateFormat.format(dayDate)}</p>
    </div>
  {/if}
</div>

<style>
  .clock {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    /* The region holds its track and the content leaves it, which is the frame's rule rather than
       something this module decides for itself. */
    min-width: 0;
  }

  .time-group {
    display: flex;
    align-items: stretch;
    gap: var(--space-xs);
  }

  .time {
    margin: 0;
    font-size: var(--type-display);
    font-weight: var(--type-display-weight);
    line-height: 1;
  }

  /* Seconds above the meridiem, stretched to the time's own height (./README.md § The reading). */
  .annotations {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .seconds-slot,
  .meridiem {
    margin: 0;
    font-size: var(--type-annotation);
    font-weight: var(--type-annotation-weight);
    line-height: 1;
  }

  /* The reading is the only text on the display that changes every second, and in flow that
     costs a whole-page layout: no box between it and the document has a content-independent
     size, so the engine has no relayout boundary to root at and re-lays out every box on the
     page once a second. The slot holds the reading's box open with values that never change;
     the reading sits out of flow inside it under size containment, which is what makes it a
     boundary the engine can root at. Both halves are needed — size containment alone leaves
     the box in flow, where it still participates in its parent's sizing. */
  .seconds-slot {
    position: relative;
  }

  /* The separator as CSS, not in the text node shared with `secondsText`: avoids the same
     nullish-fallback branch App.svelte's edgeBandStyle comment describes. It sits on the slot
     rather than the reading so that it is the slot, not the once-a-second text, that is laid
     out against it. */
  .seconds-slot::before {
    content: ':';
  }

  /* Never updated and never painted: it exists only to hold the slot as wide as the reading,
     measured from the font rather than from a number written here. Tabular figures make every
     two-digit reading exactly this wide. Generated content rather than an element, so the
     digits that size the slot stay out of the module's text — a test reading the clock reads
     the reading, not the reading twice. */
  .seconds-slot::after {
    content: '00';
    visibility: hidden;
  }

  /* `inset` takes the box from the slot, so size containment has a definite box to apply and
     cannot collapse it. Right-aligned to land on the digits the slot is sized by. */
  .seconds {
    position: absolute;
    inset: 0;
    text-align: right;
    contain: size layout;
  }

  /* Pinned to the bottom by its own margin rather than by `justify-content: space-between` on the
     parent, so the meridiem still sits low when it is the annotations column's only child (seconds
     off, twelve-hour form) rather than reverting to the column's top. */
  .meridiem {
    margin-top: auto;
  }

  /* The dim divider between time and date (./README.md § Grouping), rendered only alongside the
     date it separates. */
  .rule {
    align-self: stretch;
    width: var(--divider-stroke-width);
    background: var(--emission-stroke);
  }

  .date {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  /* Two lines, never more: `.clock`'s own `min-width: 0` is the one place this module lets its box
     shrink to its track (../README.md's composition is two date lines, not three from a wrapped
     one); `nowrap` keeps each line unbreakable so a region too narrow for it is exceeded rather than
     folded onto a further line, the same overflow the frame itself leaves to the content
     (../../../lib/RegionFrame.svelte's `.region`, no clipping rule of its own). */
  .weekday,
  .full-date {
    margin: 0;
    font-size: var(--type-title);
    font-weight: var(--type-title-weight);
    line-height: 1;
    white-space: nowrap;
  }
</style>
