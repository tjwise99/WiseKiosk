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
    .venv/bin/doorstop --error-all

[group('docs')]
[doc('Render the Doorstop traceability matrix to docs/requirements/_published (gitignored)')]
reqs-publish:
    .venv/bin/doorstop publish all docs/requirements/_published

[group('checks')]
[doc('Run every check the PR gate runs')]
verify: check-links check-eol check-reqs
