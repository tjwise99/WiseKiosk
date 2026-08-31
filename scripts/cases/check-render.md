# `check-render`

The inputs this check has been run against, in both directions. What the tier *guarantees* is
[`docs/TESTING.md`](../../docs/TESTING.md)'s and which runner executes it is
[ADR 0027 rev 1](../../docs/decisions/0027-frontend-test-runners.md)'s; how to run a case is
[`../README.md`](../README.md)'s.

The recipe runs Playwright over two populations — the framework's own render specs under
`frontend/tests/render/` and each module's render spec beside its component — at each of the three
supported viewports, against a dev server running the production Vite configuration with the module
registry augmented by the tier's stubs. Each fixture is a configuration the test fulfils on the
`config.json` route, so one server serves every case and each test states the configuration it
asserts against.

Each seed below is applied to the working tree, the recipe run at the kiosk viewport, and the seed
reverted. `passed`/`failed` are the counts the run reported, taken at `b2ab5fc`. A seed that trips
more than one read reports more than one failure, which is why several rows name the reads they
moved — a count that drops when a read is deleted is the first sign the seed stopped covering it.

| Direction | Case | Input | Result |
|---|---|---|---|
| Must fail | Every region resolves to one cell of the frame | `placementStyle` returns `middle_center`'s placement whatever it is asked for | 2 failed, 4 passed — the disjointness and anchoring reads |
| Must fail | Every module is assembled into one region | the frame groups every placement under `top_bar` | 4 failed, 2 passed — occupancy, containment, disjointness and anchoring |
| Must fail | A region clips what leaves it | `overflow: hidden` on `.region` | 1 failed, 2 passed |
| Must fail | A region scrolls what leaves it | `overflow: auto` on `.region` | 1 failed, 2 passed |
| Must fail | A region clips by a route that is not `overflow` | `clip-path: inset(0)` on `.region` | 1 failed, 2 passed |
| Must fail | Content anchored to the wrong side of its region | the two axis properties in `placementStyle` crossed | 1 failed, 5 passed — the anchoring read |
| Must fail | A surface above the ceiling spelled outside sRGB | a stub grounded in `oklch(0.95 0 0)`, against the sRGB-only token reader | 1 failed, 9 passed |
| Must fail | Content is carried below full emission | `--emission-content: #ccc` | 2 failed |
| Must fail | A type step is fixed in device pixels | `--type-caption: 12px` | 3 failed |
| Must fail | The declared band is ignored | `edgeBandLength` returns `0px` whatever it is given | 4 failed (clearance), 3 failed 1 passed (depth) |
| Must fail | A band is compiled in where none is declared | `edgeBandLength` returns `3vh` for an absent depth | 1 failed, 3 passed |
| Must fail | Any emitting surface clears the ceiling | eight stub modules, one per device the ceiling refuses — a lit panel, a card's border, a region fill, an outline, a shadow scrim, the fill and the scrim spelled as gradients, and a ground spelled outside sRGB | each is a standing test rather than a reverted seed |
| Must pass | The tree as it stands | — | 96 passed across the three viewports |

**The emission seeds are tests rather than seeds.** Each device
TST045<!-- Emitting-surface test --> names is a stub module the emission spec places and then asserts
the scan reports, so the check's own fallibility is re-run on every CI run instead of being a
procedure somebody remembers. The legal direction runs beside them: the grouping vocabulary at its
stated emission, and the two things the exemption exists for — text at full emission and imagery
brighter than the ceiling — are placed together and asserted to leave the scan empty.

**The imagery exemption is load-bearing, and was not.** As first written it was dead code: removing
the `img, svg, video, canvas` branch entirely changed no outcome, because the scan reads CSS surfaces
and an image's own painted pixels are not one, so the fixture's `<img>` had nothing measurable on it.
The claim in TST045's<!-- Emitting-surface test --> text — that the two must-pass cases are what a
scan dropping the exemption would fail — was therefore false for the imagery half. `BrightImage.svelte` now carries its bright
field as a `background-color` on the `img`, which is what the scan can read; removing the exemption
now turns the legal run red naming `bright-image`, seeded and confirmed. What stays unmeasured, and
is stated rather than implied: an image's own pixels. Imagery is exempt **by element type**, so a
dark `<img>` and a blinding one are treated alike.

