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

  // The host's locale arranges each of these and decides how its parts are written; the
  // configuration decides only which hour cycle is used and which parts are present at all.
  const timeFormat = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      ...(showSeconds ? { second: '2-digit' as const } : {}),
      hourCycle: twentyFourHour ? 'h23' : 'h12',
    }),
  );
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
</script>

<div class="clock" data-clock>
  <p class="time" data-clock-time>{timeFormat.format(now)}</p>
  {#if showDate}
    <p class="date" data-clock-date>{dateFormat.format(now)}</p>
  {/if}
</div>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    /* The region holds its track and the content leaves it, which is the frame's rule rather than
       something this module decides for itself. */
    min-width: 0;
  }

  .time {
    margin: 0;
    font-size: var(--type-headline);
    font-weight: var(--type-headline-weight);
    /* Digits of one width, so a display re-rendering every second does not shift its own layout as
       the numerals change. */
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .date {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
    line-height: 1;
  }
</style>
