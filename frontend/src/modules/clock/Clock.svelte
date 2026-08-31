<script lang="ts">
  import type { ClockOptions } from '../../config/types';

  /**
   * How often the host clock is re-read. One second is the smallest unit the module presents, so a
   * coarser interval would show a second that skips and a finer one would re-render for nothing.
   */
  const READ_INTERVAL_MS = 1000;

  /**
   * `reachable` is deliberately not declared, and that is the whole of what this module does about an
   * outage: it fetches nothing, so a backend that is gone takes nothing from it and it keeps
   * rendering beneath the page's own report (docs/contracts/module-contract.md § An unavailable
   * module and an unreachable backend are different states). Svelte drops a prop the component does
   * not declare, so the frame forwarding it to every module alike costs this one nothing.
   */
  const { config }: { config: ClockOptions } = $props();

  // An absent key takes the default its section of the configuration schema declares; the two are
  // read together, and a placement supplying no options at all is the same case.
  const twentyFourHour = $derived(config.twenty_four_hour ?? true);
  const showSeconds = $derived(config.show_seconds ?? true);
  const showDate = $derived(config.show_date ?? true);

  /**
   * The host's time, re-read on an interval rather than once at mount: the display is left running
   * for weeks, and a value taken at mount is wrong within a minute. Each reading replaces the value
   * rather than mutating it, which is what the rune tracks.
   */
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
