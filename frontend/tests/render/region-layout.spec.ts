import { expect, test } from '@playwright/test';

import { overlaps, regionBoxes, render, type Fixture } from './harness';

/**
 * Over a fixture whose content fits the regions it is given: every module renders in the
 * region the configuration names for it, no region holds a module named elsewhere, the laid-out
 * regions are pairwise disjoint, and the document does not scroll sideways.
 *
 * Every region in the roster is one the frame lays out beside the others
 * ([ADR 0025 rev 2](../../../docs/decisions/0025-display-region-roster.md)), so the disjointness
 * read below covers the whole roster rather than a subset of it.
 */
const FIXTURE: Fixture = {
  modules: [
    { region: 'top_bar', module: 'fits' },
    { region: 'top_left', module: 'fits' },
    { region: 'top_center', module: 'fits' },
    { region: 'top_right', module: 'grouped' },
    { region: 'upper_third', module: 'fits' },
    { region: 'middle_center', module: 'grouped' },
    { region: 'lower_third', module: 'fits' },
    { region: 'bottom_left', module: 'fits' },
    { region: 'bottom_center', module: 'grouped' },
    { region: 'bottom_right', module: 'fits' },
    { region: 'bottom_bar', module: 'fits' },
  ],
};

/**
 * Where a region's name says its content sits, read off the name itself. ADR 0025 rev 2 fixes the
 * roster as names that "anchor to a corner or edge of the display", so this is the obligation stated
 * independently of the frame that implements it — reading it out of `REGION_PLACEMENTS` instead would
 * compare that map against itself.
 */
function anchorOf(region: string) {
  return {
    horizontal: region.endsWith('_left') ? 'start' : region.endsWith('_right') ? 'end' : 'center',
    vertical:
      region.startsWith('top_') || region === 'upper_third'
        ? 'start'
        : region.startsWith('bottom_') || region === 'lower_third'
          ? 'end'
          : 'center',
  };
}

/** What the fixture says each region holds, read from the fixture rather than written out again. */
const EXPECTED = FIXTURE.modules.reduce((byRegion, placement) => {
  byRegion.set(placement.region, [...(byRegion.get(placement.region) ?? []), placement.module]);
  return byRegion;
}, new Map<string, string[]>());

test.describe('the assembled page', () => {
  test.beforeEach(async ({ page }) => {
    await render(page, FIXTURE);
  });

  test('lays out every region the configuration names, and no other', async ({ page }) => {
    const laidOut = await regionBoxes(page);
    expect([...laidOut.keys()].sort()).toEqual([...EXPECTED.keys()].sort());
  });

  test('renders each module in the region named for it, and nothing a region was not given', async ({
    page,
  }) => {
    const occupancy = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region]')].map((region) => ({
        region: region.getAttribute('data-region') ?? '',
        stubs: [...region.querySelectorAll('[data-stub]')].map(
          (stub) => stub.getAttribute('data-stub') ?? '',
        ),
      })),
    );

    expect(occupancy).toHaveLength(EXPECTED.size);
    for (const { region, stubs } of occupancy) {
      expect(stubs, region).toEqual(EXPECTED.get(region));
    }
  });

  test('draws each module inside the box of the region it was given', async ({ page }) => {
    const contained = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region]')].flatMap((region) => {
        const outer = region.getBoundingClientRect();
        return [...region.querySelectorAll('[data-stub]')].map((stub) => {
          const inner = stub.getBoundingClientRect();
          return {
            where: `${stub.getAttribute('data-stub')} in ${region.getAttribute('data-region')}`,
            inside:
              inner.left >= outer.left - 0.5 &&
              inner.right <= outer.right + 0.5 &&
              inner.top >= outer.top - 0.5 &&
              inner.bottom <= outer.bottom + 0.5,
          };
        });
      }),
    );

    expect(contained.length).toBeGreaterThan(0);
    for (const { where, inside } of contained) {
      expect(inside, where).toBe(true);
    }
  });

  test('anchors each module to the edge or corner its region is named for', async ({ page }) => {
    const measured = await page.evaluate(() =>
      [...document.querySelectorAll('[data-region]')].map((region) => {
        const outer = region.getBoundingClientRect();
        const inner = region.querySelector('[data-stub]')!.getBoundingClientRect();
        return {
          region: region.getAttribute('data-region') ?? '',
          outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom },
          inner: { left: inner.left, right: inner.right, top: inner.top, bottom: inner.bottom },
        };
      }),
    );

    expect(measured).toHaveLength(EXPECTED.size);
    for (const { region, outer, inner } of measured) {
      const { horizontal, vertical } = anchorOf(region);

      if (horizontal === 'start') {
        expect(inner.left, `${region} content left`).toBeCloseTo(outer.left, 0);
      } else if (horizontal === 'end') {
        expect(inner.right, `${region} content right`).toBeCloseTo(outer.right, 0);
      } else {
        expect((inner.left + inner.right) / 2, `${region} content centre`).toBeCloseTo(
          (outer.left + outer.right) / 2,
          0,
        );
      }

      if (vertical === 'start') {
        expect(inner.top, `${region} content top`).toBeCloseTo(outer.top, 0);
      } else if (vertical === 'end') {
        expect(inner.bottom, `${region} content bottom`).toBeCloseTo(outer.bottom, 0);
      } else {
        expect((inner.top + inner.bottom) / 2, `${region} content middle`).toBeCloseTo(
          (outer.top + outer.bottom) / 2,
          0,
        );
      }
    }
  });

  test('lays out no two regions over one another', async ({ page }) => {
    const boxes = [...(await regionBoxes(page))];
    expect(boxes.length).toBeGreaterThan(1);

    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const [oneName, one] = boxes[first];
        const [otherName, other] = boxes[second];
        expect(overlaps(one, other), `${oneName} over ${otherName}`).toBe(false);
      }
    }
  });

  test('does not scroll sideways', async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
