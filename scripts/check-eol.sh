#!/bin/sh
# Every tracked text file is LF-only (.gitattributes). `git grep -l` exits 0 when it finds a match —
# this check's failure case — 1 when it finds none, and anything else when the search itself failed.
# The three are distinguished: a failed search has judged nothing, and must not read as a clean tree.
set -eu

# `git grep` answers 1 both for "searched, found nothing" and for "there was nothing to search", so
# the population is established first: over no tracked file, a clean result asserts nothing.
if [ -z "$(git ls-files -- . | head -n 1)" ]; then
    echo "no tracked file to search; nothing here is asserted." >&2
    exit 1
fi

matches=$(git grep -lIP '\r$' -- .) && status=0 || status=$?

case "$status" in
0)
    printf '%s\n' "$matches"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        echo "::error::CRLF line endings found in the files above; the repo is LF-only (.gitattributes)."
    else
        echo "CRLF found in the files above; the repo is LF-only." >&2
    fi
    exit 1
    ;;
1)
    echo "No CRLF line endings."
    ;;
*)
    echo "git grep exited $status; no file was searched, so nothing here is asserted." >&2
    exit "$status"
    ;;
esac
