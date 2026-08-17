# 0025 — Display region roster: a fixed named set, not an operator-configurable grid

**Status:** accepted
**Decided:** 2026-08-16 (#154 display design)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-16 — first written (#154 display design).

## Context

The tree obliges a display that lays content into regions that are disjoint and reflow at every
supported viewport (SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at
narrower widths -->) — but it does not say what those regions are called or how many there are.
That is a configuration-schema question with a real rejected alternative, not an obligation a
requirement states, so it belongs here rather than in the tree
([ADR 0011 rev 2](0011-requirement-or-convention.md)).

A module's `region` value is a configuration key, and SRS024<!-- Every offered configuration key is
exercised at a non-default value --> requires every configuration key exercised at a non-default
value; that per-key enumeration needs a finite, machine-readable set to range over, which is what
this record fixes.

**Scope is the roster, not the display's visual design.** Styling approach, typeface, and the
grouping vocabulary a module reaches for are design decisions
[the display styling contract](../contracts/display-styling-contract.md) states and owns; this
record cites that contract rather than restating any of it.

## Decision

**The region roster is a fixed named set, not an operator-configurable grid.** Thirteen names:
`top_bar`, `top_left`, `top_center`, `top_right`, `upper_third`, `middle_center`, `lower_third`,
`bottom_left`, `bottom_center`, `bottom_right`, `bottom_bar`, `fullscreen_above`, `fullscreen_below`.
Each is an enum member the configuration schema offers as a module's `region` value, the same shape
[ADR 0022 rev 1](0022-config-schema-format.md)'s illustrative fragment shows for one key;
SRS024<!-- Every offered configuration key is exercised at a non-default value -->'s per-key
enumeration ranges over exactly that fixed set, and SRS017<!-- Full-screen assembly at kiosk;
reflow, no horizontal scroll, at narrower widths -->'s disjointness and reflow obligations bind the
roster the page lays out. Which region a given module is assigned is a per-deployment configuration
choice; the roster itself is not.

  **Open — the string dialect.** Region names are an operator-written configuration key, and whether
  the schema spells them `top_left` (underscored) or `top-left` (the hyphenated form
  [ADR 0022 rev 1](0022-config-schema-format.md)'s illustrative fragment happened to use) is
  undecided. Halt-and-ask, carried to whichever ticket authors the schema; it settles the strings,
  never the roster this record fixes.

## Alternatives considered

- **An operator-configurable region grid**, letting a deployment declare its own regions rather than
  choose among a fixed set. Rejected: SRS024<!-- Every offered configuration key is exercised at a
  non-default value -->'s per-key enumeration needs a finite, machine-readable set to range over, and
  a grid an operator can reshape is not one. It is also generality with no second consumer — no
  deployment has asked for a region this roster does not already name — which
  [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) *Before you build anything* already refuses:
  "no abstraction without a second consumer."

## Consequences

- **The configuration schema's `region` enum is fixed to these thirteen names.** A per-deployment
  need for a region outside this set is not something the schema can accept; it revisits this record
  rather than being authored around it.
- **The region-name string dialect stays open**, carried to whichever ticket authors the schema.
