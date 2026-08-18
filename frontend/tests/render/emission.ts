import type { Page } from '@playwright/test';

/** The fraction of the display's maximum emission everything but content stays below. */
export const EMISSION_CEILING = 0.06;

/** The fraction of the display's height every text element clears. */
export const TYPE_SIZE_FLOOR = 0.014;

/** One emitting surface of one element, with what it emits. */
export interface Surface {
  readonly element: string;
  readonly property: string;
  readonly colour: string;
  readonly luminance: number;
}

/** One element the page presents text in. */
export interface TextElement {
  readonly element: string;
  readonly text: string;
  readonly colour: string;
  readonly luminance: number;
  readonly fontSizePx: number;
}

/**
 * Every surface the page draws that emits above the ceiling. The population is every element in the
 * document, its root included, and every way an element emits — ground, border, outline and shadow,
 * each read whether it is a solid or a gradient.
 *
 * Text and imagery rendered as content are exempt. Text is exempt by not being read here at all: a
 * glyph's colour is `readTextElements`' to judge. Imagery is exempt by element — an `img`, `svg`,
 * `video` or `canvas`, and anything inside one, is content the page presents rather than a surface
 * it draws.
 *
 * Emission is the *composited* value: the page's ground is black, so a colour at partial alpha
 * contributes that fraction of its own luminance and a fully transparent one contributes nothing.
 */
export async function surfacesAboveCeiling(page: Page, ceiling = EMISSION_CEILING): Promise<Surface[]> {
  return page.evaluate((limit) => {
    const CONTENT_IMAGERY = 'img, svg, video, canvas';

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

    /** Every `rgb`/`rgba` colour in a computed value, whether it is a solid or a gradient's stops. */
    function colours(value: string): string[] {
      return value.match(/rgba?\([^)]*\)/g) ?? [];
    }

    /** Relative luminance of an sRGB colour, scaled by its alpha over a black ground. */
    function luminance(colour: string): number {
      const parts = colour
        .slice(colour.indexOf('(') + 1, colour.lastIndexOf(')'))
        .split(/[,/\s]+/)
        .filter((part) => part.length > 0)
        .map(Number);
      const [red, green, blue] = parts;
      const alpha = parts.length > 3 ? parts[3] : 1;
      const linear = (channel: number) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      return alpha * (0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue));
    }

    const found: {
      element: string;
      property: string;
      colour: string;
      luminance: number;
    }[] = [];

    const elements = [document.documentElement, ...document.querySelectorAll('*')];
    for (const element of elements) {
      if (element.closest(CONTENT_IMAGERY)) {
        continue;
      }
      const style = getComputedStyle(element);

      const surfaces: [string, string][] = [
        ['background-color', style.backgroundColor],
        ['background-image', style.backgroundImage],
        ['box-shadow', style.boxShadow],
      ];

      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        const width = Number.parseFloat(style[`border${side}Width`]);
        const drawn = style[`border${side}Style`] !== 'none' && style[`border${side}Style`] !== 'hidden';
        if (width > 0 && drawn) {
          surfaces.push([`border-${side.toLowerCase()}-color`, style[`border${side}Color`]]);
        }
      }

      const outlineWidth = Number.parseFloat(style.outlineWidth);
      if (outlineWidth > 0 && style.outlineStyle !== 'none') {
        surfaces.push(['outline-color', style.outlineColor]);
      }

      for (const [property, value] of surfaces) {
        for (const colour of colours(value)) {
          const emitted = luminance(colour);
          if (emitted > limit) {
            found.push({ element: describe(element), property, colour, luminance: emitted });
          }
        }
      }
    }
    return found;
  }, ceiling);
}

/**
 * Every element the page presents text in — one carrying a non-empty direct text child, so a
 * container is not counted for the text of its children — with the colour it renders that text at
 * and the size it renders it at.
 */
export async function readTextElements(page: Page): Promise<TextElement[]> {
  return page.evaluate(() => {
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

    function luminance(colour: string): number {
      const parts = colour
        .slice(colour.indexOf('(') + 1, colour.lastIndexOf(')'))
        .split(/[,/\s]+/)
        .filter((part) => part.length > 0)
        .map(Number);
      const [red, green, blue] = parts;
      const alpha = parts.length > 3 ? parts[3] : 1;
      const linear = (channel: number) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      return alpha * (0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue));
    }

    const found: {
      element: string;
      text: string;
      colour: string;
      luminance: number;
      fontSizePx: number;
    }[] = [];

    for (const element of document.querySelectorAll('*')) {
      // Only what the page actually renders. `head`'s children carry text — the document title, and
      // every injected stylesheet's source — and none of it is text a viewer reads.
      if (!element.checkVisibility()) {
        continue;
      }
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (own.length === 0) {
        continue;
      }
      const style = getComputedStyle(element);
      found.push({
        element: describe(element),
        text: own,
        colour: style.color,
        luminance: luminance(style.color),
        fontSizePx: Number.parseFloat(style.fontSize),
      });
    }
    return found;
  });
}
