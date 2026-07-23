"""Sphinx configuration for the WiseKiosk documentation site (ADR 0004).

srcdir is docs/, confdir is docs/site/ (see docs/site/README.md).
"""

from __future__ import annotations

project = "WiseKiosk"

extensions = [
    "myst_parser",
    "sphinx_needs",
    "sphinxcontrib.mermaid",
]

source_suffix = {
    ".md": "markdown",
}

# Relative to srcdir (docs/) — the one toctree shim the canonical sources
# never carry.
root_doc = "site/index"

exclude_patterns = [
    "architecture/node_modules",
    "architecture/model",
    "requirements/.venv",
    "requirements/_published",
    "site/.venv",
    "site/_build",
]

# ```mermaid fences (ARCHITECTURE.md) are plain code blocks under MyST unless
# told to invoke sphinxcontrib-mermaid's directive instead.
myst_fence_as_directive = ["mermaid"]

# The canonical docs use GitHub-style "## " anchor links MyST doesn't
# generate by default (e.g. FOUNDATIONS.md's #6-module-contract); depth 2
# covers every such link.
myst_heading_anchors = 2

# --- sphinx-needs -----------------------------------------------------------
# One type per Doorstop document; prefix is blank because every need gets an
# explicit :id: from the transform (sphinx-needs only uses `prefix` when
# auto-generating an id).
needs_types = [
    {"directive": "sys", "title": "System need", "prefix": "", "color": "#BFD8D2", "style": "node"},
    {"directive": "srs", "title": "Software requirement", "prefix": "", "color": "#FEDCD2", "style": "node"},
    {"directive": "tst", "title": "Verification item", "prefix": "", "color": "#DCB239", "style": "node"},
]

# Matches Doorstop's PREFIX+digits ids explicitly rather than relying on
# sphinx-needs' default.
needs_id_regex = "^[A-Z]+[0-9]+$"

# A handful of canonical links point at a directory with no document to
# resolve to (Doorstop's sys/srs/tst dirs, the LikeC4 codegen output dir).
# Unfixable without editing those files; the underlying invariant is already
# covered by the more precise check-links gate, so this category is
# suppressed rather than a second, redundant source of truth.
suppress_warnings = ["myst.xref_missing"]

# furo has no "always expanded" nav option, but each section with children
# gets its own always-visible caret, independently clickable from the link
# text (no need to navigate into a section first). Search uses Sphinx's
# stock search.js/searchtools.js, so it always matches the installed Sphinx.
html_theme = "furo"

# Maps sphinx-needs' static light palette onto furo's mode-switching theme
# variables (see _static/needs-furo.css).
html_static_path = ["_static"]
html_css_files = ["needs-furo.css"]


def _nest_adrs_under_readme(app, docname, source):
    """Append a hidden glob toctree to decisions/README at read time, nesting
    the ADR pages under it in the nav. In-memory only — the canonical file
    stays byte-identical; this is the toctree shim, kept in the silo."""
    if docname == "decisions/README":
        source[0] += "\n\n```{toctree}\n:hidden:\n:glob:\n\n[0-9]*\nTEMPLATE\n```\n"


def setup(app):
    app.connect("source-read", _nest_adrs_under_readme)
