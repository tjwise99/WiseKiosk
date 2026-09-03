# 0003 — Model the architecture as code with LikeC4

**Status:** accepted
**Decided:** 2026-07-22 (issue #15)
**Rev:** 2

## Revisions

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

## Consequences

- **First `package.json` in the repo.** This activates the dormant npm supply-chain gates
  ([`CI.md`](../CI.md)'s dependency-vulnerability scanning). This ADR wires the Dependabot `npm`
  ecosystem now (pointed at `/docs/architecture`, so the manifest and its ecosystem entry sit in the
  directory of the feature they serve, per `CI.md`'s repository-shape gate); the **`npm audit` CI
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
