<script lang="ts">
  import type { WeatherProps } from './props';

  /**
   * The module draws from its props and fetches nothing
   * (docs/contracts/module-contract.md § The six parts, part 1): the shell reads the route and hands
   * the answer down as `payload`, already resolved into not-yet-read, read, or read-and-failed.
   *
   * `reachable` is declared and acted on, this module being fed by the backend: while it is false the
   * module stands down and renders nothing, the page reporting the one outage for the whole display
   * (§ An unavailable module and an unreachable backend are different states). Leaving the prop
   * undeclared would draw this module's own unavailable box beneath that report, which is the failure
   * that section names.
   *
   * `config` is declared because part 1 hands every module its configuration. The location in it is
   * what the shell reads the route with, so nothing below has to read it a second time.
   */
  const { reachable, config, payload }: WeatherProps = $props();

  /**
   * What a WMO 4677 present-weather code says the sky is doing. The payload carries the code rather
   * than a supplier's own words, so putting it into words is the drawing's — and it is banded rather
   * than enumerated because the standard's codes are grouped by intensity within a kind, which is a
   * distinction a display glanced at rather than consulted does not carry.
   */
  function describeSky(code: number): string {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Cloudy';
    if (code <= 48) return 'Fog';
    if (code <= 57) return 'Drizzle';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    if (code <= 86) return 'Snow showers';
    return 'Thunderstorm';
  }

  /**
   * The hour a forecast entry is for, as it reads at the location. The timestamp carries that
   * location's own UTC offset, so its clock fields are already the local ones and are taken as
   * written; handing the string to a Date would re-read them against the host's zone, which is a
   * different place whenever the display is not at the location it reports on.
   */
  function atLocation(time: string): string {
    return time.slice(11, 16);
  }

  /**
   * The day a forecast entry is for, by name. The calendar date is taken from the timestamp as
   * written, for the reason above, and then named through UTC so the host's zone cannot move it
   * across midnight.
   */
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
  function dayName(time: string): string {
    return weekday.format(new Date(`${time.slice(0, 10)}T00:00:00Z`));
  }

  const round = (value: number) => Math.round(value);
</script>

{#if reachable}
  <div class="weather" data-weather>
    {#if payload.state === 'loading'}
      <!-- Drawn rather than left blank: on an unattended display an empty region reads as a broken
           one, and a module that has been asked for but not yet answered is neither. -->
      <p class="waiting" data-module-loading>Reading the weather…</p>
    {:else if payload.state === 'unavailable'}
      <!-- The module's own place, and the route's own words for why (SRS001). The hook names the
           state rather than this module, the state being one every upstream-backed module has. -->
      <p class="waiting" data-module-unavailable>{payload.failure.message}</p>
    {:else}
      {@const reading = payload.data}
      <!-- Three parts, each drawn on its own: what it is doing now, the hours next to come and the
           days next to come (SRS045). -->
      <section class="present" data-weather-present>
        <p class="temp" data-weather-temp>{round(reading.current.temp)}°F</p>
        <p class="sky" data-weather-sky>{describeSky(reading.current.weatherCode)}</p>
        <p class="detail" data-weather-detail>
          Feels like {round(reading.current.apparentTemp)}°F · {round(reading.current.humidity)}%
          humidity · {round(reading.current.windSpeed)} mph
        </p>
      </section>

      <section class="series" data-weather-hourly>
        <h2 class="heading">Next hours</h2>
        <ol class="entries">
          {#each reading.hourly as hour (hour.time)}
            <li class="entry" data-weather-hour>
              <span class="when">{atLocation(hour.time)}</span>
              <span class="reading">{round(hour.temp)}°F</span>
              <span class="reading">{describeSky(hour.weatherCode)}</span>
              <span class="reading">{round(hour.precipProbability)}%</span>
            </li>
          {/each}
        </ol>
      </section>

      <section class="series" data-weather-daily>
        <h2 class="heading">Next days</h2>
        <ol class="entries">
          {#each reading.daily as day (day.time)}
            <li class="entry" data-weather-day>
              <span class="when">{dayName(day.time)}</span>
              <span class="reading">{round(day.max)}°F / {round(day.min)}°F</span>
              <span class="reading">{describeSky(day.weatherCode)}</span>
              <span class="reading">{round(day.precipProbability)}%</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </div>
{/if}

<style>
  .weather {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    /* The region holds its track and the content leaves it, which is the frame's rule rather than
       something this module decides for itself. */
    min-width: 0;
  }

  .waiting {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  .present {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .temp {
    margin: 0;
    font-size: var(--type-headline);
    font-weight: var(--type-headline-weight);
    /* Digits of one width, so a reading that changes under the display does not shift the layout
       around it. */
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .sky {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
    line-height: 1;
  }

  .detail {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
  }

  .series {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .heading {
    margin: 0;
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
    letter-spacing: var(--type-section-header-tracking);
    text-transform: uppercase;
  }

  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .entry {
    display: flex;
    gap: var(--space-sm);
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .when {
    /* The column the readings start from, so the rows line up without a table. Stated against the
       display's own height, in the unit the rest of the scale is stated in. */
    flex: 0 0 8vh;
  }

  .reading {
    min-width: 0;
  }
</style>
