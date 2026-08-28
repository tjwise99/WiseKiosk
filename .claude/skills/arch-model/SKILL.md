---
name: arch-model
description: >-
  Change the WiseKiosk LikeC4 architecture model — add an element, apply or move a requirement tag —
  and land it with its generated artifacts. Carries where a tag is declared and applied, which level
  it answers to, the regenerate-and-commit-together rule, and why one gate reads HEAD rather than the
  working tree. Invoke when drawing something new in the model, when an accepted requirement needs a
  subject, or when `check-arch` or `check-arch-trace` fails.
---

# Change the architecture model

Sources: [`docs/architecture/model/`](../../../docs/architecture/model/) — `wisekiosk.likec4` (logical),
`deployment.likec4`, `views.likec4`. The boundary, what earns an element a place, and where a tag sits
are [ADR 0019 rev 5](../../../docs/decisions/0019-boundary-at-what-deploys-and-tag-tier.md)'s;
[`docs/architecture/README.md`](../../../docs/architecture/README.md) holds the declaring and editing
rules.

## Tags: two halves, both checked

**Declare** in the `specification { … }` block — every tag, or LikeC4 will not parse it, and a tag
declared and applied to nothing fails the gate.

**Apply** as the **first entries of an element or relationship body**. A tag parses nowhere else:

```likec4
    frontend = container 'Frontend' {
      #SYS002
      #SRS017
      technology 'Svelte 5, static single-page bundle'
```

A tag on a **view** is not read. Views are not tag subjects; logical and deployment elements and
relationships are.

## Which subject

**The Context level answers to `SYS`; Container, Component and Deployment answer to `SRS`** — but an
element or relationship also carries any coarser item it **discharges observably at that level**, so a
`SYS` tag on a container or a component is legitimate where that thing is what visibly discharges it.

Two rules do the real work, and neither gate can check either:

- **A tag sits where the item obliges the thing it sits on**, not where the item is merely plausible.
  Both gates read green either way — a tag renders nowhere, and the trace gate asks only that every
  accepted item is tagged *somewhere*. This is question 18 on
  [`CONTRIBUTING.md`](../../../CONTRIBUTING.md)'s checklist for that reason.
- **Depth does not make the finer placement the right one.** An item quantifying over every output a
  container produces belongs on the container even where components are drawn beneath it. An item one
  component determines belongs on the component.

**Tags discriminate rather than inventory.** Stamping an element with everything it owes distinguishes
nothing. A subject accumulating tags is the signal to argue the next addition.

## `check-arch-trace` reads both directions

Every tag must name an item that resolves, is `status: accepted` **and** `active: true` — so a
`proposed` item cannot be tagged. And every accepted, active `SYS`/`SRS` item must be tagged
somewhere. `TST` is outside the population.

The consequence for sequencing: **the model lands in the same change as the status flip**, never
before or after. An accepted item nothing carries fails one direction; a tag on a `proposed` item
fails the other.

Where an item can bind nowhere, the model grows to draw what it obliges. There is no exemption record.

## Regenerate, and commit together

```sh
just arch-export     # regenerates docs/architecture/generated/*.mmd and splices ARCHITECTURE.md
```

**`check-arch` diffs the regenerated artifacts against `HEAD`, not the working tree.** So the model,
the generated `.mmd` files and `docs/ARCHITECTURE.md` are committed **together**; a model edit sitting
uncommitted reads as stale however many times it is regenerated.

**Adding an element moves a diagram; adding or moving a tag moves nothing** — no tag renders. If a tag
change produced a diff, something else changed too.

Sweep the hand-written `ARCHITECTURE.md` prose the drawing falsifies, in the same change. That prose is
outside every gate, so nothing will tell you. A responsibility statement belongs in the model's
`description` and is not restated in `ARCHITECTURE.md`.

An element gains a `link` to its source when that source exists — not before.

`just arch-install` if `docs/architecture/node_modules` is missing; the trace gate shells out to
`likec4 validate` and `likec4 export json`.
