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
   * reading is drawn as three differently-treated parts — a block, a curve, a strip — each on its own
   * (SRS045<!-- The weather module shows the present weather and the outlook apart from each other -->),
   * per the module's own UI design spec (./README.md).
   */
  const { reachable, config, payload }: WeatherProps = $props();

  /**
   * The glyph each WMO 4677 present-weather code draws, on the side of the day the reading falls —
   * codepoints in the bundled icon face
   * (docs/contracts/display-styling-contract.md § Typeface). Seven codes carry one glyph for both
   * sides: overcast, and the heaviest member of each family.
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

  /**
   * The mark for one reading, drawn on the side of the day that reading itself carries rather than
   * the side the page's own clock is on: the present reading is handed its flag and each hour to
   * come is handed its own
   * (SRS050<!-- The weather module draws day and night apart -->). A code the map does not carry
   * draws the not-available one.
   */
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
   * The hour a forecast entry is for, as it reads at the location, e.g. `23h`. The timestamp carries
   * that location's own UTC offset, so its clock fields are already the local ones and are taken as
   * written; handing the string to a Date would re-read them against the host's zone, which is a
   * different place whenever the display is not at the location it reports on.
   */
  function atLocation(time: string): string {
    return `${time.slice(11, 13)}h`;
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

  /** The curve's own coordinate system: arbitrary units a `viewBox` maps onto whatever width and
      height the layout gives the SVG, with `vector-effect="non-scaling-stroke"` on the polyline
      keeping the drawn stroke a constant rendered width regardless of that mapping. */
  const CURVE_VIEWBOX_WIDTH = 100;
  const CURVE_VIEWBOX_HEIGHT = 30;
  const CURVE_PADDING = 6;

  /** One hourly vertex, in the curve's own viewBox units and as a fraction (0–1) of that viewBox.
      The fraction is what DOM-positioned content — the vertex dots, the tracking labels — lines up
      against: the viewBox is stretched non-uniformly onto whatever box holds it
      (`preserveAspectRatio="none"`), so a fraction of it, not a measured pixel, is the coordinate
      that still matches the drawn curve. */
  interface CurveVertex {
    x: number;
    y: number;
    xFraction: number;
    yFraction: number;
  }

  /**
   * The hourly temperature curve's vertices, one per hour, computed fresh from the props each render
   * rather than measured from the laid-out page — the module never reads its own layout back. A
   * vertex's x is its column's centre in an n-column strip, matching the strip cells beneath it; its
   * y is the temperature's place between the coldest and warmest hour shown, inverted because SVG y
   * grows downward. A flat set of hours (min equals max) draws a level line at the row's centre
   * rather than dividing by zero.
   */
  function curveVertices(hours: { temp: number }[]): CurveVertex[] {
    const temps = hours.map((hour) => hour.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = max - min;
    const usableHeight = CURVE_VIEWBOX_HEIGHT - 2 * CURVE_PADDING;
    return hours.map((hour, index) => {
      const x = ((index + 0.5) / hours.length) * CURVE_VIEWBOX_WIDTH;
      const y =
        span === 0
          ? CURVE_VIEWBOX_HEIGHT / 2
          : CURVE_PADDING + ((max - hour.temp) / span) * usableHeight;
      return { x, y, xFraction: x / CURVE_VIEWBOX_WIDTH, yFraction: y / CURVE_VIEWBOX_HEIGHT };
    });
  }

  /** The polyline `points` attribute for a curve's vertices. */
  function curvePoints(vertices: CurveVertex[]): string {
    return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ');
  }

  /** Where a vertex's dot sits over the curve — the same box the SVG fills, so `left`/`top` as a
      plain fraction of it lines up with the drawn curve. */
  function vertexStyle(vertex: CurveVertex): string {
    return `left: ${vertex.xFraction * 100}%; top: ${vertex.yFraction * 100}%;`;
  }

  /** Where a vertex's temperature label sits in `.labels` — `left` the same column as its dot,
      `bottom` the same fraction inverted, scaled against the curve's own height (`--space-lg`)
      rather than the label band's, which is taller by the label's own line height so the warmest
      hour's label — the one riding highest — never clips the band it is drawn in. */
  function labelStyle(vertex: CurveVertex): string {
    return `left: ${vertex.xFraction * 100}%; bottom: calc(${1 - vertex.yFraction} * var(--space-lg));`;
  }
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
      {@const vertices = curveVertices(reading.hourly)}
      <!-- Present, per ./README.md § Present. -->
      <section class="present" data-weather-present>
        <div class="present-reading">
          <p class="glyph glyph-present" data-weather-glyph>
            {skyGlyph(reading.current.weatherCode, reading.current.isDay)}
          </p>
          <p class="temp tabular-figures" data-weather-temp>{round(reading.current.temp)}°F</p>
        </div>
        {#if sky !== undefined}
          <p class="sky" data-weather-sky>{sky}</p>
        {/if}
        <p class="detail" data-weather-detail>
          Feels like {round(reading.current.apparentTemp)}°F · {round(reading.current.humidity)}%
          humidity · {round(reading.current.windSpeed)} mph
        </p>
      </section>

      <!-- Next hours, per ./README.md § Next hours. -->
      <section class="series" data-weather-hourly>
        <h2 class="heading section-label">Next hours</h2>
        <div class="curve">
          <!-- The plot area — the tracking labels and the curve, dot-vertexed — bracketed by a dim
               L-shaped axis on its left and bottom (border-left, border-bottom); the strip below is
               outside the bracket, reading as the axis's own tick labels. -->
          <div class="plot">
            <div class="labels">
              {#each reading.hourly as hour, index (hour.time)}
                <span
                  class="label tabular-figures"
                  data-weather-hour-label
                  style={labelStyle(vertices[index])}
                  >{round(hour.temp)}°</span
                >
              {/each}
            </div>
            <div class="curve-area">
              <svg
                class="curve-svg"
                viewBox="0 0 {CURVE_VIEWBOX_WIDTH} {CURVE_VIEWBOX_HEIGHT}"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  class="curve-line"
                  points={curvePoints(vertices)}
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              {#each reading.hourly as hour, index (hour.time)}
                <span class="vertex" data-weather-vertex style={vertexStyle(vertices[index])}
                ></span>
              {/each}
            </div>
          </div>
          <ol class="strip" style="--strip-count:{reading.hourly.length}">
            {#each reading.hourly as hour (hour.time)}
              <li class="cell" data-weather-hour>
                <span class="when">{atLocation(hour.time)}</span>
                <span class="glyph" data-weather-glyph>{skyGlyph(hour.weatherCode, hour.isDay)}</span>
                <span class="reading tabular-figures">{round(hour.precipProbability)}%</span>
              </li>
            {/each}
          </ol>
        </div>
      </section>

      <!-- Next days, per ./README.md § Next days. -->
      <section class="series" data-weather-daily>
        <h2 class="heading section-label">Next days</h2>
        <ol class="strip" style="--strip-count:{reading.daily.length}">
          {#each reading.daily as day (day.time)}
            <li class="cell" data-weather-day>
              <span class="when">{dayName(day.time)}</span>
              <span class="glyph" data-weather-glyph>{skyGlyph(day.weatherCode, true)}</span>
              <span class="reading tabular-figures">{round(day.max)}°/{round(day.min)}°</span>
              <span class="reading tabular-figures">{round(day.precipProbability)}%</span>
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
    /* Sibling groups sharing this region — present, hours, days. */
    gap: var(--space-lg);
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
    gap: var(--space-sm);
  }

  .present-reading {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
  }

  .temp {
    margin: 0;
    font-size: var(--type-headline);
    font-weight: var(--type-headline-weight);
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
    margin: 0 0 var(--space-md) 0;
    padding-bottom: var(--space-xs);
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
    /* Enhancement only, per ./README.md § Grouping, and coherence with the rest of the display. */
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
  }

  /* The plot area (the labels and the curve) and the strip beneath it all read against the same
     n-column layout, so a vertex the curve draws lines up under its own label and its own strip
     cell without measuring anything laid out. */
  .curve {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* Brackets the plot area only — the tracking labels and the curve — on its left and bottom, the
     same dim-stroke pairing `.heading`'s own divider draws with. The strip stays outside it,
     reading as the axis's tick labels. */
  .plot {
    position: relative;
    border-left: var(--divider-stroke-width) solid var(--emission-stroke);
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
  }

  /* Sized to hold every label's full vertical travel (`--space-lg`, the curve's own height) plus
     one label's own line height, so a label positioned within it by `.label`'s `bottom` never
     overflows the section this module is drawn in. */
  .labels {
    position: relative;
    height: calc(var(--space-lg) + var(--type-caption) + var(--space-xs));
  }

  .label {
    position: absolute;
    transform: translateX(-50%);
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
    white-space: nowrap;
  }

  .curve-area {
    position: relative;
    width: 100%;
    height: var(--space-lg);
  }

  .curve-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .curve-line {
    fill: none;
    /* Content, so drawn at the display's full emission like the glyphs and figures around it
       (SRS032<!-- Readable text is carried at full emission -->), correct by construction: the
       stroke is the same token every readable glyph on the page is coloured with. */
    stroke: var(--emission-content);
    stroke-width: var(--curve-stroke-width);
    stroke-linejoin: round;
  }

  /* One filled dot per hourly vertex, positioned by the same fraction the curve itself is drawn
     with — a plain SVG `<circle>` would draw as an ellipse under the curve's non-uniform viewBox
     (`preserveAspectRatio="none"`), so the dot is a DOM element over the same box instead. Content,
     so drawn at full emission like the curve it sits on
     (SRS032<!-- Readable text is carried at full emission -->). */
  .vertex {
    position: absolute;
    width: 0.6vh;
    height: 0.6vh;
    border-radius: 50%;
    background: var(--emission-content);
    transform: translate(-50%, -50%);
  }

  .strip {
    display: grid;
    grid-template-columns: repeat(var(--strip-count), 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    text-align: center;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
  }

  .reading {
    min-width: 0;
  }
</style>
