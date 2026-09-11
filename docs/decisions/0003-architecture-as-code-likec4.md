# 0003 — Model the architecture as code with LikeC4

**Status:** accepted
**Decided:** 2026-07-22 (issue #15)
**Rev:** 5

## Revisions

- **rev 5** — 2026-09-10 — replaces rev 4's standalone published site with the interactive rendering
  embedded directly in the docs site: `likec4 codegen webcomponent`, not `likec4 build`, emits a single
  self-contained bundle, loaded by a `<likec4-view>` custom element on
  [`architecture/explorer.md`](../architecture/explorer.md) the same way
  [`api-explorer.md`](../api-explorer.md) already embeds Swagger UI — the embedded-companion shape
  [ADR 0029 rev 1](0029-api-explorer-swagger-ui.md) actually set, which rev 4 cited as precedent for a
  separately-published site without following. Nothing about the gated Mermaid diagrams, the
  staleness gate, or rev 4's rejected DOT/Graphviz alternative changes (#115 architecture model
  reader).
- **rev 4** — 2026-09-10 — #115 architecture model reader: publishes a second, ungated output
  alongside the gated Mermaid diagrams this record already produces — the full interactive site
  `likec4 build` generates, carrying every element's description, technology, icon, tag and
  per-element relationship, none of which the gated diagrams show. The gated diagrams themselves are
  untouched: still Mermaid, still `likec4 codegen mermaid`, still staleness-gated exactly as rev 3
  left them. `likec4 gen dot` piped through system Graphviz was prototyped as a richer replacement for
  the gated diagrams and rejected — real experience, recorded under Alternatives — on version-pin
  friction alone; nothing about that attempt survives into this rev.
  [ADR 0004 rev 2](0004-docs-site-sphinx-needs.md)'s deferred question ("how LikeC4 output enters the
  site") is answered here, by the interactive site's existence; ADR 0004 rev 2 itself is untouched,
  since which toolchain builds the docs site was never this rev's to decide. The Decision and Consequences
  sections gain the new output; the Context, the choice of LikeC4 itself, the gated diagrams'
  mechanism, and every rev-3-and-earlier rejected alternative are untouched (#115 architecture model
  reader).
