# 0027 — The frontend's two test tiers run on two runners: Vitest for units, Playwright for render

**Status:** accepted
**Decided:** 2026-08-18 (#10 frontend skeleton, the change that writes the first frontend test of
either tier)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-18 — first written (#10 frontend skeleton).

## Context

[`../TESTING.md`](../TESTING.md) specifies a **Unit** tier and a **Render** tier and states what each
guarantees, but names no runner for either — deliberately, since it is written before the tests exist.
The frontend had no test of either tier until #10 frontend skeleton, so the choice arrives with the
first ones.

The two tiers ask for different things. The Unit tier is pure functions over known inputs. The Render
tier is read off an assembled page: *"which region each module landed in, emission, type scale, region
geometry, the configured edge band, reflow, and overflow"*. Every one of those is a **used** value —
what the browser resolved and laid out — rather than a declared one:

- relative luminance of a *composited* surface
  (SRS030<!-- Only content is rendered above the emission ceiling -->), which is a function of what is
  painted over what;
- computed `font-size` as a fraction of viewport height
  (SRS033<!-- Text holds a minimum size against the display, at every resolution -->), which requires
  the `vh` unit to have been resolved against a real viewport;
- laid-out region geometry against the viewport and against each other
  (SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->,
  SRS034<!-- The laid-out regions keep clear of the display edge -->,
  SRS035<!-- The masked edge band is the deployment's to declare -->);
- document scroll extent, and a content box measured against the region's
  (SRS031<!-- Content too large for its region overflows -->).

So the render question is not "which test framework" but "what computes layout and paint", and only a
browser does.

## Decision

**Two runners, one per tier, each configured in its own file and each with its own recipe.**

- **Unit tier — Vitest.** It reuses the Vite pipeline the bundle is built with, so a helper is
  exercised through the same resolution and transform the shipped module graph gets, and a passing
  unit test is not passing against a differently-resolved copy.
- **Render tier — Playwright Test**, driving a real browser, with the three supported viewports
  declared as projects so every render test runs at each. What a test reads is the used value the
  browser computed: `getComputedStyle` after layout, `getBoundingClientRect`, and the document's own
  scroll extent.

Neither runner is a runtime dependency; both are devDependencies and neither reaches the bundle
[ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) emits.

## Alternatives considered

- **jsdom or happy-dom under Vitest, for both tiers.** One runner, one configuration, one recipe, no
  browser binary to install in CI — and for a frontend whose render tests assert *what is in the
  document*, this is the right answer and the usual one. Rejected because none of this tier's
  assertions is about what is in the document. Neither implementation performs layout or paint:
  `getBoundingClientRect` answers zeroes, no cascade resolves a `vh` length against a viewport that
  does not exist, and `getComputedStyle` returns what was declared rather than what was used, so
  nothing composites and there is no luminance to read. A render suite built on one would go green
  while asserting over zeroes — which is worse than having no render tier, because the report would
  say the obligations hold.
- **Playwright for both tiers.** One runner and one browser download, and the unit tests would run
  wherever the render tests do. Rejected: the Unit tier's guarantee is *pure, fast, no network*, and
  routing a pure function through a browser process spends that for nothing. It also inverts the
  reporting — a failing pure helper would arrive as a browser-test failure at a viewport that had no
  bearing on it.
- **Vitest browser mode, with the Playwright provider.** Genuinely one runner over a real browser,
  and it would collapse two configurations into one. Rejected because what it collapses is the
  configuration and not the cost: the browser is still downloaded and still driven by Playwright, one
  layer down, and reaching Playwright's own viewport matrix and failure artifacts then goes through
  that layer. The tiers have different populations and different failure reports, and
  [`../TESTING.md`](../TESTING.md) already holds them apart; one configuration file is not worth
  putting an adapter between a check and the thing it measures.

## Consequences

- **Two runner configurations, two recipes and two CI jobs.** That is the shape
  [`../CI.md`](../CI.md) § *Gate wiring* asks for anyway — a job step invokes a recipe — so the second
  of each costs a file rather than a mechanism.
- **CI installs a browser binary**, which is the largest single cost in the gate and is what buys the
  used values above. A render tier that did not pay it would be reading declared values, which is the
  rejected alternative.
- **A render test can only assert what a browser reports.** What the panel emits, and what a viewer
  sees over the reflected room, stay outside — each `TST` item's own
  `verification-justification` says so, and this record does not widen any of them.
- **No requirement item states any of this.** Which runner executes a check constrains the repository
  rather than the running software, which
  [ADR 0011 rev 2](0011-requirement-or-convention.md) routes to a check and to
  [`../TESTING.md`](../TESTING.md), never to the tree.

**Premise that would reopen this:** a headless DOM implementation that performs real layout and
compositing, so that used geometry and composited luminance are readable without a browser process. A
faster or better-liked test framework is not that premise — the split above is about what computes the
values, not about which API declares the tests.
