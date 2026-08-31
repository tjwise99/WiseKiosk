<script lang="ts">
  import type { WeatherOptions } from '../../config/types';
  import { getApiWeather, type WeatherPayload } from '../../lib/boundary/client';

  /**
   * `reachable` is declared and acted on, this module being fed by the backend: while it is false the
   * module stands down and renders nothing, the page reporting the one outage for the whole display
   * (docs/contracts/module-contract.md § An unavailable module and an unreachable backend are
   * different states). Leaving the prop undeclared would draw this module's own unavailable box
   * beneath that report, which is the failure that section names.
   */
  const { reachable, config }: { reachable: boolean; config: WeatherOptions } = $props();

  /**
   * How often the module re-reads its route. The freshness obligation is met between the two of them
   * rather than here alone: the route's response cache is what bounds how far behind its source the
   * served answer can be, and this only decides how often the display picks that answer up
   * (docs/contracts/module-contract.md § Cadence and TTL are chosen together). Polls landing inside
   * the cache's hold are answered from it, so this figure is a refresh knob and not a rate.
   */
  const READ_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * How long a read is given before it is abandoned. Without it a request that never settles leaves
   * the module in its first-paint state for as long as the display runs, and a loading state that
   * never resolves is indistinguishable from a module that is broken.
   */
  const REQUEST_TIMEOUT_MS = 10_000;

  /**
   * What stands in the module's place when a read did not come back at all, there being no failure
   * body to take the reason off.
   */
  const UNANSWERED = 'The weather did not come back in time.';

  /** What the module has to draw: nothing yet, a reading, or why there is no reading. */
  type View =
    | { kind: 'loading' }
    | { kind: 'present'; payload: WeatherPayload }
    | { kind: 'unavailable'; message: string };

  let view = $state<View>({ kind: 'loading' });

  /**
   * One read of the route, resolved into what it leaves on screen. The request is the generated
   * client's — the path, the parameters and every status the route answers at come from the one
   * boundary schema, so nothing here is hand-parsed (ADR 0008 rev 4).
   */
  async function read(lat: number, lon: number): Promise<View> {
    let answer;
    try {
      answer = await getApiWeather(
        { lat, lon },
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
    } catch {
      return { kind: 'unavailable', message: UNANSWERED };
    }

    switch (answer.status) {
      case 200:
        return { kind: 'present', payload: answer.data };
      case 400:
      case 429:
      case 502:
      case 503:
      case 504:
        // Both bodies the route answers a failure with spell the reason for a reader the same way,
        // so one branch renders either; which of them arrived is the status, not this module's to
        // retell (SRS001).
        return { kind: 'unavailable', message: answer.data.message };
      default:
        // A status the boundary schema does not describe, which something between the page and the
        // route can still produce. It carries no body this module can read, so it is reported as an
        // answer that did not arrive rather than drawn as an empty box.
        return { kind: 'unavailable', message: UNANSWERED };
    }
  }

  $effect(() => {
    // Read while the backend is serving and not otherwise: an unreachable backend has nothing to
    // answer with, so the timer is not merely ignored but not running — a display left in an outage
    // for days would otherwise go on asking every five minutes for all of them.
    if (!reachable) {
      return;
    }

    const { lat, lon } = config.location;

    // A read that comes back after this effect was torn down belongs to a location, or a
    // reachability, that no longer applies, and writing it would put a stale reading on screen.
    let current = true;
    const once = async () => {
      const settled = await read(lat, lon);
      if (current) {
        view = settled;
      }
    };

    void once();
    const polling = setInterval(() => void once(), READ_INTERVAL_MS);
    return () => {
      current = false;
      clearInterval(polling);
    };
  });

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
    {#if view.kind === 'loading'}
      <!-- Drawn rather than left blank: on an unattended display an empty region reads as a broken
           one, and a module that has asked but not yet been answered is neither. -->
      <p class="waiting" data-module-loading>Reading the weather…</p>
    {:else if view.kind === 'unavailable'}
      <!-- The module's own place, and the route's own words for why (SRS001). The hook names the
           state rather than this module, the state being one every upstream-backed module has. -->
      <p class="waiting" data-module-unavailable>{view.message}</p>
    {:else}
      {@const payload = view.payload}
      <!-- Three parts, each drawn on its own: what it is doing now, the hours next to come and the
           days next to come (SRS045). -->
      <section class="present" data-weather-present>
        <p class="temp" data-weather-temp>{round(payload.current.temp)}°F</p>
        <p class="sky" data-weather-sky>{describeSky(payload.current.weatherCode)}</p>
        <p class="detail" data-weather-detail>
          Feels like {round(payload.current.apparentTemp)}°F · {round(payload.current.humidity)}%
          humidity · {round(payload.current.windSpeed)} mph
        </p>
      </section>

      <section class="series" data-weather-hourly>
        <h2 class="heading">Next hours</h2>
        <ol class="entries">
          {#each payload.hourly as hour (hour.time)}
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
          {#each payload.daily as day (day.time)}
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
