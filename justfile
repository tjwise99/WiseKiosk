# WiseKiosk task runner. `just` lists recipes; the check recipes are what CI runs.

# Show available recipes.
default:
    @just --list

[group('checks')]
[doc('No untracked, non-ignored file in the tree — the git ls-files-based gates cannot see one, so it must be tracked or gitignored before a local run means anything')]
check-untracked:
    python3 scripts/check-untracked.py

[group('setup')]
[doc('First-time setup: install the pinned pre-commit toolchain into scripts/')]
hooks-install:
    python3 -m venv scripts/.venv
    scripts/.venv/bin/pip install -r scripts/requirements-dev.txt

[group('checks')]
[doc('Every pre-commit-stage hook in .pre-commit-config.yaml passes over every tracked file: no private key, no oversized file, YAML and JSON parse, no merge-conflict marker mid-merge, no mixed line endings, no CRLF in the tracked tree; the commitlint hooks run at their own stages, not here')]
check-hooks:
    scripts/.venv/bin/pre-commit run --all-files

[group('checks')]
[doc('Branch is named type_number-snake_name; its issue is open, type-labeled, milestoned, and parented to match the PR base; the PR records the linkage')]
check-branch *ref:
    python3 scripts/check-branch.py {{ref}}

[group('checks')]
[doc('Requirements tree validates: refs resolve, no suspect/unreviewed/orphan items, methods consistent, headers non-empty and prefix-free, no identifier cited in an item statement; the proposed backlog prints on a passing run (reports; not a gate)')]
check-reqs:
    docs/requirements/.venv/bin/python scripts/check-unreviewed.py
    docs/requirements/.venv/bin/python scripts/check-suspect-links.py
    sh scripts/validate-tree.sh
    docs/requirements/.venv/bin/python scripts/check-method-consistency.py
    docs/requirements/.venv/bin/python scripts/check-text-citations.py
    docs/requirements/.venv/bin/python scripts/check-headers.py
    docs/requirements/.venv/bin/python scripts/report-proposed.py

[group('checks')]
[doc('Every requirement identifier and ADR number cited outside .claude/ resolves, and every requirement citation carries its item header')]
check-citations:
    docs/requirements/.venv/bin/python scripts/check-citations.py

[group('checks')]
[doc('The decisions directory and its index table agree: every ADR has a row, every row a file, numbering contiguous')]
check-adr-index:
    python3 scripts/check-adr-index.py

[group('checks')]
[doc('Every ADR citation pins that ADR current rev, in prose and in a link title; the index rev column matches each ADR own head')]
check-adr-revs:
    python3 scripts/check-adr-revs.py

[group('checks')]
[doc('Every tracked document outside a top-level dot-directory is claimed by a row in the documentation index, every row links a tracked file, and no cell is empty')]
check-docs-index:
    python3 scripts/check-docs-index.py

[group('checks')]
[doc('No manifest or .venv/ at the repository root, no recipe is a shell script, github-actions is covered, and every other Dependabot entry resolves to a non-root directory holding its manifest')]
check-repo-silo:
    python3 scripts/check-repo-silo.py

[group('docs')]
[doc('First-time setup: install the pinned Sphinx toolchain into docs/site/')]
site-install:
    python3 -m venv docs/site/.venv
    docs/site/.venv/bin/pip install -r docs/site/requirements-dev.txt

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

# `validate` runs first: `codegen` alone does not fail on a broken model. `generated/` is cleared
# before codegen, which never prunes: an artifact left by a deleted view is byte-identical to what
# is committed, so the staleness diff below cannot otherwise see it.
[group('docs')]
[doc('Validate the architecture model and regenerate its browser-free artifacts')]
arch-export:
    docs/architecture/node_modules/.bin/likec4 validate docs/architecture/model
    rm -rf docs/architecture/generated
    docs/architecture/node_modules/.bin/likec4 codegen mermaid docs/architecture/model -o docs/architecture/generated
    python3 scripts/splice-arch-diagrams.py

