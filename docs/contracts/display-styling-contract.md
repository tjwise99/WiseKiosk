# Display styling contract

This is the display's design language: what an author reaches for, by hand, to make a module's
markup look like it belongs on the kiosk. It states the concrete design — the region frame, the
grouping vocabulary, the type and spacing scales, the typeface — and cites the obligations that
constrain it rather than restating them. Where this contract and
[`module-contract.md`](module-contract.md) both touch a module, they are siblings, not
duplicates: that contract is the module's six parts and how one is added; this one is what a
module's own component styles against once it exists. Neither restates the other.

## Region frame

The page lays modules out into the fixed named-region roster
([ADR 0025 rev 1](../decisions/0025-display-region-roster.md)) — not a
configurable grid. Each name anchors its region to a corner or edge of the display and sizes it to
what the configuration puts there — it is not a cell in a grid the frame divides in advance. The
operator-facing string form of each name (underscored, hyphenated, or otherwise) is the
configuration schema's to settle, not this contract's.

Region disjointness and reflow across supported viewports are
SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->'s to
hold; the frame here only names the roster and where each region anchors.

## Emission: full white, hierarchy by size, weight and position only

The emission and colour rule for readable text is
SRS032<!-- Readable text is carried at full emission -->'s. What it leaves an author is the type
scale below as the whole vocabulary of hierarchy: reach for a bigger step or a heavier weight before
reaching for anything that would dim a glyph. Weight belongs in that vocabulary as a legibility lever,
not a stylistic flourish: stroke thickness is photons per character, so a thin weight is the first
thing a bright reflection swallows.

## Grouping vocabulary

Bare surface — no stroke, no fill — is the default for every module and every region. Two
affordances are available, never required, and are reached for only when a region's content earns
one:

- **A dim stroke** — a header's bottom divider, or a rectangular outline around a block of
  content. Rectangular; not heavily rounded.
- **A dim, below-ceiling fill** — a tint filling part of a stroke's outline, used instead of or
  together with it.

Both sit below the emission ceiling that everything but content stays under
(SRS030<!-- Only content is rendered above the emission ceiling -->); nothing here spends the
mirror SYS008<!-- The surface carrying no content is a mirror --> reserves. A grouping mark drawn
above that ceiling is not this contract's device.

A strokes-only reading — permitting the divider but never a fill — was considered and set aside:
nothing the mirror wants is spent by permitting both, provided neither is ever required.

**Decision rule.** Reach for an affordance only when a region stacks two or more
independently-labelled items that would otherwise run together with nothing marking where one ends
and the next begins — three parks' wait lists sharing one region is the case this is built for. A
single module's own content, however dense, is already set apart from its neighbours by the region
frame itself and does not earn one on density alone. Prefer the lighter device first: a header's
divider before a full outline; add a fill only where the outline alone still reads as a loose
scatter rather than one shape.

## Type scale

Five steps, sized against the display's own height so the scale holds across every resolution the
display supports — the same reasoning
SRS033<!-- Text holds a minimum size against the display, at every resolution --> states for the
floor beneath all of them. `vh` rather than a device-pixel or root-relative unit, for the same
reason: it is what survives the panel changing.

| Step | Height | Weight | Used for |
|---|---|---|---|
| display | `16vh` | 700 | the one hero figure a region is built around (clock face) |
| headline | `10vh` | 700 | a large standalone stat (current temperature) |
| section-header | `1.9vh`, uppercase, `0.12em` tracking | 700 | a module or group label sitting above a divider |
| body | `2.2vh` | 500–600 | primary readable content lines |
| caption | `1.7vh` | 600 | secondary or meta text — labels, units, timestamps |

The floor beneath these five steps is chosen under **Calibrated bounds** below, rather than left to
the check that will assert it — this contract is its origin, not a copy that could drift. All five
are authored well clear of it, `caption` — the smallest — included; an author who needs a step below
`caption` checks it against that figure rather than assuming headroom this contract cannot confirm.
And prefer a larger step to a smaller one for a reason beyond the floor: the reflected room supplies
its own detail at roughly the spatial frequency of small, thin type, so shrinking a glyph to gain
space moves it *toward* the reflection rather than away from it. Type is the wrong thing to shrink.

## Calibrated bounds

Two numeric bounds the design language above is written against, each a single figure chosen once to
hold across every installation the product is built for. They are chosen here and asserted by their
checks — recalibrating one is a change to that check, not to this contract or to the requirement it
serves, which is why SRS030<!-- Only content is rendered above the emission ceiling --> and
SRS033<!-- Text holds a minimum size against the display, at every resolution --> both keep saying "a
stated fraction" and name no number. How each was calibrated — the in-situ photographs, the
arcminute model, the retired luminance ramp — is the
[display design study](display-design-study.md); what follows is the figure that study settles on,
with the reasoning in brief.

