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

  /** The axis is always divided into this many equal bands — five ticks, five gridlines, four
      regions between them — whatever the data's range, so the scale reads the same every render
      rather than the tick count shifting with the data (owner-specified). */
  const AXIS_BANDS = 4;

  /** The smallest span, in the active series' own units, the axis is ever drawn over — the tightest
      that still lands the four band boundaries on quarter units (a one-unit span over `AXIS_BANDS`
      is a quarter-unit step; anything narrower would need a finer label than a quarter). A flat or
      near-flat run is drawn against this span rather than its own near-zero one, so it reads as a
      readable swing that fills the plot rather than a noise-height wiggle, and a genuinely flat run
      still divides by a real span rather than zero (owner-specified: the small-range exception). */
  const MIN_AXIS_SPAN = 1;

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

  /** A tick's label, to a quarter unit. The axis's bounds are whole numbers split into `AXIS_BANDS`,
      so a whole number over four — every tick value is already a multiple of 0.25; this shows it with
      only the decimals it carries ("70", "67.5", "62.75"), the unit appended. */
  function tickLabel(value: number, unit: string): string {
    return `${Math.round(value * 4) / 4}${unit}`;
  }

  /**
   * The y-axis's scale for whichever series is active, unit-agnostic — it runs identically on °F or
   * on a percentage. The axis brackets the data from `floor(min)` to `ceil(max)` and divides that
   * into `AXIS_BANDS` equal bands: always five evenly-spaced ticks, and — the bounds being whole
   * numbers and the band count four — every tick value a multiple of a quarter unit. Where the
   * whole-number bracket is narrower than `MIN_AXIS_SPAN` (a flat or near-flat run, `floor` and
   * `ceil` within two units of each other), the top is lifted to `bottom + MIN_AXIS_SPAN` so the
   * axis never zooms below that span; the lift only ever raises the top, so data the bracket held it
   * still holds (owner-specified, ./README.md).
   */
  function yAxisScale(values: number[], unit: string): YAxisScale {
    const bottom = Math.floor(Math.min(...values));
    const top = Math.max(Math.ceil(Math.max(...values)), bottom + MIN_AXIS_SPAN);
    const step = (top - bottom) / AXIS_BANDS;
    const ticks = Array.from({ length: AXIS_BANDS + 1 }, (_, index) => {
      const value = bottom + index * step;
      return { value, label: tickLabel(value, unit), yFraction: scaleFraction(value, { bottom, top }) };
    });
    return { bottom, top, ticks };
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

  /** Where an hour's own column sits — the x-axis label under it, the day/night glyph above it, and
      (via `vertexStyle`) the curve's own dot at it — all driven off this one fraction, so the three
      cannot drift out of line with each other by construction. Centred under/over the point rather
      than a column's own width, the same as `vertexStyle`'s `left`. */
  function columnStyle(vertex: CurveVertex): string {
    return `left: ${vertex.xFraction * 100}%;`;
  }

  /** A tick's own gridline, in viewBox y units — every tick but the bottom one, whose gridline is
      the plot's own bottom border and would otherwise be drawn twice. The scale draws a fixed five
      ticks, so this is a fixed four lines above that border: the top bound and the three interior
      ticks, one per label. */
  function gridlines(ticks: YAxisTick[]): number[] {
    return ticks.slice(1).map((tick) => tick.yFraction * CURVE_VIEWBOX_HEIGHT);
  }

  /** Where a tick's label sits against its own gridline in `.yaxis`: centred on the line, every tick
      alike — the top and bottom labels included, so each reads level with the tick it names rather
      than hanging above or below it. The outermost two then extend half a line-height past the plot's
      top and bottom edges, into the row's own gaps, which is theirs to take. */
  function tickLabelStyle(tick: YAxisTick): string {
    return `top: ${tick.yFraction * 100}%; transform: translateY(-50%);`;
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
        <!-- Current conditions, one glanceable stat per reading rather than one dotted line: the
             condition word is dropped — the present glyph already carries the sky (SRS050), so a word
             for it beside the glyph is redundant on a surface where space is the scarce thing. -->
        <dl class="conditions" data-weather-detail>
          <div class="stat card">
            <dt class="stat-label section-label">Feels like</dt>
            <dd class="stat-value tabular-figures">{round(reading.current.apparentTemp)}°</dd>
          </div>
          <div class="stat card">
            <dt class="stat-label section-label">Humidity</dt>
            <dd class="stat-value tabular-figures">{round(reading.current.humidity)}%</dd>
          </div>
          <div class="stat card">
            <dt class="stat-label section-label">Wind</dt>
            <dd class="stat-value tabular-figures">{round(reading.current.windSpeed)} mph</dd>
          </div>
        </dl>
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
              {#each ticks as tick (tick.value)}
                <span
                  class="tick-label tabular-figures"
                  data-weather-yaxis-tick
                  style={tickLabelStyle(tick)}>{tick.label}</span
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
                <span class="xaxis-label tabular-figures" data-weather-xaxis-tick style={columnStyle(vertices[index])}
                  >+{index + 1}</span
                >
              {/each}
            </div>
            <div class="glyph-spacer" aria-hidden="true"></div>
            <div class="glyph-row">
              {#each reading.hourly as hour, index (hour.time)}
                <span class="glyph-column" data-weather-hour style={columnStyle(vertices[index])}>
                  <span class="glyph" data-weather-glyph>{skyGlyph(hour.weatherCode, hour.isDay)}</span>
                </span>
              {/each}
            </div>
          </div>
        </div>
      </section>

      <!-- Next days, per ./README.md § Next days. -->
      <section class="series" data-weather-daily>
        <h2 class="heading section-label">Next days</h2>
        <ol class="strip">
          {#each reading.daily as day (day.time)}
            <li class="cell card" data-weather-day>
              <span class="when daily-when">{dayName(day.time)}</span>
              <span class="glyph glyph-daily" data-weather-glyph>{skyGlyph(day.weatherCode, true)}</span>
              <span class="reading daily-reading tabular-figures">{round(day.max)}°/{round(day.min)}°</span>
              <span class="reading daily-reading tabular-figures">{round(day.precipProbability)}%</span>
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
    /* The module sizes to its own content and takes the region's anchor (RegionFrame's
       `placementStyle()`), rather than stretching to the region's full width. The daily strip is the
       widest group, so it sets one width the present block and the graph both fill — Next Hours and
       Next Days read at a single consistent width, hugging the placed edge, rather than the graph
       spanning the region while the days pack to a fraction of it. */
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
    /* Justify the reading and its stats to the side the frame placed this module on — right against
       a right-edge region, left against a left one (RegionFrame's `--content-anchor`). */
    align-items: var(--content-anchor, flex-start);
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

  /* Current conditions as a row of glanceable stats, filling the space the dropped condition word
     freed. Each stat names its reading above the value, so the block reads as a hero (glyph +
     temperature) over a legible supporting row rather than trailing off into one near-caption line.
     Wraps to a second row only if the region is ever narrowed below what three stats need. */
  .conditions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
    /* The stats hug the module's own justified side, the same as the reading above them. */
    justify-content: var(--content-anchor, flex-start);
  }

  /* Each current-conditions reading is its own card, the same treatment as a day cell — content
     centred within it (the owner's ask), the card doing the grouping. It still hugs the module's
     justified side as one of a row (`.conditions`), but centres its own label and value. */
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    text-align: center;
  }

  /* The shared card chrome — a dim stroke a step heavier than the dividers, rounded — so a day cell
     and a conditions stat read as the same kind of bound object. Weight and radius are local values:
     two consumers now, but both inside this module, so no shared token is earned yet. */
  .card {
    border: calc(var(--divider-stroke-width) * 2) solid var(--emission-stroke);
    border-radius: var(--space-sm);
  }

  /* Names the stat, in the display's shared uppercase-tracked label idiom (`.section-label`) at the
     caption step — the same treatment the group headings and the clock's weekday carry. */
  .stat-label {
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
  }

  /* The reading itself, at `annotation` — well above the old caption line so it reads at distance,
     and a clear step below the `headline` temperature so it supports the hero rather than competing
     with it. */
  .stat-value {
    margin: 0;
    font-size: var(--type-annotation);
    font-weight: var(--type-annotation-weight);
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
    /* A group heading names what follows and is read left-to-right, so it stays left-aligned whichever
       side the module itself is justified to — only the readings below it hug the module's edge. */
    text-align: left;
  }

  .curve {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    /* The series label reads as the plot's own title, centred over it — the way a graph is titled,
       and clear of the top y-axis label that sits at the plot's left edge. Centred rather than
       following the module's justification, so it is pinned the same whichever side the module is
       placed on. */
    text-align: center;
  }

  /* Which of the two series is on screen, at the same uppercase-tracked step the strip below it and
     the day cells use — a sub-label, so caption rather than the group heading's own step. */
  .series-label {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
  }

  /* The y-axis scale, the curve, the x-axis strip and the glyph row — one grid, three rows sharing
     one second column, so the x-axis labels and the glyphs sit in the exact same horizontal track
     the curve itself is drawn in and every fractional x (`columnStyle`, `vertexStyle`) means the same
     pixel column in all three. Each row's own spacer keeps it out of the y-axis's column. */
  .plot {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto;
    row-gap: var(--space-xs);
    /* The breathing gap between the y-axis labels and the curve lives here, as the gap between the
       grid's two columns — not as the label column's own `padding-right`, which (with the labels
       anchored `right: 0`) is pushed to the *left* of the numbers instead and reads as a dead gutter
       indenting them from the module's edge. */
    column-gap: var(--space-xs);
  }

  /* As tall as `.curve-area`, so a tick's `top` percentage (`tickLabelStyle`) lines up with the
     gridline it labels. A fixed width, in `ch` at the labels' own caption step (`font-size` set here
     so `ch` measures that step, not the container's) — three characters, a plain two-digit degree or
     percentage. Fixed rather than sized to the widest label on screen: the widest differs between the
     two series, so a data-driven width would resize the column and shift the whole plot every time
     the curve toggles. A wider label (a fractional interior tick like "68.25°", or a three-digit
     reading) is anchored `right: 0` and so overflows to its *left*, into the free margin beside the
     module, rather than widening this column — the plot stays put and the axis carries no dead
     gutter (owner-specified). */
  .yaxis {
    position: relative;
    width: 3ch;
    height: calc((var(--type-caption) * 3 + var(--space-xs) * 2) * 2);
    font-size: var(--type-caption);
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

  /* Matches the y-axis column's own width, so the x-axis strip and the glyph row both start at the
     plot area rather than under the tick labels. */
  .xaxis-spacer {
    grid-column: 1;
    grid-row: 2;
  }

  /* Relative-hour labels, one per vertex, each positioned at that vertex's own fractional x
     (`columnStyle`) rather than laid out as equal columns — so a label always sits under its own
     vertex regardless of how many hours the payload hands the plot. Content, drawn at full emission
     like the tick labels beside it (SRS032<!-- Readable text is carried at full emission -->). */
  .xaxis {
    position: relative;
    height: var(--type-caption);
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

  /* See `.xaxis-spacer`. */
  .glyph-spacer {
    grid-column: 1;
    grid-row: 3;
  }

  /* One condition glyph per hour (SRS050<!-- The weather module draws day and night apart -->), each
     positioned at its own vertex's fractional x (`columnStyle`) — the same mechanism the x-axis
     labels use above, so a glyph, its label and its curve dot share one x by construction rather than
     by three layouts happening to agree. */
  .glyph-row {
    position: relative;
    height: var(--type-body);
    grid-column: 2;
    grid-row: 3;
  }

  .glyph-column {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }

  /* The days packed together with one gap between cells and justified to the module's own side,
     rather than spread across the region's full width as equal columns — five narrow cells stretched
     over the whole width read as five islands adrift, not one strip. */
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: var(--content-anchor, flex-start);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    text-align: center;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
    line-height: 1;
    /* Bounded as its own card (`.card`) so a day reads as one self-contained reading; interior
       padding here so the content clears that border. The card border carries the grouping, so the
       gap between cards (`.strip`) is only a small separation. */
    padding: var(--space-md) var(--space-sm);
  }

  .reading {
    min-width: 0;
  }

  /* The daily strip's own bigger cascade: the day name and the day's own glyph read as the cell's
     anchor, the high/low and precipitation readings a step below that — both a step up from
     `.cell`'s own caption size. */
  .daily-when {
    font-size: var(--type-annotation);
    font-weight: var(--type-annotation-weight);
  }

  /* Scoped to the daily cell rather than the shared `.glyph` base class, so it does not also size up
     the hourly glyphs — the same modifier-on-`.glyph` pattern `.glyph-present` uses. */
  .glyph-daily {
    font-size: var(--type-annotation);
  }

  .daily-reading {
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
  }
</style>