# `add --intent-to-add` reaches regenerated artifacts that are untracked; the diff is taken against
# HEAD because that same `git add` stages the deletion `arch-export` makes of an orphan, which an
# index-relative diff then reads as agreement. Both are required and neither suffices alone.
[group('checks')]
[doc('Architecture model validates and its generated artifacts are neither stale, orphaned, nor uncommitted')]
check-arch:
    just arch-export
    git add --intent-to-add -- docs/architecture/
    git diff --exit-code HEAD -- docs/architecture/ docs/ARCHITECTURE.md

[group('checks')]
[doc('Every requirement identifier tagged in the architecture model resolves to an accepted item, and every accepted, active SYS or SRS item is tagged somewhere in the model')]
check-arch-trace:
    docs/requirements/.venv/bin/python scripts/check-arch-trace.py

[group('docs')]
[doc('Live-preview the architecture model in a local dev server (browser; not a gate)')]
arch-dev:
    docs/architecture/node_modules/.bin/likec4 start docs/architecture/model

[group('setup')]
[doc('First-time setup: install the pinned boundary code generators into the package roots they belong to')]
boundary-install:
    go -C backend mod download
    npm --prefix frontend ci

[group('boundary')]
[doc('Regenerate the Go and TypeScript boundary types from the one schema')]
codegen:
    cd backend && go tool oapi-codegen -config oapi-codegen.yaml ../boundary/openapi.yaml
    frontend/node_modules/.bin/openapi-typescript boundary/openapi.yaml -o frontend/src/lib/boundary/schema.ts

# Both generators are resolved before anything is deleted: the clear below removes committed source,
# so a toolchain that cannot run must fail with the tree intact rather than after emptying it. The
# Go check runs the tool the generate step runs, which is what makes it a resolution rather than a
# guess; `just boundary-install` is what a failure of either wants.
#
# The generated directories are then cleared before `codegen`, which overwrites but never creates
# what a generator did not emit: absent output reads as a deletion in the diff below, where a stale
# file left in place would be byte-identical to what is committed. The non-empty assertions are the
# other half — an emitted-but-empty file is a deletion the diff does see, and neither catches the
# case the other does. `add --intent-to-add` reaches regenerated output that is untracked, and the
# diff is against HEAD because that same `git add` stages the deletion a missing generator makes.
[group('checks')]
[doc('The committed boundary types are what the schema generates, and the generated Go compiles; needs `just boundary-install`')]
check-boundary:
    go -C backend tool oapi-codegen -version
    test -x frontend/node_modules/.bin/openapi-typescript
    rm -rf backend/internal/boundary frontend/src/lib/boundary
    just codegen
    test -s backend/internal/boundary/boundary.gen.go
    test -s frontend/src/lib/boundary/schema.ts
    cd backend && go build ./...
    git add --intent-to-add -- backend/internal/boundary/ frontend/src/lib/boundary/
    git diff --exit-code HEAD -- backend/internal/boundary/ frontend/src/lib/boundary/

[group('checks')]
[doc('The drift gate above can fail: each side seeded away from the schema in a temp copy of the tree, one language at a time, then regenerated (CI-only; not in verify)')]
check-boundary-selftest:
    python3 scripts/check-boundary-selftest.py

[group('review')]
[doc('List every ADR citation this branch re-pinned without touching the sentence around it, per file and line (reports; not a gate)')]
rev-reach *ref:
    python3 scripts/adr-rev-reach.py {{ref}}

[group('checks')]
[doc('Every tracked file is a declared authored or derived kind; a legacy file is grandfathered by path, never its language')]
check-languages:
    python3 scripts/check-languages.py

[group('checks')]
[doc('Run every check the PR gate runs that has a local form; secret scanning, the PR-title check (commitlint, via the hook layer), the link check (lychee, from a digest-pinned image) and the workflow audit (zizmor, actionlint) are CI-only')]
verify: check-untracked check-hooks check-branch check-reqs check-citations check-arch check-arch-trace check-boundary check-site check-adr-index check-adr-revs check-docs-index check-repo-silo check-languages
