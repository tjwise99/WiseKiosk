# WiseKiosk architecture model (LikeC4)

The checkable, versioned model of WiseKiosk's architecture. It is the **single source of truth** for
the diagrams in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and for the full [interactive
site](https://tjwise99.github.io/WiseKiosk/architecture/) — both are generated from this model, never
drawn by hand. Why LikeC4 and not D2/Mermaid/Structurizr/PlantUML, and why the committed diagram
renders through Graphviz rather than Mermaid: see
[ADR 0003 rev 4](../decisions/0003-architecture-as-code-likec4.md).

This tooling is **dev-only and siloed here** (per [`CI.md`](../CI.md)'s repository-shape gate): its
`package.json`, lockfile, and `node_modules/` live in this directory; nothing depends on it at app
build or runtime.

## Layout

```
docs/architecture/
  package.json          pins `likec4` (the repo's first npm manifest); dev-only
  package-lock.json     committed lockfile — `npm ci` installs exactly this
  model/
    wisekiosk.likec4    specification for both models + the logical one (elements, relationships)
    deployment.likec4   the deployment model (nodes, instances, artifacts)
    views.likec4        the views rendered to diagrams
  generated/            regenerated artifacts — DO NOT hand-edit (staleness-gated)
    index.dot / .svg                 System Context view (Graphviz DOT, rendered to SVG)
    containers.dot / .svg            Container view
    backendComponents.dot / .svg     Backend Component view
    frontendComponents.dot / .svg    Frontend Component view
    deployment.dot / .svg            Deployment view
  site/                 the interactive site `likec4 build` produces — gitignored, ungated, rebuilt
                         every `arch-export`; published to GitHub Pages, never committed
```

`generated/` is cleared before codegen, which writes files and never prunes them: an artifact left
behind by a deleted view is byte-identical to what is committed, so the staleness diff cannot see one
unless the export removes it first. The mirror case — a view whose artifact was never committed — is
untracked rather than changed, so the diff is taken after `git add --intent-to-add` to reach it.
**Commit `model/`, `generated/` and `../ARCHITECTURE.md` in one change**; either half alone fails.

## Editing the model

1. `just arch-install` the first time (runs `npm ci` here, installing the locked `likec4`).
2. Edit `model/*.likec4`.
3. From the repo root, run `just arch-export` — this **validates** the model, **regenerates** every
   gated output (the artifacts in `generated/` *and* the diagrams spliced into
   [`../ARCHITECTURE.md`](../ARCHITECTURE.md)), and rebuilds `site/`, the full interactive site —
   gitignored, ungated, published to GitHub Pages by a separate workflow
   ([`../architecture-explorer.md`](../architecture-explorer.md)).
4. Commit `model/`, `generated/`, and `../ARCHITECTURE.md` together. Never `site/` — it is
   regenerated, never committed.

`just arch-dev` opens LikeC4's live preview (a local dev server, needs a browser, and reads `model/`
directly rather than `arch-export`'s output) — handy while authoring, and the most current view there
is, but it is **not** a gate.

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
  commands, inlined rather than reached through `just`, which that job does not install; `check-arch`
  is part of `just verify`.

## Rendering (browser-free)

Diagrams are produced by `likec4 gen dot`, which emits DOT text — the graph structure plus every
element's description, technology and icon — rendered to SVG by the system **Graphviz** `dot`
binary. No headless browser anywhere in the pipeline: LikeC4's own image export (`export png`/`jpg`)
*does* need one (Playwright), and stays deliberately **not** part of any gate; rendering the DOT text
with Graphviz is a different, browser-free path
([ADR 0003 rev 4](../decisions/0003-architecture-as-code-likec4.md)).
[`../../scripts/render-arch-svg.py`](../../scripts/render-arch-svg.py) strips two non-deterministic
byte sources before an artifact is committed or compared, confirmed empirically (#115): the version
comment Graphviz embeds in its SVG output, and `likec4_id` — LikeC4's own internal relationship id,
stripped from the `.dot` file itself since `check-arch` diffs it too, which is not stable across
processes (the same instability `likec4 export json`'s ids already carry) even though the model has
not changed.

**CI's Graphviz is the reference version — a contributor's local one need not match it.**
[`checks.yml`](../../.github/workflows/checks.yml) and
[`pages.yml`](../../.github/workflows/pages.yml) each install Graphviz via the pinned
`ts-graphviz/setup-graphviz` action, which on the `ubuntu-latest` runner resolves to an exact apt
package version pinned in the workflow. Graphviz's layout is not guaranteed byte-identical (or even
pixel-identical) across versions or install channels — confirmed empirically: this repository's
committed SVGs, rendered by that pinned apt package, differ from the same `.dot` input rendered by a
newer Graphviz built a different way. A contributor whose own `dot` disagrees with the committed
output is not seeing a bug in `check-arch`; **CI's pinned version is authoritative**, and the fix is
to read the diff CI reports rather than trust a local `just check-arch` run against a different
Graphviz.

No JSON model snapshot is committed either: `likec4 export json` is read on
demand by [`../../scripts/check-arch-trace.py`](../../scripts/check-arch-trace.py), rather than from a
committed copy whose internal ids are not deterministic across machines. A second consumer follows
that shape, and validates the model first: `export json` exits zero on a model that does not parse
and emits a degraded document, so a consumer that skips validation reads a broken model as an empty
one.

[`../ARCHITECTURE.md`](../ARCHITECTURE.md) carries an inline Markdown image reference per diagram —
**generated, not hand-maintained**: the final step of `arch-export`
([`../../scripts/splice-arch-diagrams.py`](../../scripts/splice-arch-diagrams.py)) rewrites the
region between each `arch-export:begin/end <file>` marker pair to reference the named artifact in
`generated/`. Hand edits inside a marker region are overwritten on the next export and caught by the
staleness gate; the prose around the markers is yours to edit.

## What the model holds, and when an element earns a place

The model holds the System Context, Container and Component levels — `component` children nest inside
a container, and each container has a `view of` it in `views.likec4` — and, separately from all three,
a deployment model of the hosts that run them, the processes on those hosts and the files placed
beside them ([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). A
deployment node holds an `instanceOf` a container rather than a copy of it, so the two models name one
set of containers; a `deployment view` renders them.

**A relationship is declared once, at its true endpoints** ([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)).
Each view renders from that one set, aggregating an edge to the nearest ancestor it does not expand,
so an edge is never restated a level down.

**Two relationships sharing endpoints render as one edge labelled `[...]`, losing both labels** — a
merge in the computed view, so no codegen target escapes it. A view asks for them separately:

```
include frontend -> backend with {
  multiple true
}
```

A coarse view asks the same way, naming the ancestor it already draws rather than a nested element,
which would gain it a box: the Context level splits the operator's supplies with
`include operator -> wisekiosk with { multiple true }`. **No view here gives a relationship a `title`
of its own** — the `title` at the head of each view names the diagram and is a different thing. A
relationship title survives the relationships beneath it changing, and no gate compares them, while a
rendered label moves the generated artifact and the staleness gate reads the difference.

**Element and relationship bodies parse a tag only as their first entry**, before `technology`,
`icon` or `description`.

**An element earns a place where the system exchanges something with it, and an upstream once the
module that reads it has a need** ([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)).

**A component earns a place by its interface — what it exposes, and who calls it — and each container
holds only its framework half** ([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)).
A module's half of a container is the code a module author writes that runs there, and it arrives per
module as that module's need lands, on the same ground that defers an upstream.

**Source `link`s** wire the model to real code: once the package roots
[ADR 0021 rev 3](../decisions/0021-repository-layout.md) fixes hold source, a `link` property
on a container or component points at the source implementing it. This is how the model stops being a
drawing and starts pointing at the code it describes, and it is checked at review
([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist, architecture links).

## Traceability: architecture → requirements

A LikeC4 **tag** carries the Doorstop id of the requirement obliging the element or relationship it
sits on — that tag *is* the architecture → requirements link, and the tier follows the level
([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). At the Context level
it is `SYS`, bound where the obligation is observable at that level: on the relationships, not on the
system box, which owes every `SYS` item and so distinguishes none of them. The Container, Component
and Deployment levels answer to `SRS`, and anything at a level also carries the coarser item it
discharges observably there — an item sitting on the component it obliges, and staying on the
container where it obliges the container.

**A tag is applied where an accepted item obliges the thing it sits on** — so an element or edge no
accepted item obliges carries none, and one carrying coupled obligations carries all of them. What is
barred is stamping an element with everything it owes, which distinguishes nothing. An item obliging
every exchange an element has goes on the element rather than one of its edges.

**Every accepted, active `SYS` or `SRS` item binds somewhere, and a subject the model does not draw is
a level to add rather than an absence to accept**
([ADR 0019 rev 8](../decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). There is no exemption
record, and **an obligation reaching something *permanently* outside the model is not a way out of
this**: that record admits the case, the tree holds no item of that shape, and a fresh one is the
premise that reopens the binding rule — argued as a decision, never left standing as an untagged
item. The same holds for a subject not drawn yet: that is the level to add.

The `TST` tier is outside the rule, a verification item saying how an obligation is settled rather
than what the software owes — so a `TST` identifier is not a tag in this model, and one applied would
resolve against the tree while naming nothing the element owes.

**`just check-arch-trace` resolves the two against each other in both directions** — every tag to an
accepted item, and every accepted, active obliging item to a tag. What each direction asserts, and
what it leaves to review, is [`../CI.md`](../CI.md) § Documentation integrity's.
