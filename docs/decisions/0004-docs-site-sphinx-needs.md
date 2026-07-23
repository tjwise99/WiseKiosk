# 0004 — Build the documentation site with Sphinx, MyST, and sphinx-needs

**Status:** accepted
**Decided:** 2026-07-22 (issue #21)

## Context

The only rendered view of this repo's documentation is Doorstop's `just reqs-publish` HTML —
unusable for its central job: navigating the SYS→SRS→TST traceability chains. Everything else
([`FOUNDATIONS.md`](../FOUNDATIONS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`TESTING.md`](../TESTING.md), the ADRs, the [LikeC4 model](../architecture/README.md)) is read by
browsing raw files on GitHub, which is a poor primary reading surface. Application code is coming;
the docs deserve a real home: one static site generated from `docs/`, built in CI, deployed to
GitHub Pages.

Constraints the discussion under issue #21 made hard:

- **The driving requirement is traceability visualization.** Click-through requirement chains
  (parent→child→test), matrices, and link graphs at a level above single items. Fixing the chrome
  around Doorstop's flat dumps does not fix this.
- **One toolchain.** A prose generator plus a separate requirements renderer is two toolchains to
  maintain; rejected outright.
- **No frontmatter, anywhere, ever.** The repo's Markdown and YAML are read first-class by AI
  tooling and humans; sources stay byte-identical GFM. Anything a site needs beyond the sources
  lives in its own files elsewhere in the repo — never embedded metadata.
- **Siloed toolchain** (FOUNDATIONS §2): own directory, exact-pinned, local venv — the
  [`docs/requirements/`](../requirements/README.md) pattern.
- The site is a *generated view*: the repo stays self-contained (SYS012) and loses nothing if
  Pages disappears; no document may reference the published site.

## Decision

Adopt **Sphinx** with **MyST** (Markdown parsing) and **sphinx-needs** (requirements objects) as
the single documentation toolchain.

- **sphinx-needs carries the problem child.** Requirements become typed need objects with
  incoming/outgoing links rendered on every item, filterable `needtable`s, generated traceability
  matrices, and `needflow` link graphs — the higher-level visualization that is the end goal.
  This machinery is mature, maintained, and purpose-built for exactly the SYS→SRS→TST shape; on
  every alternative it would be bespoke code owned here forever.
- **Doorstop stays canonical.** This does **not** supersede
  [ADR 0002](0002-requirements-management-doorstop.md): the YAML items under
  `docs/requirements/` remain the requirements source and `doorstop --error-all` remains the gate.
  A **thin, presentation-free transform** generates need objects from the YAML at build time
  (generated, gitignored — never hand-authored); only Doorstop's HTML render is retired.
- **Prose sources are rendered unchanged.** MyST parses the existing GFM files as they are — no
  frontmatter (MyST requires none), no conversion, no in-source directives. The one structural
  concession Sphinx demands, the root `toctree`, is confined to the site silo's shim files; it
  never touches a canonical document.
- **Siloed and pinned.** The toolchain lives in `docs/site/` with an exact-pinned requirements
  file and a local venv; Dependabot's `pip` ecosystem points at it. Theme selection (e.g.
  `sphinx-immaterial`) is an implementation choice inside the silo, not part of this decision.
- **Built identically local and CI.** A `just` recipe builds the site with warnings-as-errors;
  CI runs the same recipe. Pages deployment is a **separate workflow** from `checks.yml`, holding
  `pages: write` + `id-token: write` via OIDC — elevated *permissions*, still **no stored
  credentials**, so the secret-free-CI stance holds.
- **Diagrams are not load-bearing in this choice.** The Mermaid splice
  ([ADR 0003](0003-architecture-as-code-likec4.md)) keeps serving GitHub; how LikeC4 output enters
  the site (rendered Mermaid, SVG export, or LikeC4's interactive build) is decided at
  implementation and forecloses nothing here.

## Alternatives considered

- **MkDocs + Material** — the strongest rejection, and it wins the prose half: renders the GFM
  sources with zero dialect anywhere (nav lives entirely in `mkdocs.yml`), renders the same
  Mermaid fences GitHub does, best-in-class default theme and search. Rejected because it has
  nothing for the driving requirement: the traceability UI — tables, matrices, link graphs —
  would be hand-built and hand-maintained on top of it, which is the two-toolchain problem
  wearing a different hat.
- **Astro Starlight** — structurally requires per-page frontmatter (its content-collection schema
  demands it); the no-frontmatter constraint eliminates it outright, before its content-ownership
  friction is even weighed.
- **Docusaurus** — frontmatter is conventional rather than structural there, so it survives that
  constraint; rejected on the driving requirement instead: like MkDocs it has no traceability
  machinery, without MkDocs's zero-dialect prose story to compensate.
- **mdBook** — renders linear books, not multi-source trees; no requirements machinery and a thin
  plugin story.
- **Hybrid (MkDocs for prose + a sphinx-needs sub-site)** — the Pages artifact is just a
  directory, so this composes technically; rejected because it is two toolchains by definition.
- **Keep Doorstop HTML** — the baseline that prompted this. Covers only requirements, and its
  presentation is the named pain; improving it means owning HTML templates inside a requirements
  tool — effort at the wrong layer.

Sphinx was the only candidate where the traceability machinery — the actual problem — is
third-party, mature, and maintained, while every constraint (no frontmatter, GFM sources
unchanged, Python silo, single toolchain) is still met.

## Consequences

- **The traceability UI is bought, not built** — and its cost is a dependency: sphinx-needs'
  health matters now. It is commercially backed and industry-adopted (automotive/aero), which is
  the right side of that bet, but it is a bet.
- **Sphinx complexity is owned.** MyST configuration, toctree shims, and Sphinx's warning surface
  live in the silo. The shims are hand-maintained navigation — accepted as the confined cost of
  the toctree requirement.
- **A thin transform joins the build.** Doorstop YAML → need objects is generated glue with no
  presentation logic; it must stay that way. If it starts growing UI decisions, that is scope
  creep toward the bespoke renderer this ADR rejected. The traceability *display* pages —
  hand-authored `needtable`/`needflow`/matrix directives — are legitimate silo content, distinct
  from both the transform output and the toctree shims; hand-authoring them does not violate this
  boundary.
- **Second Python silo.** Another pinned requirements file, venv, and Dependabot `pip` entry.
- **First workflow with elevated permissions.** `checks.yml` stays read-only; the Pages workflow
  alone holds `write` scopes, kept separate so the verification pipeline's blast radius does not
  grow.
- **Deliberately unbuilt:** versioned docs, PDF export, custom theming beyond a stock theme —
  each is abstraction without a consumer today (FOUNDATIONS §5).
- **Premise that would reopen this:** if sphinx-needs is abandoned, or if the requirements tree
  is ever retired, Sphinx loses its decisive advantage and the trade reverts to MkDocs Material
  on prose ergonomics.
