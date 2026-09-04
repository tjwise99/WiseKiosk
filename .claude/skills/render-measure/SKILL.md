---
name: render-measure
description: >-
  See a WiseKiosk display change the way it will actually render, and measure it rather than eyeball
  it. Spins a throwaway Playwright render against the LIVE config (real placement, real viewport),
  screenshots the full frame and the region, downscales for reading, and measures geometry with
  bounding boxes to confirm alignment/width/spacing claims. Invoke whenever iterating on a module's
  visual design or checking a layout claim — pairs with the display-designer agent, which owns the
  design judgement this skill only lets you observe.
---

# Render it against the real config, then measure it

Two disciplines this repo's display work depends on, learned the hard way:

1. **Render against the LIVE config, never an invented one.** `frontend/public/config.json` decides
   which region each module sits in — and a module reads completely differently in `top_right` (a
   ~640px right-edge column, content justified right) than in a full-width centre region. A mock in
   the wrong region sends the whole design down the wrong path. Read the live config first and drive
   the render with it.
2. **Measure, don't eyeball.** "It looks aligned" and "it looks like a gutter" are not observations —
   a bounding box is. An alignment/width/spacing claim gets a number (a `left`/`right`/`width` in CSS
   px), or it isn't made. If a broken and a fixed layout would produce the same screenshot at a
   glance, nothing was measured.

## The harness

Render tests live under `frontend/tests/render/` and drive the real page through Playwright. The key
helpers in [`harness.ts`](../../../frontend/tests/render/harness.ts):

- `render(page, fixture)` — fulfils `config.json` from `fixture` and waits for the frame to lay out.
- `serveModuleData(page, answer)` — answers `**/api/*` with a payload, so the module draws real data.

The project's viewports are in `playwright.config.ts`; the deployed one is **`kiosk` (1920×1080)** —
render at that project.

## The loop

Write a **throwaway** spec at `frontend/tests/render/_shot.spec.ts` (the `_` and `.spec.ts` keep it
in the render runner; **delete it before committing**). Shape it from the live config:

```ts
import { expect, test } from '@playwright/test';
import { render, serveModuleData } from './harness';

const SHOT = process.env.SHOT_DIR ?? '/tmp/shot';

// A realistic payload for the module under design — 12 hourly points, 5 daily, whole + fractional
// values so the axis and labels are exercised. (Shape it from the module's boundary type.)
function forecast() { /* ... */ }

// frontend/public/config.json, verbatim — plus a fast series toggle only to capture both states.
const LIVE_CONFIG = {
  edge_band: 3,
  modules: [
    { region: 'top_left', module: 'clock', options: { /* live options */ } },
    { region: 'top_right', module: 'weather', options: { location: { /* live */ }, series_switch_seconds: 2 } },
  ],
};

test('_shot', async ({ page }) => {
  await serveModuleData(page, () => ({ status: 200, data: forecast() }));
  await render(page, LIVE_CONFIG);
  await page.locator('[data-weather-temp]').waitFor();

  // MEASURE — the point of the exercise. Log left/right/width for anything you're aligning.
  for (const sel of ['[data-weather]', '.series-label', '[data-weather-yaxis-tick]', '.curve-area']) {
    const b = await page.locator(sel).first().boundingBox();
    console.log('MEASURE', sel, b && `left=${b.x.toFixed(1)} right=${(b.x + b.width).toFixed(1)} w=${b.width.toFixed(1)}`);
  }

  await page.screenshot({ path: `${SHOT}/full.png` });                       // the whole frame
  await page.locator('[data-region="top_right"]').screenshot({ path: `${SHOT}/region.png` }); // the module
});
```

Run it, pulling the measurements out:

```sh
cd frontend
SHOT_DIR="<your scratchpad>" node_modules/.bin/playwright test tests/render/_shot.spec.ts --project=kiosk 2>&1 | grep MEASURE
```

**Downscale before reading a screenshot** — a 1920-wide PNG costs ~150k tokens to view; a downscaled
JPG is a few thousand and reads fine:

```sh
magick "$SHOT/full.png" -resize '1568x1568>' -quality 90 "$SHOT/full.jpg"
```

Then read the `.jpg`.

## Traps that cost iterations here

- **A region screenshot clips overflow.** `element.screenshot()` on a region captures only that box, so
  content that (by design) overflows it — right-justified labels overflowing left into the margin —
  is **cut off in the region crop but present in the full-frame shot**. Judge overflow from
  `full.png`, not `region.png`.
- **`:8080` is a baked image; `:5173` is live.** The dev container (`just run-container`,
  `docker compose -f compose.dev.yaml`, served on `:8080`) bakes the source at build time with **no
  bind-mount** — it will not show your edits until rebuilt with `--build`, and rebuilding is slow. The
  owner watches **`just dev`'s Vite HMR on `:5173`**, which is live. Don't rebuild the container to
  "show" a change; the source server and this harness already reflect it. (If you ever do run compose,
  run it from the **worktree root**, not `frontend/` — the compose file is at the root.)
- **cwd matters in a worktree.** Run Playwright from `frontend/`; run `git` from the repo/worktree
  root; a fresh worktree may lack a venv for the doc gates (borrow the main clone's — see the project
  memory on worktree venvs). Keep temp specs and screenshots in the scratchpad, never `/tmp` blindly.
- **Toggling series must not move the plot.** If a value's rendered width feeds back into layout (a
  label column sized to the widest label), the plot resizes when the series switches. Measure
  `curve-area` in *both* states and assert they match; size such columns to a fixed width instead.

## When you're done

Delete `_shot.spec.ts`. It is scratch — it is not the module's real render coverage (that is the
module's own `*.spec.ts`, rewritten in the separate test-reconciliation pass, not here).
