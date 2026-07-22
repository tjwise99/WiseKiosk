# 0004 — Generate the documentation site with MkDocs Material, deployed to GitHub Pages

**Status:** accepted
**Decided:** 2026-07-22 (issue #21)

## Context

The only rendered view of this repo's documentation is Doorstop's `just reqs-publish` HTML — poor
templates, gitignored, published nowhere, and covering only the requirements tree. Everything else
([`FOUNDATIONS.md`](../FOUNDATIONS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`TESTING.md`](../TESTING.md), the ADRs, the [LikeC4 diagrams](../architecture/README.md)) is read
raw on GitHub. The docs deserve one coherent rendered view: a static site generated from `docs/`,
built in CI, deployed to GitHub Pages.

Two standing rules shape the choice. **Docs are standalone and canonical in-repo** (SYS001): the
Markdown under `docs/` must stay plain GFM, readable on GitHub, with no site-generator dialect or
directives leaking into it — the site is a *generated view* of the docs, never the docs themselves.
And **toolchains are siloed** (FOUNDATIONS §2): whatever builds the site gets its own directory,
exact-pinned, installed into a local environment — the pattern set by
[`docs/requirements/`](../requirements/README.md) (Python venv) and
[`docs/architecture/`](../architecture/README.md) (npm).

## Decision

Adopt **MkDocs with the Material theme** as the documentation site generator.

- **Sources are the existing files, unchanged.** MkDocs renders plain Markdown; navigation lives in
  `mkdocs.yml`, not in the pages. Nothing under `docs/` needs converting, and GitHub remains a
  first-class reader of the canonical files.
- **The spliced Mermaid renders as-is.** Material renders ` ```mermaid ` fences natively (via
  `pymdownx.superfences`) — the same fences GitHub renders. The staleness-gated splice into
  `ARCHITECTURE.md` ([ADR 0003](0003-architecture-as-code-likec4.md)) therefore serves both views
  from one generated source; the site adds no second copy of any diagram.
- **Doorstop feeds the site as Markdown.** `doorstop publish -m` emits Markdown whose `{#SYS001}`
  anchors are exactly Python-Markdown `attr_list` syntax, so requirement deep-links work natively.
  The requirements pages are generated at build time (gitignored, like `_published/`), replacing the
  Doorstop HTML as the human-facing render. Doorstop itself stays: this does **not** supersede
  [ADR 0002](0002-requirements-management-doorstop.md) — only its HTML output is retired.
- **Siloed and pinned.** The toolchain lives in its own directory with an exact-pinned requirements
  file and a local venv, mirroring `docs/requirements/`; Dependabot's `pip` ecosystem points at it.
- **Built identically local and CI.** A `just` recipe builds the site (strict mode, so broken links
  fail the build); CI runs the same recipe. Deployment to Pages is a **separate workflow** from
  `checks.yml`, holding `pages: write` + `id-token: write` via OIDC — elevated *permissions*, but
  still **no stored credentials**, so the secret-free-CI stance holds.

The site is a convenience view. No document in `docs/` may reference the published site — the repo
stays self-contained (SYS001) and loses nothing if Pages disappears.

## Alternatives considered

- **Sphinx + MyST** — the known heavyweight option, and it would work. Rejected because everything it
  adds over MkDocs serves needs this repo doesn't have: its strengths are API autodoc,
  cross-reference domains, and intersphinx — application-code documentation machinery with no
  consumer here (FOUNDATIONS §5). Meanwhile the basics cost more: content discovery wants `toctree`
  directives (in-source dialect, or shim index files), MyST is CommonMark-plus-extensions rather than
  GFM, and Mermaid fences need `sphinxcontrib-mermaid` plus fence-to-directive mapping to render at
  all. More machinery for a worse fit with "sources stay plain GFM".
- **Astro Starlight / Docusaurus** — would reuse the Node silo precedent, but both ecosystems pull
  content toward MDX and their own frontmatter/routing conventions, and both want to own the content
  directory. Feeding them an existing plain-Markdown tree that must stay GitHub-canonical is
  swimming upstream.
- **mdBook** — pleasantly small, but no native Mermaid (a separate preprocessor binary), no
  `attr_list` support for Doorstop's anchors, and a thin plugin story. It renders books, not
  multi-source documentation trees.
- **Keep Doorstop HTML** — the baseline that prompted this ADR. Covers only requirements, templates
  are poor, output is published nowhere, and improving it means owning HTML templates inside a
  requirements tool — effort invested in the wrong layer.

MkDocs Material was the only candidate that renders the existing files unchanged, renders the same
Mermaid fences GitHub does, and consumes Doorstop's Markdown output natively — while matching the
established Python-silo pattern.

## Consequences

- **Second Python silo.** Another pinned requirements file and venv, and a Dependabot `pip` entry
  pointed at it — the update log grows accordingly.
- **First workflow with elevated permissions.** `checks.yml` stays read-only; the Pages workflow is
  the first to hold `write` scopes. Kept separate precisely so the blast radius of the verification
  pipeline does not grow.
- **Strict-mode builds double as a link gate.** `mkdocs build --strict` fails on broken internal
  links, complementing `just check-links` for the rendered view.
- **Deliberately unbuilt:** versioned docs (`mike`), custom theming beyond Material defaults, and PDF
  export — each is abstraction without a consumer today (FOUNDATIONS §5).
- **Premise that would reopen this:** if application-code API documentation (Go/TS autodoc) ever
  needs to live in the same site, Sphinx's autodoc machinery becomes a consumer with a real need —
  re-run this trade before bolting generators onto MkDocs.
