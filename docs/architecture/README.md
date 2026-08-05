# WiseKiosk architecture model (LikeC4)

The checkable, versioned model of WiseKiosk's architecture. It is the **single source of truth** for
the diagrams in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — those are generated from this model, never
drawn by hand. Why LikeC4 and not D2/Mermaid/Structurizr/PlantUML: see
[ADR 0003](../decisions/0003-architecture-as-code-likec4.md).

This tooling is **dev-only and siloed here** (per [`CI.md`](../CI.md)'s repository-shape gate): its
`package.json`, lockfile, and `node_modules/` live in this directory; nothing depends on it at app
build or runtime.

## Layout

```
docs/architecture/
  package.json          pins `likec4` (the repo's first npm manifest); dev-only
  package-lock.json     committed lockfile — `npm ci` installs exactly this
  model/
    wisekiosk.likec4    specification + model (elements, relationships)
    views.likec4        the views rendered to diagrams
  generated/            regenerated artifacts — DO NOT hand-edit (staleness-gated)
    index.mmd           System Context view (Mermaid)
    containers.mmd      Container view (Mermaid)
```

`generated/` is cleared before codegen, which writes files and never prunes them: an artifact left
behind by a deleted view is byte-identical to what is committed, so the staleness diff cannot see one
unless the export removes it first. The mirror case — a view whose artifact was never committed — is
untracked rather than changed, so the diff is taken after `git add --intent-to-add` to reach it.
**Commit `model/`, `generated/` and `../ARCHITECTURE.md` in one change**; either half alone fails.

## Editing the model

1. `just arch-install` the first time (runs `npm ci` here, installing the locked `likec4`).
2. Edit `model/*.likec4`.
3. From the repo root, run `just arch-export` — this **validates** the model and **regenerates** every
   generated output: the artifacts in `generated/` *and* the diagrams spliced into
   [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
4. Commit `model/`, `generated/`, and `../ARCHITECTURE.md` together.

`just arch-dev` opens LikeC4's live preview (a local dev server, needs a browser) — handy while
authoring, but it is **not** a gate.

## Validation and the staleness gate

Two properties are enforced, both browser-free and both run in CI:

- **The model is valid**, per [`CI.md`](../CI.md)'s documentation-integrity gate. `likec4 validate`
  exits non-zero on an undefined element, an unresolved relationship, or an invalid view. It runs
  *first* in `arch-export` because `codegen` alone does **not** fail on a broken model — validation
  is the real gate.
- **The generated outputs are not stale**, per the same gate. `just check-arch` regenerates
  everything, then `git diff --exit-code docs/architecture/ docs/ARCHITECTURE.md`. If the committed
  artifacts — or the diagrams spliced into `ARCHITECTURE.md` — don't match what the current model
  produces, CI fails:
  the same "CI fails on stale generated code" rule the boundary contract and config schema live
  under. The `architecture` job in
  [`../../.github/workflows/checks.yml`](../../.github/workflows/checks.yml) runs the byte-identical
  commands (its install step is `just arch-install`), and `check-arch` is part of `just verify`.

## Rendering (browser-free)

Diagrams are produced by `likec4 codegen mermaid`, which GitHub renders inline — no image binaries, no
headless browser. Image export (`export png`/`jpg`) *does* need a headless browser and is deliberately
**not** part of any gate. No JSON model snapshot is committed either: `likec4 export json` is read on
demand by [`../../scripts/check-arch-trace.py`](../../scripts/check-arch-trace.py), rather than from a
committed copy whose internal ids are not deterministic across machines. A second consumer follows
that shape, and validates the model first: `export json` exits zero on a model that does not parse
and emits a degraded document, so a consumer that skips validation reads a broken model as an empty
one.

GitHub cannot transclude an external `.mmd` file into Markdown, so [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
carries an inline `mermaid` fence per diagram — **generated, not hand-maintained**: the final step of
`arch-export` ([`../../scripts/splice-arch-diagrams.mjs`](../../scripts/splice-arch-diagrams.mjs))
rewrites the region between each `arch-export:begin/end <file>` marker pair from the named artifact
in `generated/`. Hand edits inside a marker region are overwritten on the next export and caught by
the staleness gate; the prose around the markers is yours to edit.

## What the model holds, and when an element earns a place

The model holds the System Context and Container levels. The Component level is #98 C4 phase 3, and
nests additively — `component` children inside a container, with a `view of <element>` in
`views.likec4` — so it restructures nothing already here.

**A relationship is declared once, at its true endpoints** ([ADR 0020](../decisions/0020-two-containers-one-origin-and-dual-tier-tags.md)).
Each view renders from that one set, aggregating an edge to the nearest ancestor it does not expand,
so an edge is never restated a level down.

**Two relationships sharing endpoints render as one edge labelled `[...]`, losing both labels** — a
merge in the computed view, so no codegen target escapes it. A view asks for them separately:

```
include frontend -> backend with {
  multiple true
}
```

A view that must stay coarse instead labels the merge, `with { title '…' }`, because naming a nested
element in a view draws it — which is how the Context level keeps one operator edge without gaining a
container. That title is not coupled to the merge it was written for: it survives the relationships
underneath it changing, and no gate compares them.

**Element and relationship bodies parse a tag only as their first entry**, before `technology`,
`icon` or `description`.

**An element earns a place where the system exchanges something with it, and an upstream once the
module that reads it has a need** ([ADR 0019](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)).
Component content waits on the code it describes, which is ADR 0003's rule against building a level
before its second consumer exists rather than anything this level decides.

**Source `link`s** wire the model to real code: once `backend/`/`frontend/` exist, a `link` property
on a container or component points at the source implementing it. This is how the model stops being a
drawing and starts pointing at the code it describes, and it is checked at review
([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist, architecture links).

## Traceability: architecture → requirements

A LikeC4 **tag** carries the Doorstop id of the requirement obliging the element or relationship it
sits on — that tag *is* the architecture → requirements link, and the tier follows the level
([ADR 0019](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). At the Context level
it is `SYS`, bound where the obligation is observable at that level: on the relationships, not on the
system box, which owes every `SYS` item and so distinguishes none of them. The Container level
answers to `SRS`, and anything at a level also carries the coarser item it discharges observably
there ([ADR 0020](../decisions/0020-two-containers-one-origin-and-dual-tier-tags.md)). The tier below
is settled by the phase that models that level.

**A tag is applied where an accepted item obliges the thing it sits on** — so an element or edge no
accepted item obliges carries none, and one carrying coupled obligations carries all of them. What is
barred is stamping an element with everything it owes, which distinguishes nothing. An item obliging
every exchange an element has goes on the element rather than one of its edges; an item whose
obligation reaches something permanently outside the model is not a tag here at all, which is
different from one whose subject is merely not modelled yet.

**`just check-arch-trace` resolves them against the tree** — what it asserts, and what it leaves to
review, is [`../CI.md`](../CI.md) § Documentation integrity's.