**Viewing distance — 6 ft nominal, 9 ft outer bound (≈1.8–2.7 m).** The basis both figures below are
calibrated against, measured at the deployed installation (owner). It is not configuration: the
software never reads it. Neither figure is interpretable without it, which is why it is recorded here
beside them.

**Type-size floor — 1.4% of the display's height**, read as computed `font-size` ÷ viewport height
(font-size, not cap height). This is the owner-reported *marginal* edge of legibility at the nominal
6 ft — the smallest a glyph may be, not a comfortable size — so every step of the type scale above
clears it, `caption` (1.7vh) by ≈21%. A floor set at the comfortable size instead would sit above
`caption` and force the scale up; the floor is the last legible size, and comfort is the scale's job.
Stated as a fraction of height so it survives a change of panel or resolution, which a size fixed in
device pixels does not.

**Emission ceiling — 6% of the display's maximum emission**, measured as relative (linear) luminance
of the composited surface — a fraction of the luminance of full white, not of an sRGB code value.
Everything the page draws but content stays below it
(SRS030<!-- Only content is rendered above the emission ceiling -->), so the grouping vocabulary's
dim stroke and below-ceiling fill live in the band beneath, while readable content emits at full
white (SRS032<!-- Readable text is carried at full emission -->) far above. 6% admits a dim stroke
around `#444` and holds every step of the display's retired luminance ramp — down to `#666` at ≈13%
luminance, which the glass swallowed in situ — above the ceiling, so a dimmed tier cannot return as
decoration. Below it a mark reads over the dark reflection the mirror
(SYS008<!-- The surface carrying no content is a mirror -->) is designed around and vanishes over a
bright one, which is correct: grouping is an enhancement over dark ground, never a load-bearing
contrast device.

## Spacing scale and the edge band

A small modular set, in the same unit as the type scale:

| Step | Height |
|---|---|
| `xs` | `0.5vh` |
| `sm` | `1vh` |
| `md` | `1.5vh` |
| `lg` | `2.5vh` |

`xs` is a micro-gap inside one line (an icon and its value); `sm` separates rows within one list;
`md` separates a header-and-divider from what follows it; `lg` separates sibling groups sharing one
region.

The band every laid-out region stays clear of
(SRS034<!-- The laid-out regions keep clear of the display edge -->) is exposed as a single CSS
custom property, `--edge-band`, read from the deployment's configuration and defaulting to `0` where
none is supplied — the property's value, not its name or the shape of the key that fills it, which
belong to the configuration schema
(SRS035<!-- The masked edge band is the deployment's to declare -->).

## Typeface

Inter, bundled and self-hosted from the backend's own origin — the display page reaches no other
(SRS010<!-- The display page reaches no origin but the backend's -->) — as a single variable font
file, Latin subset, its weight priced against the bundle ceiling a Pi Zero-class host holds the
frontend to (SRS021<!-- Frontend runs on a Pi Zero-class browser host -->). The slashed-zero
OpenType feature (`"zero" 1`) is on throughout, to keep `0` and `O` apart at every size in the
scale above. Rendered only at the full emission the emission rule above states — Inter carries no
exception to it.

**Considered and set aside:**

- A system-font stack — renders differently per host, non-deterministic for a fixed appliance.
- Manrope — warmer, but its rhythm reads as inconsistent with itself.
- IBM Plex Sans and Plex Mono — an ambiguous `0`.
- Space Grotesk — its `B` and some numerals read poorly at display sizes.
- Roboto Condensed — spartan; a width-only fallback, not the primary face.
- A webfont CDN — a third-party origin, forbidden by
  SRS010<!-- The display page reaches no origin but the backend's -->.

## Token delivery and styling approach

Shared design tokens — the scales above — live as `:root` custom properties in
`frontend/src/app.css` (frontend source sits under `frontend/src/`,
[ADR 0021 rev 1](../decisions/0021-repository-layout.md)); this contract states their values, not
the file. A module's own styling — its layout, its use of these tokens — stays in that module's own
Svelte `<style>` block, never in a standalone stylesheet of its own. A standalone product `.css`
file is a disposition [ADR 0017 rev 6](../decisions/0017-authored-language-set.md) grants; this
contract's shared tokens are what it holds.

**Considered and set aside:**

- All shared styling in the root component's global `<style>` block — real, and needs no
  [ADR 0017 rev 6](../decisions/0017-authored-language-set.md) disposition at all, but couples
  every module to `App.svelte` rather than to a token sheet each imports from.
- A utility-first CSS framework (Tailwind or similar) — extra weight against the bundle ceiling
  SRS021<!-- Frontend runs on a Pi Zero-class browser host --> holds the frontend to, for a handful
  of tokens and modules that don't earn it.
