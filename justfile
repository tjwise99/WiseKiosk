# WiseKiosk task runner. `just` lists recipes. Recipes mirror exactly what CI
# runs (see .github/workflows/checks.yml); build/lint/test recipes are added as
# the Go backend and Svelte frontend land.

# Show available recipes.
default:
    @just --list

[group('checks')]
[doc('Every relative Markdown link resolves inside the repo')]
check-links:
    node scripts/check-links.mjs

[group('checks')]
[doc('No tracked text file has CRLF line endings')]
check-eol:
    #!/usr/bin/env bash
    set -euo pipefail
    if git grep -lIP '\r$' -- .; then
        echo "CRLF found in the files above; the repo is LF-only." >&2
        exit 1
    fi
    echo "No CRLF line endings."

[group('checks')]
[doc('Requirements tree validates: refs resolve, no suspect/unreviewed/orphan items')]
check-reqs:
    docs/requirements/.venv/bin/doorstop --error-all

# First-time setup for the docs-site tooling, siloed under docs/site/
# (FOUNDATIONS §2), matching the docs/requirements/ pattern.
[group('docs')]
[doc('First-time setup: install the pinned Sphinx toolchain into docs/site/')]
site-install:
    python3 -m venv docs/site/.venv
    docs/site/.venv/bin/pip install -r docs/site/requirements-dev.txt

# Regenerate the sphinx-needs pages from the Doorstop tree, then build the
# site with warnings-as-errors. This is the SINGLE source of truth for what
# CI runs — the `docs-site` job in .github/workflows/checks.yml inlines it
# byte-for-byte. -W fails the build on any Sphinx warning (a broken
# cross-reference, an orphaned page) rather than shipping it silently.
# Assumes `just site-install` has run.
[group('docs')]
[doc('Regenerate the needs pages from Doorstop and build the docs site (warnings-as-errors)')]
site-build:
    docs/site/.venv/bin/python docs/site/doorstop_to_needs.py
    docs/site/.venv/bin/sphinx-build -W -b html -c docs/site docs docs/site/_build/html

[group('checks')]
[doc('Docs site builds clean with warnings-as-errors')]
check-site:
    just site-build

# First-time setup for the architecture tooling, siloed under docs/architecture/
# (FOUNDATIONS §2). The gate recipes below assume it has run, matching the
# Doorstop pattern (check-reqs assumes the venv exists; CI installs in its own step).
[group('docs')]
[doc('First-time setup: install the pinned LikeC4 toolchain into docs/architecture/')]
arch-install:
    npm --prefix docs/architecture ci

# Validate the architecture model and regenerate every generated artifact,
# including the diagrams spliced into docs/ARCHITECTURE.md. The three commands
# below are the SINGLE source of truth for what CI runs — the `architecture` job
# in .github/workflows/checks.yml inlines them byte-for-byte. `validate` is the
# real gate (codegen does NOT fail on model errors); it runs first so a broken
# model fails fast. Everything is browser-free: bundled WASM graphviz, no
# system `dot`, no chromium. (No model.json snapshot is committed: it has no
# consumer today, and its ids are not deterministic across machines — a future
# consumer regenerates it on demand with `likec4 export json`.)
[group('docs')]
[doc('Validate the architecture model and regenerate its browser-free artifacts')]
arch-export:
    docs/architecture/node_modules/.bin/likec4 validate docs/architecture/model
    docs/architecture/node_modules/.bin/likec4 codegen mermaid docs/architecture/model -o docs/architecture/generated
    node scripts/splice-arch-diagrams.mjs

# The architecture staleness gate: regenerate everything, then fail if any
# generated output — the artifacts under docs/architecture/ or the diagrams
# spliced into docs/ARCHITECTURE.md — drifted from the committed state. Mirrors
# the repo's "CI fails on stale generated code" rule for the architecture layer.
# Assumes `just arch-install` has run.
[group('checks')]
[doc('Architecture model validates and its generated artifacts are not stale')]
check-arch:
    just arch-export
    git diff --exit-code docs/architecture/ docs/ARCHITECTURE.md

[group('docs')]
[doc('Live-preview the architecture model in a local dev server (browser; not a gate)')]
arch-dev:
    docs/architecture/node_modules/.bin/likec4 start docs/architecture/model

[group('checks')]
[doc('Run every check the PR gate runs')]
verify: check-links check-eol check-reqs check-arch check-site
