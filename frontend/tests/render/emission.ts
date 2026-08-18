import type { Page } from '@playwright/test';

/**
 * The fraction of the display's maximum emission everything but content stays below, and the
 * fraction of the display's height every text element clears. Both figures are the display styling
 * contract's § *Calibrated bounds*, which states that recalibrating one edits the figure there and
 * the check re-asserts against the new value — so the operative copy lives here deliberately.
 */
export const EMISSION_CEILING = 0.06;
export const TYPE_SIZE_FLOOR = 0.014;

/** One emitting surface of one element, with what it emits. */
export interface Surface {
  readonly element: string;
  readonly property: string;
  readonly colour: string;
  readonly luminance: number;
}

/** A computed value the reader could not resolve to a colour — a failure, never a skip. */
export interface Unreadable {
  readonly element: string;
  readonly property: string;
  readonly value: string;
  readonly why: string;
}

/** One element the page presents text in. */
export interface TextElement {
  readonly element: string;
  readonly text: string;
  readonly colour: string;
  readonly luminance: number;
  readonly fontSizePx: number;
}

export interface EmissionReading {
  readonly above: Surface[];
  readonly unreadable: Unreadable[];
  readonly text: TextElement[];
}

/**
 * Reads what the page emits, in one pass over the document.
 *
 * **Surfaces.** The population is every element the page renders, its root included, and every way
 * an element emits — ground, border, outline and shadow, each read whether it is a solid or a
 * gradient's stops.
 *
 * **Colour is resolved by painting, not by parsing.** Each computed value is filled into a 1×1
 * canvas over black and the pixel read back, so the reading is independent of the colour space
 * Chrome serialises in — `oklch()`, `lab()`, `color(display-p3 …)` and `color-mix()` are all
 * preserved in computed style and none of them is `rgb()` — and compositing comes free, a value at
 * partial alpha resolving against the ground the page actually draws on.
 *
 * **A value that cannot be resolved is reported, never skipped.** An unrecognised colour token, and
 * a `background-image` that yields no colour at all, are each returned in `unreadable`, because a
 * reader that narrowed its own population would report success over what was left.
 *
 * **Text and imagery rendered as content are exempt.** Text is exempt by not being read as a
 * surface — a glyph's colour is reported under `text` instead. Imagery is exempt by element: an
 * `img`, `svg`, `video` or `canvas`, and anything inside one, is content the page presents rather
 * than a surface it draws.
 */
export async function readEmission(page: Page, ceiling = EMISSION_CEILING): Promise<EmissionReading> {
  return page.evaluate((limit) => {
    const CONTENT_IMAGERY = 'img, svg, video, canvas';
    const SENTINEL = '#010203';

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const paint = canvas.getContext('2d', { willReadFrequently: true })!;

    function describe(element: Element): string {
      const stub = element.closest('[data-stub]')?.getAttribute('data-stub');
      const region = element.closest('[data-region]')?.getAttribute('data-region');
      const classes = typeof element.className === 'string' ? element.className : '';
      return [
        element.tagName.toLowerCase(),
        classes ? `.${classes.trim().split(/\s+/).join('.')}` : '',
        region ? ` in ${region}` : '',
        stub ? ` (stub ${stub})` : '',
      ].join('');
    }

    /**
     * Every colour token in a computed value. A functional notation is taken whole by matching its
     * parentheses, so a nested one such as `color-mix(in srgb, …)` survives; hex literals are taken
     * as written.
     */
    function tokens(value: string): string[] {
      const found: string[] = [];
      const opener =
        /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color|light-dark)\(/gi;
      let match: RegExpExecArray | null;
      while ((match = opener.exec(value))) {
        let depth = 0;
        let index = match.index + match[0].length - 1;
        for (; index < value.length; index += 1) {
          if (value[index] === '(') depth += 1;
          else if (value[index] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (depth === 0) {
          found.push(value.slice(match.index, index + 1));
          opener.lastIndex = index + 1;
        }
      }
      for (const hex of value.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
        found.push(hex);
      }
      return found;
    }

    /** The composited sRGB pixel a colour token paints over black, or null if it is not a colour. */
    function pixel(token: string): [number, number, number] | null {
      paint.fillStyle = SENTINEL;
      paint.fillStyle = token;
      if (paint.fillStyle === SENTINEL && token.trim().toLowerCase() !== SENTINEL) {
        return null;
      }
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = '#000';
      paint.fillRect(0, 0, 1, 1);
      paint.fillStyle = token;
      paint.fillRect(0, 0, 1, 1);
      const data = paint.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2]];
    }

    function luminance([red, green, blue]: [number, number, number]): number {
      const linear = (channel: number) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    }

    const above: Surface[] = [];
    const unreadable: Unreadable[] = [];
    const text: TextElement[] = [];

    const elements = [document.documentElement, ...document.querySelectorAll('*')];
    for (const element of elements) {
      // Only what the page actually renders. `head`'s children carry text — the document title, and
      // every injected stylesheet's source — and none of it is text a viewer reads.
      if (element !== document.documentElement && !element.checkVisibility()) {
        continue;
      }
      const style = getComputedStyle(element);

      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (own.length > 0) {
        const resolved = pixel(style.color);
        if (resolved === null) {
          unreadable.push({
            element: describe(element),
            property: 'color',
            value: style.color,
            why: 'not resolvable to a colour',
          });
        } else {
          text.push({
            element: describe(element),
            text: own,
            colour: style.color,
            luminance: luminance(resolved),
            fontSizePx: Number.parseFloat(style.fontSize),
          });
        }
      }

      if (element.closest(CONTENT_IMAGERY)) {
        continue;
      }

      const surfaces: [string, string][] = [
        ['background-color', style.backgroundColor],
        ['background-image', style.backgroundImage],
        ['box-shadow', style.boxShadow],
      ];

      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        const width = Number.parseFloat(style[`border${side}Width`]);
        const drawn =
          style[`border${side}Style`] !== 'none' && style[`border${side}Style`] !== 'hidden';
        if (width > 0 && drawn) {
          surfaces.push([`border-${side.toLowerCase()}-color`, style[`border${side}Color`]]);
        }
      }

      const outlineWidth = Number.parseFloat(style.outlineWidth);
      if (outlineWidth > 0 && style.outlineStyle !== 'none') {
        surfaces.push(['outline-color', style.outlineColor]);
      }

      for (const [property, value] of surfaces) {
        if (!value || value === 'none') {
          continue;
        }
        const found = tokens(value);
        if (found.length === 0) {
          unreadable.push({
            element: describe(element),
            property,
            value,
            why: 'a drawn value this reader found no colour in',
          });
          continue;
        }
        for (const token of found) {
          const resolved = pixel(token);
          if (resolved === null) {
            unreadable.push({
              element: describe(element),
              property,
              value: token,
              why: 'not resolvable to a colour',
            });
            continue;
          }
          const emitted = luminance(resolved);
          if (emitted > limit) {
            above.push({ element: describe(element), property, colour: token, luminance: emitted });
          }
        }
      }
    }

    return { above, unreadable, text };
  }, ceiling);
}
