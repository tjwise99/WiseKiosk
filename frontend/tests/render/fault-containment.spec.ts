import type { Page } from '@playwright/test';

import { LIVENESS_INTERVAL_MS } from '../../src/lib/liveness';
import {
  advanceHostClock,
  expect,
  holdHostClock,
  render,
  serveLiveness,
  test,
  type Fixture,
} from './harness';

/**
 * A module that throws is contained to its own place: the page says so where that module stood, every
 * other module goes on rendering, and the module is drawn again once the fault clears.
 *
 * The failure this reads is the one the display shipped with. An uncaught error raised mid-flush stops
 * Svelte's reactive rendering for the life of the page — not the module that threw, the page: every
 * other module holds the frame it was last given and the outage report holds whatever it last said,
 * with the backend answering behind it. It is a violation of
 * SYS001<!-- Failure is legible and proportionate --> at its widest, one module's defect degrading all
 * of the display, and of SRS040<!-- A module that fetches nothing renders on through an outage -->,
 * which the frozen clock is a direct instance of.
 *
 * Read against a stub rather than against a module (`stubs/Throws.svelte`): what the framework owes is
 * owed whichever module threw, and a check staged on the one module that last held the defect would be
 * discharged by that module's own fix rather than by containment existing at all.
 *
 * Every case drives the host clock, because the transition that raises the fault is a liveness ask and
 * the evidence that the page is still rendering is a clock reading that moves. The locale and the zone
 * are pinned for the reason ../../src/modules/clock/clock.spec.ts states.
 */
test.use({ locale: 'en-US', timezoneId: 'UTC' });

/** The instant the host clock is held at, and the readings it gives as the cases advance it. */
const HOST_TIME = new Date('2026-08-30T15:04:05Z');
/** After the two liveness intervals the outage is detected within: 15:04:15. */
const AT_OUTAGE = /03:04\D*15/;
/** A minute further on: 15:05:20 — the reading that proves the page is still rendering. */
const PAST_THE_MINUTE = /03:05\D*20/;
/** Two liveness intervals past that, the backend answering again: 15:05:30. */
const AT_RECOVERY = /03:05\D*30/;

/** Where the module that throws is placed, and where the sibling that must survive it is. */
const FAULTING_REGION = 'top_left';
const SURVIVING_REGION = 'middle_center';

/**
 * A display carrying the module that throws, a stub sharing its region, and a clock in another. Three
 * siblings rather than one, because the containment clause names two different neighbours: a module
 * elsewhere on the display, and one sharing the faulting module's own region
 * (SRS001<!-- A failed module shows why, and only that module -->'s "including one sharing its
 * region"). The clock is the one that carries the evidence, being the only module on the display whose
 * reading moves on its own.
 */
const FIXTURE: Fixture = {
  modules: [
    { region: FAULTING_REGION, module: 'throws' },
    { region: FAULTING_REGION, module: 'fits' },
    { region: SURVIVING_REGION, module: 'clock', options: {} },
  ],
};

/**
 * What the page draws where a module that threw stood. Its own hook rather than
 * `[data-module-unavailable]`, which is taken: that one is a module's own report that its data request
 * failed (SRS001<!-- A failed module shows why, and only that module -->), drawn by the module
 * itself, and the outage cases assert it is absent while the
 * backend is gone. A fault and a failed reading are different states with different causes and
 * different remedies, and a test that shares one hook between them cannot tell which it is reading.
 */
const FAULTED = '[data-module-faulted]';

/** The module that throws, while it is drawing, and the sibling sharing its region. */
const THROWS = '[data-stub="throws"]';
const SIBLING = '[data-stub="fits"]';
const CLOCK = '[data-clock]';

/** The page's own report of the outage, which the fault must not take with it. */
const OUTAGE = '[data-backend-unreachable]';

/**
 * Stages the fault: a page that was serving all three modules, then a backend that stops answering.
 * Live first rather than a page loaded already unreachable — the throw is raised by the teardown the
 * transition does, and a page that never drew the element never tears one down. That is precisely the
 * setup gap that let this failure ship.
 */
async function raiseTheFault(page: Page): Promise<void> {
  await holdHostClock(page, HOST_TIME);
  await render(page, FIXTURE);

  // The fault is read against a display that was whole: all three modules drawing, nothing reported.
  await expect(page.locator(THROWS)).toBeVisible();
  await expect(page.locator(SIBLING)).toBeVisible();
  await expect(page.locator(CLOCK)).toBeVisible();
  await expect(page.locator(FAULTED)).toHaveCount(0);
  await expect(page.locator(OUTAGE)).toHaveCount(0);

  await serveLiveness(page, 'abort');
  await advanceHostClock(page, 2 * LIVENESS_INTERVAL_MS);
}

