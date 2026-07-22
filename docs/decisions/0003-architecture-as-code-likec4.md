# 0003 — Model the architecture as code with LikeC4

**Status:** accepted
**Decided:** 2026-07-22 (issue #15)

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
- **Rendered browser-free** — `likec4 codegen mermaid` emits Mermaid, which GitHub renders inline; the
  computed model is snapshotted with `likec4 export json`. Both use bundled WASM graphviz, so the
  whole pipeline runs in CI with no headless browser.
- **Staleness-gated** — `just check-arch` (and the `architecture` CI job, byte-identically)
  regenerates every generated output — the artifacts under `docs/architecture/` and the diagrams
  spliced into `ARCHITECTURE.md` — and runs `git diff --exit-code` on them, extending the "CI fails
  on stale generated code" rule to the architecture layer.

The model is authored so Component and Code levels — and source `link`s into `backend/`/`frontend/` —
can be **added later without restructuring** (LikeC4 nests elements additively). Those levels are not
built now: no application code exists, so building them would be abstraction without a consumer
(FOUNDATIONS §5).

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
- **PlantUML** — mature C4 support, but requires a Java runtime (native toolchain, against
  FOUNDATIONS §2) and validates syntax, not model integrity.

LikeC4 was the only option that is a *validated model*, pure-JS (siloable, no native toolchain), and
renderable browser-free.

## Consequences

- **First `package.json` in the repo.** This activates the dormant npm supply-chain gates noted in the
  [hardening backlog](../ARCHITECTURE.md#security--hardening-backlog). This ADR wires the Dependabot
  `npm` ecosystem now (pointed at `/docs/architecture`, siloed per FOUNDATIONS §2); the **`npm audit`
  CI gate is deliberately left unbuilt** as a now-unblocked backlog item, to keep this change tight.
- **Rendering is fully automated in CI** — because diagrams are codegen, not a browser export,
  `arch-export` runs on every push with no chromium. Image (PNG/SVG) export, which *does* need a
  headless browser, is intentionally kept out of the gate.
- **Model-vs-real-code drift is not auto-verified.** The staleness gate proves the *generated
  artifacts* match the *model*; it cannot prove the model matches the eventual code. That link is
  carried by the source `link`s added as code lands, and by review — not by a machine check.
- **Traceability hook is reserved, not bound.** Element tags are the mechanism for carrying Doorstop
  `SRS` ids (architecture → requirements). Today's SRS items are placeholder and will be replaced by
  the fresh requirements pass (issue #18), so no real ids are bound yet — see the `needs-srs` tag and
  TODO in the model.