**Colour is resolved by painting, not by parsing.** Each computed value is filled into a 1×1 canvas
over black and the pixel read back. The first form of this scan matched `rgb()`/`rgba()` with a
regular expression, which silently skipped every colour space Chrome preserves in computed style —
measured: `oklch(0.95 0 0)`, `color-mix(…)` (serialised `color(srgb …)`), `color(display-p3 …)` and
`lab(…)` all pass through unmatched, so a surface at ≈89% relative luminance was not mis-measured but
**not measured at all**. Painting also composites alpha against the ground the page actually draws
on, for free. A token the canvas cannot resolve, and a drawn value yielding no colour token, are each
reported as `unreadable` and asserted empty — a failure, never a skip.

**Defects the seeds found in the page rather than in the tests**, each fixed before the tier went
green.

- **Every region anchored its content to the wrong axis.** `.region` is a column flex container, in
  which `justify-content` is the *vertical* axis and `align-items` the *horizontal* one — the
  opposite of what the placement fields were documented as, so `top_right` hugged the left of its
  column, `bottom_left` the right, and both bars and both thirds sat in a corner instead of centred.
  The containment read passed throughout, a left-aligned stub being inside its right-hand region.
  Fixed by naming the fields for the axes rather than for the properties, and the anchoring read
  above now asserts a *side* — derived from what each region's name means, not from the placement map,
  which would compare that map against itself.

- **A region grew to its content instead of holding its track**, so nothing ever overflowed and the
  band's own box ran 4826px down a 1080px display. Two causes: a grid item's automatic minimum is its
  content, and in an auto-height grid an `fr` track is sized to its content rather than to a share of
  the container. Fixed by `min-height: 0` on the region and a definite `height: 100vh` on the frame.
- **The type-size read counted text nobody sees.** `document.querySelectorAll('*')` reaches `head`,
  so the document title and every injected stylesheet's source were being measured — each at the
  16px UA default, which sits above the floor and so passed while measuring the wrong thing. Fixed by
  reading only elements the page renders.
- **Two of the three assertions carrying the clipping clause could not fail.** One compared the
  *document's* scroll height against a *region's* height (`1080 > 360` whatever the page did); the
  other compared a viewport-absolute `bottom` against a *height*, a frame-of-reference mismatch. With
  both inert, the clause rested on reading `overflow === 'visible'` — a *declared* value, which is
  the one thing ADR 0027 rev 1 says this tier exists not to depend on. Replaced by hit-testing below
  the region's own bottom edge: `document.elementFromPoint` returns the module's content when it
  overflows and the frame behind it when it is clipped or scrolled. That survives `overflow: hidden`,
  `overflow: auto` **and** `clip-path`, none of which the declared read caught, all three seeded above.
- **A fixture asserted the wrong obligation.**
  TST035's<!-- Viewport-driven layout render test --> fixture put the whole type scale in a third
  it does not fit, so the containment read failed on a page overflowing exactly as
  SRS031<!-- Content too large for its region overflows --> obliges. That item's own fixture is the
  one that overflows; this one fits, which is what its text asks for.

**A `background-image` carrying no colour is reported, and wants a person.** The scan reads colour
tokens, so a gradient is measured stop by stop while `url(...)` imagery yields none — that value is
returned as `unreadable` and fails, rather than passing as though it had been judged. This is
deliberate and it is where a module author under #12 first module end-to-end will meet the check: a
picture drawn behind a block of text is exactly the call
SRS030's<!-- Only content is rendered above the emission ceiling --> own
`verification-justification` says the check cannot make — above the ceiling it "must still decide
whether a surface is text or imagery rendered as content". The message names the element and the
value; deciding whether that image is content or decoration is the author's, and if it is content it
belongs in an element the imagery exemption reaches rather than behind one.

**What it does not catch.** The obligations quantify over every viewport and every resolution the
display supports while this renders three, so a layout that first overlaps, or a step that first
drops below the floor, at an unsampled size passes. Nothing here reaches what the panel emits or what
a viewer sees over the reflected room: backlight, gamma and the half-silvered surface all lie past
the value read. The scan reads only what the page renders — an element hidden by `display: none` or
`visibility: hidden` is skipped, so a surface above the ceiling that is revealed by a later state
change is unjudged until something renders it.
