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

[group('docs')]
[doc('Render the Doorstop traceability matrix to docs/requirements/_published (gitignored)')]
reqs-publish:
    docs/requirements/.venv/bin/doorstop publish all docs/requirements/_published

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
verify: check-links check-eol check-reqs check-arch
