"""Sphinx configuration for the WiseKiosk documentation site (ADR 0004).

Lives in the docs/site/ silo, siloed from the canonical prose it renders.
srcdir is docs/ (passed on the command line as the sourcedir positional
argument); this file only ever lives alongside the build tooling, never mixed
into the sources it reads. See docs/site/README.md for how to build it.
"""

from __future__ import annotations

project = "WiseKiosk"
# No copyright/author boilerplate: this is a generated view of the repo's own
# docs, not a separately authored publication.

extensions = [
    "myst_parser",
    "sphinx_needs",
    "sphinxcontrib.mermaid",
    # Listed explicitly (not just set as html_theme below): sphinx-immaterial's
    # own config-inited handler — which merges its default theme options —
    # must be registered before Sphinx fires config-inited, which only
    # happens if the extension loads eagerly here rather than lazily when the
    # theme is looked up during builder init.
    "sphinx_immaterial",
]

source_suffix = {
    ".md": "markdown",
}

# docs/site/index.md, relative to srcdir (docs/) — the one toctree shim the
# canonical sources never carry (ADR 0004).
root_doc = "site/index"

# Directories under docs/ that are not part of the rendered site: dev-tool
# siloes' own installs/venvs/build output, and the site's own build output.
exclude_patterns = [
    "architecture/node_modules",
    "architecture/model",
    "requirements/.venv",
    "requirements/_published",
    "site/.venv",
    "site/_build",
    # Documents its own tooling for a human reading the repo, not the rendered
    # site's content — excluded rather than added to the root toctree.
    "site/README.md",
]

# A plain ```mermaid fence (as used in ARCHITECTURE.md's spliced diagrams,
# ADR 0003) is normally just a highlighted code block under MyST; this makes
# it invoke sphinxcontrib-mermaid's directive instead, so the diagrams render.
myst_fence_as_directive = ["mermaid"]

# The canonical docs link to their own (and each other's) "## " headings by
# GitHub-style anchor (e.g. FOUNDATIONS.md's `#6-module-contract`,
# TESTING.md's `#review-cadence`, ARCHITECTURE.md's
# `#security--hardening-backlog`). MyST does not generate heading anchors by
# default; depth 2 is the deepest level any of those links target.
myst_heading_anchors = 2

# --- sphinx-needs -----------------------------------------------------------
# One type per Doorstop document (ADR 0002); prefix is left blank because
# every need is given an explicit :id: by the transform
# (docs/site/doorstop_to_needs.py) — sphinx-needs only consults `prefix` when
# auto-generating an id, which never happens here.
needs_types = [
    {"directive": "sys", "title": "System need", "prefix": "", "color": "#BFD8D2", "style": "node"},
    {"directive": "srs", "title": "Software requirement", "prefix": "", "color": "#FEDCD2", "style": "node"},
    {"directive": "tst", "title": "Verification item", "prefix": "", "color": "#DCB239", "style": "node"},
]

# Doorstop ids are PREFIX + zero-padded digits (e.g. SYS001). sphinx-needs'
# default id_regex happens to accept this shape too, but it is pinned
# explicitly here so a future sphinx-needs default change can't silently
# start rejecting Doorstop's id format.
needs_id_regex = "^[A-Z]+[0-9]+$"

# A handful of canonical, byte-identical relative links point at a directory
# rather than a document — Doorstop's document dirs
# (docs/requirements/README.md: `sys/`, `srs/`, `tst/`) and the LikeC4
# codegen output dir (docs/ARCHITECTURE.md: `architecture/generated/`). MyST
# treats every relative link as a doc cross-reference by default and these
# have no `.md` to resolve to, so they warn `myst.xref_missing`. They cannot
# be fixed without editing those canonical files (forbidden — ADR 0004), and
# the underlying "does this link resolve inside the repo" invariant is
# already the more precise, machine-checked SYS001/SRS001/TST001 gate
# (`just check-links`) — this build-time xref check is redundant with it, not
# a second source of truth, so suppressing the category costs nothing that
# gate doesn't already cover.
suppress_warnings = ["myst.xref_missing"]

html_theme = "sphinx_immaterial"
html_theme_options = {
    # Disables the theme's default Google Fonts download: this build should
    # not depend on network access to an external font CDN. Falls back to the
    # system font stack.
    "font": False,
}
