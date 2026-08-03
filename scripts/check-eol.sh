#!/bin/sh
# Every tracked text file is LF-only (.gitattributes). `git grep -l` exits 0 when it finds a match,
# which is this check's failure case, so the status is inverted below.
set -eu

if git grep -lIP '\r$' -- .; then
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        echo "::error::CRLF line endings found in the files above; the repo is LF-only (.gitattributes)."
    else
        echo "CRLF found in the files above; the repo is LF-only." >&2
    fi
    exit 1
fi

echo "No CRLF line endings."
