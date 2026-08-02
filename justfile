# WiseKiosk task runner. `just` lists recipes; recipes mirror what CI runs.

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
[doc('Branch is named type_number-snake_name, links an open type-labeled issue, and its PR records the ticket linkage')]
check-branch:
    sh scripts/check-branch.sh

[group('setup')]
[doc('Point git at the repo hooks (.githooks/): advisory commit-msg and pre-push')]
install-hooks:
    git config core.hooksPath .githooks

[group('checks')]
[doc('Requirements tree validates: refs resolve, no suspect/unreviewed/orphan items, methods consistent, no identifier cited in an item statement')]
check-reqs:
    docs/requirements/.venv/bin/python scripts/check-unreviewed.py
    docs/requirements/.venv/bin/python scripts/check-suspect-links.py
    sh scripts/validate-tree.sh
    docs/requirements/.venv/bin/python scripts/check-method-consistency.py
    docs/requirements/.venv/bin/python scripts/check-text-citations.py

[group('checks')]
[doc('The decisions directory and its index table agree: every ADR has a row, every row a file, numbering contiguous')]
check-adr-index:
    node scripts/check-adr-index.mjs

[group('checks')]
[doc('No manifest at the repository root, and every Dependabot entry resolves to a non-root directory holding its manifest')]
check-repo-silo:
    node scripts/check-repo-silo.mjs

[group('checks')]
[doc('Every `just verify` check also runs in CI, and vice versa')]
check-verify-ci-parity:
    node scripts/check-verify-ci-parity.mjs

[group('docs')]
[doc('First-time setup: install the pinned Sphinx toolchain into docs/site/')]
site-install:
    python3 -m venv docs/site/.venv
    docs/site/.venv/bin/pip install -r docs/site/requirements-dev.txt

# CI inlines these two commands byte-for-byte.
[group('docs')]
[doc('Regenerate the needs pages from Doorstop and build the docs site (warnings-as-errors)')]
site-build:
    docs/site/.venv/bin/python docs/site/doorstop_to_needs.py
    docs/site/.venv/bin/sphinx-build -W -b html -c docs/site docs docs/site/_build/html

[group('checks')]
[doc('Docs site builds clean with warnings-as-errors')]
check-site:
    just site-build

[group('docs')]
[doc('First-time setup: install the pinned LikeC4 toolchain into docs/architecture/')]
arch-install:
    npm --prefix docs/architecture ci

# `validate` runs first: `codegen` alone does not fail on a broken model.
[group('docs')]
[doc('Validate the architecture model and regenerate its browser-free artifacts')]
arch-export:
    docs/architecture/node_modules/.bin/likec4 validate docs/architecture/model
    docs/architecture/node_modules/.bin/likec4 codegen mermaid docs/architecture/model -o docs/architecture/generated
    node scripts/splice-arch-diagrams.mjs

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
verify: check-links check-eol check-branch check-reqs check-arch check-site check-adr-index check-repo-silo check-verify-ci-parity
