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
**not** part of any gate. No JSON model snapshot is committed either: `likec4 export json` exists for
programmatic consumers, and nothing consumes it here yet — a future consumer (e.g. a tag→SRS
cross-check after issue #18) regenerates it on demand rather than reading a committed copy, whose
internal ids are not deterministic across machines anyway.

GitHub cannot transclude an external `.mmd` file into Markdown, so [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
carries an inline `mermaid` fence per diagram — **generated, not hand-maintained**: the final step of
`arch-export` ([`../../scripts/splice-arch-diagrams.mjs`](../../scripts/splice-arch-diagrams.mjs))
rewrites the region between each `arch-export:begin/end <file>` marker pair from the named artifact
in `generated/`. Hand edits inside a marker region are overwritten on the next export and caught by
the staleness gate; the prose around the markers is yours to edit.

## Extending later — add, don't rework

The model is authored so **Component and Code levels arrive additively** — no restructuring:

- **Components** nest inside a container. When the Go backend gains internal parts, add
  `component` children *inside* the existing `backend { … }` block and a `view of backend { … }` in
  `views.likec4`. The existing Context and Container views are untouched.
- **Source `link`s** wire the model to real code. Once `backend/`/`frontend/` exist, add a `link`
  property to a container or component (the commented placeholders in `model/wisekiosk.likec4` show
  where). This is how the model stops being a drawing and starts pointing at the code it describes.

Do not build Component/Code content before the code exists — that would be abstraction without a
second consumer ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist, generality). The
hooks are reserved; that is enough.

## Traceability hook: architecture → requirements (mechanism only)

A LikeC4 **tag** is how an element carries the Doorstop `SRS` requirement id it satisfies — that tag
*is* the architecture → requirements link. The mechanism is wired but **no real ids are bound yet**:

- The two containers carry a placeholder `#needs-srs` tag (declared in the model's `specification`).
- **TODO(#18):** declare one tag per `SRS` id a container satisfies (e.g. `tag SRS042`) and
  apply it (`#SRS042`) to that container, replacing `#needs-srs`. The element→source `link`s that
  complete the trace are checked at review ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist,
  architecture links) once the code they point at exists.
