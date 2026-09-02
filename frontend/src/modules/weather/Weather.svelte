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
   *
   * The markup draws each of `payload`'s states. An unavailable module carries the route's own words
   * in the module's own place (SRS001<!-- A failed module shows why, and only that module -->), and a
   * reading is drawn as three parts, each on its own
   * (SRS045<!-- The weather module shows the present weather and the outlook apart from each other -->).
   */
  const { reachable, config, payload }: WeatherProps = $props();

  /**
   * The glyph each WMO 4677 present-weather code draws, on the side of the day the reading falls —
   * codepoints in the bundled icon face
   * ([the display styling contract](../../../docs/contracts/display-styling-contract.md)
   * § Typeface). Seven codes carry one glyph for both sides: overcast, and the heaviest member of
   * each family.
   */
  const SKY_GLYPHS: Record<number, { day: string; night: string }> = {
    0: { day: '\uF00D', night: '\uF02E' },
    1: { day: '\uF00C', night: '\uF081' },
    2: { day: '\uF002', night: '\uF086' },
    3: { day: '\uF013', night: '\uF013' },
    45: { day: '\uF003', night: '\uF04A' },
    48: { day: '\uF003', night: '\uF04A' },
    51: { day: '\uF00B', night: '\uF02B' },
    53: { day: '\uF00B', night: '\uF02B' },
    55: { day: '\uF00B', night: '\uF02B' },
    56: { day: '\uF0B2', night: '\uF0B4' },
    57: { day: '\uF0B2', night: '\uF0B4' },
    61: { day: '\uF008', night: '\uF028' },
    63: { day: '\uF008', night: '\uF028' },
    65: { day: '\uF019', night: '\uF019' },
    66: { day: '\uF006', night: '\uF026' },
    67: { day: '\uF017', night: '\uF017' },
    71: { day: '\uF00A', night: '\uF02A' },
    73: { day: '\uF00A', night: '\uF02A' },
    75: { day: '\uF01B', night: '\uF01B' },
    77: { day: '\uF01B', night: '\uF01B' },
    80: { day: '\uF009', night: '\uF029' },
    81: { day: '\uF009', night: '\uF029' },
    82: { day: '\uF008', night: '\uF028' },
    85: { day: '\uF00A', night: '\uF02A' },
    86: { day: '\uF01B', night: '\uF01B' },
    95: { day: '\uF010', night: '\uF02D' },
    96: { day: '\uF010', night: '\uF02D' },
    99: { day: '\uF01E', night: '\uF01E' },
  };

  /** The face's own not-available mark, drawn where the code names no glyph. */
  const UNREAD_SKY = '\uF07B';

  /** Every WMO 4677 present-weather code a source of this payload emits, and the whole of the set. */
  const SKY_CODES = new Set(Object.keys(SKY_GLYPHS).map(Number));

  /** The mark for one reading. A code the map does not carry draws the not-available one. */
  function skyGlyph(code: number, isDay: boolean): string {
    const pair = SKY_GLYPHS[code];
    if (pair === undefined) return UNREAD_SKY;
    return isDay ? pair.day : pair.night;
  }

  /**
   * What a WMO 4677 present-weather code says the sky is doing. The payload carries the code rather
   * than a supplier's own words, so putting it into words is the drawing's — and it is banded rather
   * than enumerated because the standard's codes are grouped by intensity within a kind, which is a
   * distinction a display glanced at rather than consulted does not carry.
   *
   * A code outside the set above is not named: nothing is drawn for it, rather than the nearest band
   * reported as though the sky had been read.
   */
  function describeSky(code: number): string | undefined {
    if (!SKY_CODES.has(code)) return undefined;
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
      <!-- Drawn rather than left blank: a module that has been asked for but not yet answered is
           neither a reading nor a failure. -->
      <p class="waiting" data-module-loading>Reading the weather…</p>
    {:else if payload.state === 'unavailable'}
      <!-- The hook names the state rather than this module, the state being one every
           upstream-backed module has. -->
      <p class="waiting" data-module-unavailable>{payload.failure.message}</p>
    {:else}
      {@const reading = payload.data}
      {@const sky = describeSky(reading.current.weatherCode)}
      <section class="present" data-weather-present>
        <!-- Day and night are drawn as the mark itself. Which side of the day it is, is the
             payload's rather than the host's clock: the place reported on need not be the place the
             display hangs. -->
        <p class="glyph glyph-present" data-weather-glyph>
          {skyGlyph(reading.current.weatherCode, reading.current.isDay)}
        </p>
        <p class="temp" data-weather-temp>{round(reading.current.temp)}°F</p>
        {#if sky !== undefined}
          <p class="sky" data-weather-sky>{sky}</p>
        {/if}
        <p class="detail" data-weather-detail>
          Feels like {round(reading.current.apparentTemp)}°F · {round(reading.current.humidity)}%
          humidity · {round(reading.current.windSpeed)} mph
        </p>
      </section>

      <section class="series" data-weather-hourly>
        <h2 class="heading">Next hours</h2>
        <ol class="entries">
          {#each reading.hourly as hour (hour.time)}
            {@const hourSky = describeSky(hour.weatherCode)}
            <li class="entry" data-weather-hour>
              <span class="when">{atLocation(hour.time)}</span>
              <!-- Each hour carries its own side of the day: the hours to come cross the location's
                   own sunrise or sunset. -->
              <span class="glyph" data-weather-glyph>{skyGlyph(hour.weatherCode, hour.isDay)}</span>
              <span class="reading">{round(hour.temp)}°F</span>
              {#if hourSky !== undefined}
                <span class="reading">{hourSky}</span>
              {/if}
              <span class="reading">{round(hour.precipProbability)}%</span>
            </li>
          {/each}
        </ol>
      </section>

      <section class="series" data-weather-daily>
        <h2 class="heading">Next days</h2>
        <ol class="entries">
          {#each reading.daily as day (day.time)}
            {@const daySky = describeSky(day.weatherCode)}
            <li class="entry" data-weather-day>
              <span class="when">{dayName(day.time)}</span>
              <span class="reading">{round(day.max)}°F / {round(day.min)}°F</span>
              {#if daySky !== undefined}
                <span class="reading">{daySky}</span>
              {/if}
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

  .glyph {
    /* The icon face and nothing else: no other face carries these marks, so there is no fallback to
       compose. Colour and weight are left unset, so both are inherited whichever glyph is drawn. */
    font-family: 'Weather Icons';
    line-height: 1;
  }

  .glyph-present {
    margin: 0;
    /* The mark for the present reading is set at the reading's own step. */
    font-size: var(--type-headline);
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
