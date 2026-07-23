#!/bin/sh
# The first line of a commit message must be a Conventional Commit (ADR 0006);
# the pattern is defined once in scripts/conventional-commit.regex, shared with
# the commit-msg hook. Default mode mirrors the hook's fixup!/squash!/merge
# allowances — they never survive the squash merge. --pr-title drops them for
# the CI gate on the PR title, which becomes the commit on main.
#
# Dependencies: grep, head.
set -eu

fail() {
    echo "check-commit-msg: $1" >&2
    exit 1
}

pr_title=0
file=""
for arg in "$@"; do
    case "$arg" in
        --pr-title) pr_title=1 ;;
        *) file=$arg ;;
    esac
done
[ -n "$file" ] || fail "usage: check-commit-msg.sh [--pr-title] <message-file>"

pattern=$(dirname "$0")/conventional-commit.regex
first=$(head -n 1 "$file")

if [ "$pr_title" -eq 0 ]; then
    case "$first" in
        fixup!*|squash!*|"Merge "*)
            echo "Allowed (never reaches main): $first"
            exit 0 ;;
    esac
fi

if ! printf '%s' "$first" | grep -Eqf "$pattern"; then
    fail "'$first' is not a Conventional Commit — expected type(scope)?: subject (pattern: scripts/conventional-commit.regex)"
fi
echo "Conventional Commit: $first"
