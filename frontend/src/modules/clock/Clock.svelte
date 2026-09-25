<script lang="ts">
  import { untrack } from 'svelte';

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

  // Seconds are written to the node directly, off the reactive graph (meta-wisekiosk #100
  // gpu-compositing); minute and day go through `$state`. `bind:this` writes `null` on teardown.
  let secondsEl: HTMLElement | null | undefined = $state();
  let minuteDate = $state(new Date());
  let dayDate = $state(new Date());
  function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n);
  }
  $effect(() => {
    const write = (): void => {
      const d = new Date();
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
    // Untracked, so write's own reads and writes do not re-run this effect and rebuild the interval.
    untrack(write);
    const reading = setInterval(write, READ_INTERVAL_MS);
    return () => clearInterval(reading);
  });

  // Sliced from hour's index, not 0: some locales lead the string with the day period.
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

  /* Fixed-width slot with the reading out of flow under size containment: a relayout boundary
     for the once-a-second text. */
  .seconds-slot {
    position: relative;
  }

  .seconds-slot::before {
    content: ':';
  }

  /* Sizes the slot to a two-digit tabular reading; generated content, so it is not module text. */
  .seconds-slot::after {
    content: '00';
    visibility: hidden;
  }

  /* `inset` gives size containment a definite box. */
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
