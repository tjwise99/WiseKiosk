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
    docs/requirements/.venv/bin/doorstop --error-all --no-reformat
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
[doc('First-time setup: install the browser the render tier drives')]
render-install:
    frontend/node_modules/.bin/playwright install --with-deps chromium

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

# `go build` compiles the non-test tree alone, where `vet` and `test` compile the test files with it,
# so a compile error common to both is reported against the smaller of the two first. A step runs only
# where the one before it exited zero; what the four together assert is docs/CI.md § Backend build,
# vet and tests. The `-race` pass covers the concurrency-bearing packages under `internal/`; the
# bounded-footprint soak in `cmd` is run once without it, because the detector's own allocation
# perturbs the memory that soak measures.
[group('checks')]
[doc('The backend Go tree builds, passes vet, its package tests pass, and the internal packages are free of data races; needs `just boundary-install`')]
check-go:
    go -C backend build ./...
    go -C backend vet ./...
    go -C backend test ./...
    go -C backend test -race ./internal/...

[group('checks')]
[doc('Exactly one non-test reference in the backend unwraps the confined secret type to its raw value; test files are exempt')]
check-secret-unwrap:
    python3 scripts/check-secret-unwrap.py

[group('run')]
[doc('Serve the display page on a local dev server; the page fetches /config.json, which a deployment bind-mounts into the served tree and a local run reads from the gitignored frontend/public/config.json')]
dev:
    frontend/node_modules/.bin/vite frontend

# Depends on `check-build` so what is served is a bundle that exists and is current, rather than
# whatever a previous run left in `dist/`.
[group('run')]
[doc('Serve the built static bundle rather than the dev server — what a deployment ships, including the compiled configuration validator')]
preview: check-build
    frontend/node_modules/.bin/vite preview frontend

[group('checks')]
[doc('The frontend builds to a static single-page bundle; needs `just boundary-install`')]
check-build:
    frontend/node_modules/.bin/vite build frontend

# Depends on `check-build` rather than assuming an emitted tree: what it reads is what that build
# emitted, and `just` runs a dependency once per invocation, so `verify` does not build twice.
[group('checks')]
[doc('The frontend build emits a static single-page bundle: one HTML entry with an empty mount, no server half, no SSR target or adapter declared, and every npm package in the emitted module graph allowlisted')]
check-static-bundle: check-build
    python3 scripts/check-static-bundle.py

[group('checks')]
[doc('The frontend unit tier passes (Vitest); needs `just boundary-install`')]
check-unit:
    frontend/node_modules/.bin/vitest run --root frontend

[group('checks')]
[doc('The frontend render tier passes at each supported viewport (Playwright); needs `just boundary-install` and `just render-install`')]
check-render:
    frontend/node_modules/.bin/playwright test --config frontend/playwright.config.ts

[group('checks')]
[doc('Every committed test file is discovered by a configured runner, asked of each runner rather than restating its globs; needs `just boundary-install`')]
check-dead-test:
    python3 scripts/check-dead-test.py

# Outside `verify`, and invoked by a CI job of its own: this tier builds and runs the image, and
# docs/CI.md § Gate wiring is what decides where a check needing Docker sits.
[group('checks')]
[doc('The container image builds, runs non-root, serves the configuration a deployment mounts and nothing in its place, carries no deployment content, keeps two instances independent, and holds nothing secret-shaped in any layer; needs Docker')]
check-image:
    docker buildx build --load --tag wisekiosk:citest .
    python3 scripts/image/nonroot_uid.py wisekiosk:citest
    python3 scripts/image/config_bind_mount.py wisekiosk:citest
    python3 scripts/image/no_deployment_content.py wisekiosk:citest
    python3 scripts/image/two_instances.py wisekiosk:citest
    python3 scripts/image/layer_secret_scan.py wisekiosk:citest

[group('config')]
[doc('Regenerate the configuration-object TypeScript types from the configuration schema')]
config-codegen:
    frontend/node_modules/.bin/json2ts --input frontend/src/config/schema.json --output frontend/src/config/types.ts --additionalProperties false

# The same clear-regenerate-assert-diff shape as `check-boundary`, and for the same reasons: the
# generator is resolved before the committed output is deleted, absent output then reads as a
# deletion rather than as a stale file byte-identical to what is committed, and the non-empty
# assertion catches the emitted-but-empty case the diff does not.
[group('checks')]
[doc('The committed configuration types are what the configuration schema generates; needs `just boundary-install`')]
check-config-types:
    test -x frontend/node_modules/.bin/json2ts
    rm -f frontend/src/config/types.ts
    just config-codegen
    test -s frontend/src/config/types.ts
    git add --intent-to-add -- frontend/src/config/types.ts
    git diff --exit-code HEAD -- frontend/src/config/types.ts

[group('review')]
[doc('List every ADR citation this branch re-pinned without touching the sentence around it, per file and line (reports; not a gate)')]
rev-reach *ref:
    python3 scripts/adr-rev-reach.py {{ref}}

[group('checks')]
[doc('Every tracked file is a declared authored or derived kind; a legacy file is grandfathered by path, never its language')]
check-languages:
    python3 scripts/check-languages.py

[group('checks')]
[doc('Run every check the PR gate runs that has a local form and needs no Docker; secret scanning, the PR-title check (commitlint, via the hook layer), the link check (lychee, from a digest-pinned image) and the workflow audit (zizmor, actionlint) are CI-only, and the image tier is `just check-image`')]
verify: check-untracked check-hooks check-branch check-reqs check-citations check-arch check-arch-trace check-boundary check-go check-secret-unwrap check-config-types check-build check-static-bundle check-unit check-render check-site check-adr-index check-adr-revs check-docs-index check-repo-silo check-languages check-dead-test