test('says so where a module that threw stood, and nowhere else', async ({ page }) => {
  // Registered before the page loads, the throw being raised by a transition this test drives later:
  // a listener attached after it would miss what it is here to read.
  const escaped: string[] = [];
  page.on('pageerror', (error) => escaped.push(String(error)));

  await raiseTheFault(page);

  // One marker, in the faulting module's own region: the page says what became of that module where
  // that module was. Read as a count over the whole page as well as a presence in the region, so a
  // marker drawn over every placement alike — which would report three failures where there is one —
  // is caught rather than satisfying the presence.
  await expect(page.locator(`[data-region="${FAULTING_REGION}"] ${FAULTED}`)).toBeVisible();
  await expect(page.locator(FAULTED)).toHaveCount(1);

  // And it says something. The wording is not this item's to fix — what
  // SYS001<!-- Failure is legible and proportionate --> obliges is that the
  // failure is legible, and a marker with no text is not legible; an empty box would satisfy every
  // assertion made about presence alone.
  expect((await page.locator(FAULTED).innerText()).trim()).not.toBe('');

  // In that module's place rather than beside it: the module that threw is no longer drawing, so the
  // display does not carry a half-rendered module and a report of it at once.
  await expect(page.locator(THROWS)).toHaveCount(0);

  // Read last, and separately: the marker above is the symptom, and this is the cause. The error was
  // caught where the module is mounted rather than raised at the page, which is the whole of why
  // anything else on the display is still rendering. It is read after the marker rather than before it
  // because an absence of uncaught errors is also what a stub that never threw would show, and the
  // marker is what says one did.
  expect(escaped, 'the fault was contained rather than raised at the page').toEqual([]);
});

test('leaves every other module rendering, including one sharing the faulting region', async ({
  page,
}) => {
  await raiseTheFault(page);

  // The sibling that shares the region. A region is not the unit of containment — several modules may
  // be placed in one — so this is the neighbour a boundary drawn around the region rather than around
  // the placement would take down with the fault.
  await expect(page.locator(`[data-region="${FAULTING_REGION}"] ${SIBLING}`)).toBeVisible();

  // The clock elsewhere on the display, and still moving, which is the whole of the evidence. Presence
  // is worth nothing here: a page whose rendering has stopped holds every element it last drew, so a
  // frozen display passes every count and every visibility check made over it.
  const clock = page.locator(`[data-region="${SURVIVING_REGION}"] ${CLOCK}`);
  await expect(clock).toContainText(AT_OUTAGE);
  await advanceHostClock(page, 65_000);

  // Past the minute deliberately. The clock writes its seconds straight to the DOM node, off the
  // reactive graph (../../src/modules/clock/Clock.svelte), so seconds go on moving on a page whose
  // reactive rendering has stopped; the minute is the only reading on the display that does not.
  await expect(clock).toContainText(PAST_THE_MINUTE);

  // And no marker where nothing threw — the containment is to the module that faulted, not to every
  // module that happened to be on screen when one did.
  await expect(page.locator(`[data-region="${SURVIVING_REGION}"] ${FAULTED}`)).toHaveCount(0);
});

test('goes on reporting the outage it is in, and stops reporting it on recovery', async ({
  page,
}) => {
  await raiseTheFault(page);

  // The page's own report is a rendering like any other, and it is the one the field failure stranded:
  // the display held an outage report with the backend answering behind it for fifty-two minutes.
  await expect(page.locator(OUTAGE)).toBeVisible();

  await serveLiveness(page, 'ok');
  await advanceHostClock(page, 2 * LIVENESS_INTERVAL_MS);

  // Withdrawn once the backend answers. Read on the page the fault was raised on rather than on a
  // fresh one, since what is in question is whether this page can still change what it says.
  await expect(page.locator(OUTAGE)).toHaveCount(0);
});

test('draws the module again once the fault clears, and takes the marker away with it', async ({
  page,
}) => {
  await raiseTheFault(page);

  // The recovery is read against a fault that was real: the marker is up first, or what follows would
  // be asserted over a module that never stopped drawing.
  await expect(page.locator(FAULTED)).toHaveCount(1);
  await expect(page.locator(THROWS)).toHaveCount(0);

  // Held past the minute before the backend answers, which is what makes the reading below evidence
  // of anything: the clock writes its seconds straight to the DOM node, off the reactive graph
  // (../../src/modules/clock/Clock.svelte), so a page whose rendering has stopped still advances
  // them and only the minute does not. Within the mount's own minute this reads the same either way.
  await advanceHostClock(page, 65_000);

  await serveLiveness(page, 'ok');
  await advanceHostClock(page, 2 * LIVENESS_INTERVAL_MS);

  // On its own. Nothing reloads the page and nothing here asks it to retry — a display on a wall is
  // not attended, so a contained fault that needs a person to clear it has only moved the outage from
  // the whole display to one module of it.
  await expect(page.locator(THROWS)).toBeVisible();
  await expect(page.locator(FAULTED)).toHaveCount(0);

  // Both halves on the one page: the module drawing again and the page still rendering around it.
  await expect(page.locator(`[data-region="${SURVIVING_REGION}"] ${CLOCK}`)).toContainText(
    AT_RECOVERY,
  );
});
