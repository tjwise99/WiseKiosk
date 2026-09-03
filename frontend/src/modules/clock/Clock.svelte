<script lang="ts">
  import type { ClockOptions } from '../../config/types';

  // No `reachable` prop is declared: the module fetches nothing, so an outage takes nothing from it
  // (docs/contracts/module-contract.md § An unavailable module and an unreachable backend are
  // different states). Svelte drops the prop the frame forwards to every module alike.
  const { config }: { config: ClockOptions } = $props();

  // Read as given: the validator writes each key's schema default into the configuration, so an
  // absent key arrives already at its default rather than being defaulted a second time here.
  const twentyFourHour = $derived(config.twenty_four_hour);
  const showSeconds = $derived(config.show_seconds);
  const showDate = $derived(config.show_date);

  // The host clock is re-read every second, so the shown time stays current to the second whether or
  // not seconds are drawn. A cadence, not a phase: the reading trails the host by wherever in the
  // second the page mounted, and each reading takes the host's value afresh, so nothing accumulates.
  const READ_INTERVAL_MS = 1000;

  let now = $state(new Date());
  $effect(() => {
    const reading = setInterval(() => {
      now = new Date();
    }, READ_INTERVAL_MS);
    return () => clearInterval(reading);
  });

  // `formatToParts()` splits one Intl.DateTimeFormat covering hour, minute, second and — in
  // twelve-hour form — the day period into its named parts. Hour precedes minute in every locale's
  // part ordering, so the two are joined into the core time by slicing up to and including minute;
  // second and day period feed the two sibling annotations below (./README.md § The reading).
  const timeFormat = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: twentyFourHour ? 'h23' : 'h12',
    }),
  );
  const timeParts = $derived(timeFormat.formatToParts(now));
  const hoursMinutes = $derived(
    timeParts
      .slice(0, timeParts.findIndex((part) => part.type === 'minute') + 1)
      .map((part) => part.value)
      .join(''),
  );
  const secondsText = $derived(timeParts.find((part) => part.type === 'second')?.value ?? '');
  const meridiemText = $derived(timeParts.find((part) => part.type === 'dayPeriod')?.value ?? '');

  // The date's two lines each read from their own formatter — weekday, then day/month/year — each
  // in its own locale ordering.
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
          <span class="seconds tabular-figures">:{secondsText}</span>
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
      <p class="weekday section-label">{weekdayFormat.format(now)}</p>
      <p class="full-date tabular-figures">{fullDateFormat.format(now)}</p>
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
    justify-content: space-between;
    align-items: flex-start;
  }

  .seconds,
  .meridiem {
    margin: 0;
    font-size: var(--type-annotation);
    font-weight: var(--type-annotation-weight);
    line-height: 1;
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
    min-width: 0;
  }

  .weekday {
    margin: 0;
    font-size: var(--type-title);
    font-weight: var(--type-title-weight);
    line-height: 1;
  }

  .full-date {
    margin: 0;
    font-size: var(--type-title);
    font-weight: var(--type-title-weight);
    line-height: 1;
  }
</style>