- **rev 3** — 2026-09-04 — replaces the stale claim that this record wires a Dependabot `npm`
  ecosystem with a timeless statement of npm dependency tracking for `/docs/architecture`; what was
  chosen is unchanged, so the Decided date does not move (#223 renovate cutover).
- **rev 2** — 2026-08-09 — the deferral of the Component level is superseded by ADR 0019 rev 3, which
  builds it; the deferral of the Code level, and every other part of this record, stand
  (#124 merge the C4 ADRs).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

[`ARCHITECTURE.md`](../ARCHITECTURE.md) described the system in prose only — every structural section
was a stub and the repo had zero diagrams. Hand-drawn pictures rot: nothing checks that they still
match reality, and there is no second reviewer here to notice when they drift. The repo already leans
hard on one discipline — **one definition, many generated views, and CI fails on stale generated
code** (the boundary contract, the config schema). We wanted the architecture layer to inherit that
same discipline: a single checkable model that generates its own diagrams, versioned beside the code.

## Decision

Adopt **LikeC4** as architecture-as-code. The model lives in `.likec4` files under
[`docs/architecture/`](../architecture/README.md) and is the single source of truth for a C4 Context
and Container view. It is:

- **Validated** — `likec4 validate` exits non-zero on an undefined element, an unresolved
  relationship, or an invalid view. This is the property none of the alternatives offered.
- **Rendered browser-free** — `likec4 codegen mermaid` emits Mermaid, which GitHub renders inline,
  using bundled WASM graphviz, so the whole pipeline runs in CI with no headless browser. A committed
  `model.json` snapshot (`likec4 export json`) was tried and dropped: it had no consumer, and its
  internal relation ids are not deterministic across machines, so it could never pass the staleness
  gate — a future consumer regenerates it on demand instead.
- **Staleness-gated** — `just check-arch` (and the `architecture` CI job, byte-identically)
  regenerates every generated output — the artifacts under `docs/architecture/` and the diagrams
  spliced into `ARCHITECTURE.md` — and runs `git diff --exit-code` on them, extending the "CI fails
  on stale generated code" rule to the architecture layer.
- **Rendered a second way, ungated, and embedded in the docs site: a webcomponent bundle.**
  `likec4 codegen webcomponent` — the same model, read once by the one `arch-export` recipe that also
  produces the gated diagrams — emits a single self-contained `.js` bundle carrying every view, every
  element's description, technology, icon, tag and per-element relationship, plus the drill-in
  navigation between views; a merged edge in the gated Mermaid diagrams loses all but one label, and
  Mermaid drops descriptions, technology and icons entirely. The bundle is loaded by a `<likec4-view>`
  custom element on [`architecture/explorer.md`](../architecture/explorer.md), the docs site's own page
  for it — the embedded-companion shape [ADR 0029 rev 1](0029-api-explorer-swagger-ui.md) set for
  Swagger UI on [`api-explorer.md`](../api-explorer.md), rather than a second site published at its own
  subpath. It is **not** staleness-gated — a browser-shaped JavaScript bundle is exactly what this
  record's browser-free posture keeps out of a gate, so it is produced but never diffed. No new
  dependency: `likec4 codegen webcomponent` is the same LikeC4 npm package this record already adopts,
  and needs no headless browser — its own layout is bundled WASM, the same mechanism `codegen mermaid`
  already uses.

The model is authored so Component and Code levels — and source `link`s into `backend/`/`frontend/` —
can be **added later without restructuring** (LikeC4 nests elements additively). Neither is built
here: no application code exists, so building them would be an abstraction with a single
implementation and no second consumer ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review checklist,
question 8, *Generality*). That ground holds for the Code level and is answered for the Component
level, which [ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md) builds — superseding this
record in that part alone.

## Alternatives considered

- **D2 / Graphviz DOT** — text-to-diagram, but no *model*: they render whatever you write, including
  references to things that do not exist. No validation of undefined elements or dangling
  relationships, which was the whole point.
- **Mermaid by hand** — GitHub renders it natively (zero tooling), but it is a drawing, not a model:
  duplicated node ids, no compiler, nothing to fail CI on drift. We still *use* Mermaid — but as
  LikeC4's generated output, not the source of truth.
- **Structurizr** — a real C4 model with validation, but the good rendering path is the hosted/cloud
  workspace or a Java toolchain; the self-hosted DSL story is heavier and less siloable than a
  pure-JS npm dependency.
- **PlantUML** — mature C4 support, but requires a Java runtime — a native build toolchain, which
  the project's dependency-footprint discipline
  ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), review checklist item 7, *Dependencies*) admits
  only when nothing else will do — and validates syntax, not model integrity.

LikeC4 was the only option that is a *validated model*, pure-JS (siloable, no native toolchain), and
renderable browser-free.

**Rev 4's alternatives**, for how the richer view a reader needs reaches them (#115 architecture
model reader):

- **`likec4 gen dot` piped through system Graphviz, replacing Mermaid as the gated diagrams'
  rendering path.** Prototyped, not hypothetical: LikeC4's DOT codegen keeps every element's
  description and icon that Mermaid drops, rendered browser-free by the system `dot` binary — no
  headless browser, same posture as `codegen mermaid`. Rejected on version-pin friction, confirmed
  empirically rather than assumed: `ubuntu-latest`'s only apt-available Graphviz (`2.42.2`) and this
  project's own development host's Graphviz (`12.2.1`, from a different install channel) render
  genuinely different SVG layouts from identical input — different canvas dimensions and node
  positions, not a cosmetic version-comment difference — so a committed artifact and a fresh
  regeneration could disagree by construction, on either side. No well-maintained,
  version-pinnable Docker image offers an exact chosen Graphviz version either; closing that gap
  reliably would mean this repository owning and maintaining a Dockerfile for Graphviz alone. That
  complexity is disproportionate next to the interactive site, which already carries every one of
  Mermaid's dropped descriptions, plus tags and relationships neither Mermaid nor a DOT/Graphviz
  render would carry regardless.
