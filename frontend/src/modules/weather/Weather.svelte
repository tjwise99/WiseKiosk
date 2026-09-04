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
   * The day a forecast entry is for, by name. The calendar date is taken from the timestamp as
   * written — the timestamp carries the location's own UTC offset, so its fields are already the
   * local ones and are taken without re-reading them against the host's zone — and then named
   * through UTC so the host's zone cannot move it across midnight.
   */
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
  function dayName(time: string): string {
    return weekday.format(new Date(`${time.slice(0, 10)}T00:00:00Z`));
  }

  const round = (value: number) => Math.round(value);

  /**
   * Which of the two hourly series the curve is currently drawing. Both share the plot; only one is
   * ever on screen, so `active` is the one flag that says which.
   */
  type SeriesKind = 'temperature' | 'precipitation';

  /** The switch cadence to fall back to should the config arrive without the schema's own default
      populated — the placement's `series_switch_seconds`, config/schema.json's own default. */
  const DEFAULT_SWITCH_SECONDS = 10;

  let active = $state<SeriesKind>('temperature');
  $effect(() => {
    const seconds = config.series_switch_seconds ?? DEFAULT_SWITCH_SECONDS;
    const toggle = setInterval(() => {
      active = active === 'temperature' ? 'precipitation' : 'temperature';
    }, seconds * 1000);
    return () => clearInterval(toggle);
  });

  const SERIES_LABEL: Record<SeriesKind, string> = {
    temperature: 'Temperature',
    precipitation: 'Precipitation',
  };
  const SERIES_UNIT: Record<SeriesKind, string> = {
    temperature: '°',
    precipitation: '%',
  };

  /** The active series' own reading for one hour — what the curve, the y-axis and the vertex dots
      are all drawn against. */
  function seriesValues(hours: { temp: number; precipProbability: number }[], kind: SeriesKind): number[] {
    return kind === 'temperature' ? hours.map((hour) => hour.temp) : hours.map((hour) => hour.precipProbability);
  }

  /** The curve's own coordinate system: arbitrary units a `viewBox` maps onto whatever width and
      height the layout gives the SVG, with `vector-effect="non-scaling-stroke"` on the polyline
      keeping the drawn stroke a constant rendered width regardless of that mapping. */
  const CURVE_VIEWBOX_WIDTH = 100;
  const CURVE_VIEWBOX_HEIGHT = 30;

  /** How many equal steps the y-axis aims to divide into, wide range or narrow — enough ticks to
      read the scale by by without crowding the label strip beside it (owner-specified). */
  const TARGET_INTERVALS = 4;

  /** The whole-number progression a wide-range axis's step is drawn from — no 2.5 multiple, so the
      step at any power of ten stays a whole number and the wide case never needs a decimal tick. */
  const WIDE_STEP_MULTIPLES = [1, 2, 5, 10];

  /** Above this range, in the active series' own units, the axis is bracketed to whole numbers; at
      or below it the axis hugs the data instead, so a genuine one- or two-unit swing still fills the
      plot's height rather than drowning in a forced whole-number span (owner-specified). */
  const WIDE_RANGE_THRESHOLD = 1.5;

  /** Never let two ticks of a narrow-range axis sit closer than this, in the active series' own
      units — the floor that keeps a near-flat run of readings from being sliced into ticks finer
      than are worth drawing. Data flatter than this floor (identical readings, or a genuinely
      all-zero precipitation run) is drawn against the small fallback span below instead of against
      its own near-zero range. */
  const MIN_TICK_GRANULARITY = 0.25;

  /** How wide a degenerate (flat, or all-zero) series' axis is drawn, so its curve still renders as
      a flat line rather than a division by zero. */
  const DEGENERATE_SPAN = 1;

  /** A y-axis tick: its value, its label, and its place on the axis as a fraction (0 at the top,
      1 at the bottom — inverted because SVG y grows downward). */
  interface YAxisTick {
    value: number;
    label: string;
    yFraction: number;
  }

  /** The y-axis's scale: the bottom and top tick values it brackets the data with, and the ticks
      themselves. */
  interface YAxisScale {
    bottom: number;
    top: number;
    ticks: YAxisTick[];
  }

  /** Where a value sits between the scale's bottom and top, as a fraction — 0 at the top, 1 at the
      bottom. */
  function scaleFraction(value: number, scale: { bottom: number; top: number }): number {
    return (scale.top - value) / (scale.top - scale.bottom);
  }

  /** A tick's label: a whole number for a wide-range axis, a decimal (rounded to hundredths, with
      any trailing zeros dropped) for a narrow or degenerate one — decimals are only ever drawn where
      the axis itself is tight enough for them to mean something. */
  function tickLabel(value: number, unit: string, decimals: boolean): string {
    const shown = decimals ? Math.round(value * 100) / 100 : Math.round(value);
    return `${shown}${unit}`;
  }

  /** A step at or above `rawStep`, from the whole-number progression, at whatever power of ten
      `rawStep` falls in — the classic nice-number step, floored at one unit so a wide axis's step is
      always a whole number. */
  function wholeStep(rawStep: number): number {
    const floored = Math.max(rawStep, 1);
    const magnitude = 10 ** Math.floor(Math.log10(floored));
    const multiple = WIDE_STEP_MULTIPLES.find((candidate) => candidate * magnitude >= floored - 1e-9);
    return (multiple ?? WIDE_STEP_MULTIPLES[WIDE_STEP_MULTIPLES.length - 1]!) * magnitude;
  }

  /** The wide-range axis: bounds bracketed out to whole numbers, ticks at nice whole-ish steps
      within them. */
  function wideScale(dataMin: number, dataMax: number, unit: string): YAxisScale {
    const bottom = Math.floor(dataMin);
    const top = Math.ceil(dataMax);
    const step = wholeStep((top - bottom) / TARGET_INTERVALS);
    const values: number[] = [];
    for (let value = Math.ceil(bottom / step) * step; value <= top + 1e-9; value += step) {
      values.push(value);
    }
    if (values.length < 2) {
      values.splice(0, values.length, bottom, top);
    }
    return {
      bottom,
      top,
      ticks: values.map((value) => ({
        value,
        label: tickLabel(value, unit, false),
        yFraction: scaleFraction(value, { bottom, top }),
      })),
    };
  }

  /** The narrow-range axis: bounds hugging the data exactly, ticks evenly spaced between them at no
      finer than `MIN_TICK_GRANULARITY`. */
  function narrowScale(dataMin: number, dataMax: number, unit: string): YAxisScale {
    const bottom = dataMin;
    const top = dataMax;
    const range = top - bottom;
    const intervals = Math.max(1, Math.min(TARGET_INTERVALS, Math.floor(range / MIN_TICK_GRANULARITY)));
    const step = range / intervals;
    const ticks = Array.from({ length: intervals + 1 }, (_, index) => {
      const value = bottom + index * step;
      return {
        value,
        label: tickLabel(value, unit, true),
        yFraction: scaleFraction(value, { bottom, top }),
      };
    });
    return { bottom, top, ticks };
  }

  /** The degenerate-range axis: a small fallback span centred on the data (or resting on zero, where
      the data itself is zero — the common case for a quiet stretch of precipitation), so the curve
      still draws as a flat line rather than dividing by a zero range. */
  function degenerateScale(value: number, unit: string): YAxisScale {
    const bottom = value === 0 ? 0 : value - DEGENERATE_SPAN / 2;
    const top = value === 0 ? DEGENERATE_SPAN : value + DEGENERATE_SPAN / 2;
    const step = (top - bottom) / TARGET_INTERVALS;
    const ticks = Array.from({ length: TARGET_INTERVALS + 1 }, (_, index) => {
      const v = bottom + index * step;
      return { value: v, label: tickLabel(v, unit, true), yFraction: scaleFraction(v, { bottom, top }) };
    });
    return { bottom, top, ticks };
  }

  /**
   * The y-axis's scale for whichever series is active, unit-agnostic — it runs identically on °F or
   * on a percentage. A wide range (> `WIDE_RANGE_THRESHOLD`) is bracketed to whole numbers so the
   * axis reads at a glance; a narrow one hugs the data instead, so a genuine small swing still fills
   * the plot; data flatter than `MIN_TICK_GRANULARITY` — including an all-zero precipitation run —
   * falls back to the small degenerate span (owner-specified, ./README.md).
   */
  function yAxisScale(values: number[], unit: string): YAxisScale {
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const range = dataMax - dataMin;
    if (range > WIDE_RANGE_THRESHOLD) return wideScale(dataMin, dataMax, unit);
    if (range >= MIN_TICK_GRANULARITY) return narrowScale(dataMin, dataMax, unit);
    return degenerateScale((dataMin + dataMax) / 2, unit);
  }

  /** One hourly vertex, in the curve's own viewBox units and as a fraction (0–1) of that viewBox.
      The fraction is what DOM-positioned content — the vertex dots, the x-axis labels — line up
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
   * The active series' vertices, one per hour, computed fresh from the props each render rather than
   * measured from the laid-out page — the module never reads its own layout back. A vertex's x is
   * its column's centre in an n-column strip (n up to twelve, whatever the payload hands it), the
   * same strip the glyph row and the x-axis labels beneath it share; its y is the raw (unrounded)
   * value's place on the y-axis scale, the same mapping the axis's own ticks and gridlines use.
   */
  function curveVertices(values: number[], scale: YAxisScale): CurveVertex[] {
    return values.map((value, index) => {
      const x = ((index + 0.5) / values.length) * CURVE_VIEWBOX_WIDTH;
      const yFraction = scaleFraction(value, scale);
      const y = yFraction * CURVE_VIEWBOX_HEIGHT;
      return { x, y, xFraction: x / CURVE_VIEWBOX_WIDTH, yFraction };
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

  /** Where an x-axis label sits under its own vertex — the same fractional x, centred under the
      point rather than the column. */
  function xAxisLabelStyle(vertex: CurveVertex): string {
    return `left: ${vertex.xFraction * 100}%;`;
  }

  /** A tick's own gridline, in viewBox y units — every tick but the bottom one, whose gridline is
      the plot's own bottom border and would otherwise be drawn twice. */
  function gridlines(ticks: YAxisTick[]): number[] {
    return ticks.slice(1).map((tick) => tick.yFraction * CURVE_VIEWBOX_HEIGHT);
  }

  /** Where a tick's label sits against its own gridline in `.yaxis`: flush to the line's far edge at
      the scale's bottom and top ticks, so the outermost labels never overflow the plot they are
      drawn beside, and centred on the line for every tick between them. */
  function tickLabelStyle(tick: YAxisTick, index: number, count: number): string {
    const anchor = index === count - 1 ? '0%' : index === 0 ? '-100%' : '-50%';
    return `top: ${tick.yFraction * 100}%; transform: translateY(${anchor});`;
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
      {@const unit = SERIES_UNIT[active]}
      {@const values = seriesValues(reading.hourly, active)}
      {@const scale = yAxisScale(values, unit)}
      {@const ticks = scale.ticks}
      {@const vertices = curveVertices(values, scale)}
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

      <!-- Next hours, per ./README.md § Next hours. One curve at a time, temperature or
           precipitation, toggled by `active` — never both, never colour-coded apart. -->
      <section class="series" data-weather-hourly>
        <h2 class="heading section-label">Next hours</h2>
        <div class="curve">
          <p class="series-label section-label" data-weather-series={active}>{SERIES_LABEL[active]}</p>
          <!-- The plot area — a left y-axis scale and the curve, dot-vertexed — the curve itself
               bracketed by a dim L-shaped axis on its left and bottom (border-left, border-bottom);
               the strips below are outside the bracket, reading as the axis's own tick labels. -->
          <div class="plot">
            <div class="yaxis">
              {#each ticks as tick, index (tick.value)}
                <span
                  class="tick-label tabular-figures"
                  data-weather-yaxis-tick
                  style={tickLabelStyle(tick, index, ticks.length)}>{tick.label}</span
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
                {#each gridlines(ticks) as y (y)}
                  <line
                    class="gridline"
                    x1="0"
                    y1={y}
                    x2={CURVE_VIEWBOX_WIDTH}
                    y2={y}
                    vector-effect="non-scaling-stroke"
                  />
                {/each}
                <polyline class="curve-line" points={curvePoints(vertices)} vector-effect="non-scaling-stroke" />
              </svg>
              {#each reading.hourly as hour, index (hour.time)}
                <span class="vertex" data-weather-vertex style={vertexStyle(vertices[index])}></span>
              {/each}
            </div>
            <div class="xaxis-spacer" aria-hidden="true"></div>
            <div class="xaxis">
              {#each reading.hourly as hour, index (hour.time)}
                <span class="xaxis-label tabular-figures" data-weather-xaxis-tick style={xAxisLabelStyle(vertices[index])}
                  >+{index + 1}</span
                >
              {/each}
            </div>
          </div>
          <ol class="glyph-strip" style="--strip-count:{reading.hourly.length}">
            {#each reading.hourly as hour (hour.time)}
              <li class="glyph-cell" data-weather-hour>
                <span class="glyph" data-weather-glyph>{skyGlyph(hour.weatherCode, hour.isDay)}</span>
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

  .curve {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* Which of the two series is on screen, at the same uppercase-tracked step the strip below it and
     the day cells use — a sub-label, so caption rather than the group heading's own step. */
  .series-label {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
  }

  /* The y-axis scale beside the curve, the curve itself, and the x-axis strip beneath both — the
     x-axis's own spacer keeps its labels out of the y-axis's column, so a label's fractional x still
     matches the vertex it sits under. */
  .plot {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
  }

  /* As tall as `.curve-area`, so a tick's `top` percentage (`tickLabelStyle`) lines up with the
     gridline it labels. An explicit width, rather than the grid column's own "auto" sizing: every
     tick label inside is `position: absolute` and so is excluded from what its container
     contributes to that sizing, which collapses `.yaxis` to its padding alone and pushes the labels
     out past the plot's left edge. `ch`, so the width scales with the caption step the labels are
     set in; sized for the widest label the axis draws — a negative two-decimal reading, e.g.
     "-12.34°". */
  .yaxis {
    position: relative;
    width: 7ch;
    height: calc((var(--type-caption) * 3 + var(--space-xs) * 2) * 2);
    padding-right: var(--space-xs);
    grid-column: 1;
    grid-row: 1;
  }

  /* Content, so drawn at full emission like the curve and its dots
     (SRS032<!-- Readable text is carried at full emission -->) — the readable half of the axis, the
     gridlines and axis lines beside it being decoration only. */
  .tick-label {
    position: absolute;
    right: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
    white-space: nowrap;
  }

  /* Brackets the curve on its left and bottom — the same dim-stroke pairing `.heading`'s own divider
     draws with. The bottom one is also the scale's own bottom gridline (`gridlines`). */
  .curve-area {
    position: relative;
    width: 100%;
    height: calc((var(--type-caption) * 3 + var(--space-xs) * 2) * 2);
    border-left: var(--divider-stroke-width) solid var(--emission-stroke);
    border-bottom: var(--divider-stroke-width) solid var(--emission-stroke);
    grid-column: 2;
    grid-row: 1;
  }

  /* Decoration, dimmed the same as the axis lines either side of it
     (SRS030<!-- Only content is rendered above the emission ceiling -->). */
  .gridline {
    stroke: var(--emission-stroke);
    stroke-width: var(--divider-stroke-width);
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

  /* Matches the y-axis column's own width, so the x-axis strip starts at the plot area rather than
     under the tick labels. */
  .xaxis-spacer {
    grid-column: 1;
    grid-row: 2;
  }

  /* Relative-hour labels, one per vertex, each positioned at that vertex's own fractional x
     (`xAxisLabelStyle`) rather than laid out as equal columns — so a label always sits under its own
     vertex regardless of how many hours the payload hands the plot. Content, drawn at full emission
     like the tick labels beside it (SRS032<!-- Readable text is carried at full emission -->). */
  .xaxis {
    position: relative;
    height: var(--type-caption);
    margin-top: var(--space-xs);
    grid-column: 2;
    grid-row: 2;
  }

  .xaxis-label {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
    white-space: nowrap;
  }

  /* One condition glyph per hour, aligned to the same n-column strip the curve's vertices sit
     against (SRS050<!-- The weather module draws day and night apart -->). */
  .glyph-strip {
    display: grid;
    grid-template-columns: repeat(var(--strip-count), 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .glyph-cell {
    display: flex;
    justify-content: center;
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
