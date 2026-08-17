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
reaching for anything that would dim a glyph.

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

SRS033's<!-- Text holds a minimum size against the display, at every resolution --> floor itself is not a number this contract can cite: it is calibrated where its check
activates, not fixed in the requirement text, so a value pinned here could still go stale against
it. These five steps are authored well clear of any plausible floor, `caption` — the smallest —
included; an author who needs a step below `caption` halts and asks rather than assuming headroom
this contract cannot confirm.

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