- **`likec4 codegen plantuml`, as a richer static replacement for Mermaid.** Carries full
  descriptions, but PlantUML output renders inline on neither GitHub nor this project's docs site
  (both need a PlantUML server or a local Java toolchain to turn `.puml` text into a picture) — an
  extra rendering hop for no advantage over the interactive site below, which needs none and also
  carries tags and relationships PlantUML output would not.
- **Commit `likec4 export png` (or `jpg`).** LikeC4's own native image export needs a headless
  browser (Playwright) to rasterize, which this record already excludes from the gate. Putting it in
  `check-arch` would mean the staleness gate itself needs a browser — reversing this record's own
  posture, not extending it.
- **A *gated*, staleness-checked interactive site.** Same violation as the export-png route: `likec4
  build`'s output is a browser-rendered JavaScript application, and diffing it byte-for-byte would
  need a headless browser in the gate to prove it is current. Publishing it ungated, as this revision
  does, gets the richer view to a reader without putting a browser in `check-arch`.

## Consequences

- **First `package.json` in the repo.** This activates the dormant npm supply-chain gates
  ([`CI.md`](../CI.md)'s dependency-vulnerability scanning). This ADR wires npm dependency tracking
  for `/docs/architecture` (pointed at that directory, so the manifest and its tracking entry sit in
  the directory of the feature they serve, per `CI.md`'s repository-shape gate); the **`npm audit` CI
  gate is deliberately left unbuilt** as a now-unblocked backlog item, to keep this change tight.
- **Rendering is fully automated in CI** — because diagrams are codegen, not a browser export,
  `arch-export` runs on every push with no chromium. Image (PNG/SVG) export, which *does* need a
  headless browser, is intentionally kept out of the gate.
- **Model-vs-real-code drift is not auto-verified.** The staleness gate proves the *generated
  artifacts* match the *model*; it cannot prove the model matches the eventual code. That link is
  carried by the source `link`s added as code lands, and by review — not by a machine check.
- **Traceability hook is reserved, not bound.** Element tags are the mechanism for carrying Doorstop
  ids (architecture → requirements). The SRS items this was decided against were placeholder, pending
  the requirements pass in issue #18, so this decision bound none of them. Which tier an element's tag
  names, and the binding itself, are
  [ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md)'s.
- **A second output, the embedded webcomponent bundle, exists and is public, but is unverified by any
  gate.** `likec4 codegen webcomponent`'s correctness — that it reflects the current model at all —
  rests on nothing but the fact that it is produced by the same `arch-export` recipe run that
  regenerates the gated diagrams, reading the model once; there is no staleness check on it, by
  design, and none is added. A broken or stale rendering is a silent failure mode this revision
  accepts in exchange for not putting a browser in `check-arch`.
- **[ADR 0004 rev 2](0004-docs-site-sphinx-needs.md)'s deferred question is answered here, and only
  here.** That record states plainly that "how LikeC4 output enters the site (rendered Mermaid, SVG
  export, or LikeC4's interactive build) is decided at implementation and forecloses nothing here" —
  this revision is that implementation decision, and the answer is: unchanged Mermaid for the site's
  spliced diagrams, plus the full interactive rendering embedded directly in the site as a
  webcomponent bundle. ADR 0004 rev 2 itself is left untouched — which toolchain builds the docs site
  was never this record's to decide, and nothing in ADR 0004 rev 2's own text becomes false by this
  choice.
- **No separate implementation ticket was filed for issue #115.** This ADR rev and the CI and Pages
  workflow changes it needs land in the one pull request that closes #115 — the ADR is not merged
  ahead of code that implements it.
- **This is a rev of an existing ADR, not a new numbered one — a departure from issue #115's own
  template checklist**, which assumes a new numbered ADR ("ADR merged: numbered per
  `docs/decisions/TEMPLATE.md`"). The owner's standing convention is that a decision within an
  existing ADR's scope is revised, not re-numbered — minting a fresh ADR number for "how does LikeC4
  output reach a reader" would fork one decision (architecture-as-code, and everything downstream of
  choosing LikeC4) across two documents for no reader's benefit, when this revision adds exactly one
  new output alongside what this record already owns.
