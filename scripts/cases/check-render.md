# `check-render`

The inputs this check has been run against, in both directions. What the tier *guarantees* is
[`docs/TESTING.md`](../../docs/TESTING.md)'s and which runner executes it is
[ADR 0027 rev 1](../../docs/decisions/0027-frontend-test-runners.md)'s; how to run a case is
[`../README.md`](../README.md)'s.

The recipe runs Playwright over `frontend/tests/render/`, at each of the three supported viewports,
against a dev server running the production Vite configuration with the module registry substituted
for the tier's stubs. Each fixture is a configuration the test fulfils on the `config.json` route, so
one server serves every case and each test states the configuration it asserts against.

Each seed below is applied to the working tree, the recipe run at the kiosk viewport, and the seed
reverted. `passed`/`failed` are the counts the run reported.

| Direction | Case | Input | Result |
|---|---|---|---|
| Must fail | Every region resolves to one cell of the frame | `placementStyle` returns `middle_center`'s placement whatever it is asked for | 1 failed, 4 passed — the disjointness read |
| Must fail | Every module is assembled into one region | the frame groups every placement under `top_bar` | 3 failed, 2 passed — occupancy, containment and disjointness |
| Must fail | A region clips what leaves it | `overflow: hidden` on `.region` | 1 failed, 2 passed |
| Must fail | Content is carried below full emission | `--emission-content: #ccc` | 2 failed |
| Must fail | A type step is fixed in device pixels | `--type-caption: 12px` | 3 failed |
| Must fail | The declared band is ignored | `edgeBandLength` returns `0px` whatever it is given | 4 failed (clearance), 3 failed 1 passed (depth) |
| Must fail | A band is compiled in where none is declared | `edgeBandLength` returns `3vh` for an absent depth | 1 failed, 3 passed |
| Must fail | Any emitting surface clears the ceiling | seven stub modules, one per device the ceiling refuses — a lit panel, a card's border, a region fill, an outline, a shadow scrim, and the fill and the scrim spelled as gradients | each is a standing test rather than a reverted seed |
| Must pass | The tree as it stands | — | 90 passed across the three viewports |

**The emission seeds are tests rather than seeds.** Each of the seven devices
TST045<!-- Emitting-surface test --> names is a stub module the emission spec places and
then asserts the scan reports, so the check's own fallibility is re-run on every CI run instead of
being a procedure somebody remembers. The legal direction runs beside them: the grouping vocabulary
at its stated emission, and the two things the exemption exists for — text at full emission and an
image brighter than the ceiling — are placed together and asserted to leave the scan empty. Without
those two the same empty result would be reported by a scan that had dropped the exemption
altogether.

**Three defects the seeds found in the page rather than in the tests**, each fixed before the tier
went green.

- **A region grew to its content instead of holding its track**, so nothing ever overflowed and the
  band's own box ran 4826px down a 1080px display. Two causes: a grid item's automatic minimum is its
  content, and in an auto-height grid an `fr` track is sized to its content rather than to a share of
  the container. Fixed by `min-height: 0` on the region and a definite `height: 100vh` on the frame.
- **The type-size read counted text nobody sees.** `document.querySelectorAll('*')` reaches `head`,
  so the document title and every injected stylesheet's source were being measured — each at the
  16px UA default, which sits above the floor and so passed while measuring the wrong thing. Fixed by
  reading only elements the page renders.
- **A fixture asserted the wrong obligation.**
  TST035's<!-- Viewport-driven layout render test --> fixture put the whole type scale in a third
  it does not fit, so the containment read failed on a page overflowing exactly as
  SRS031<!-- Content too large for its region overflows --> obliges. That item's own fixture is the
  one that overflows; this one fits, which is what its text asks for.

**What it does not catch.** The obligations quantify over every viewport and every resolution the
display supports while this renders three, so a layout that first overlaps, or a step that first
drops below the floor, at an unsampled size passes. Nothing here reaches what the panel emits or what
a viewer sees over the reflected room: backlight, gamma and the half-silvered surface all lie past
the value read.
