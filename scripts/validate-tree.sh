#!/bin/sh
# The requirements tree validates, with one exception: a TST tier in which every item is pending.
#
# Doorstop's Document.items is active-only, so a document whose items are all `active: false` yields
# "no items" and returns before every other check on it — and --error-all makes that fatal. Every TST
# item is pending until the code it checks exists, so the tier cannot validate until the first test
# lands (#78 retires this).
#
# The exception fails when it stops being needed: no such error means the tier has an active item,
# and this wrapper is then dead code rather than a passing gate.
#
# What this has been run against, in both directions: cases/the-requirements-tree-checks.md
set -eu

DOORSTOP=docs/requirements/.venv/bin/doorstop
PENDING_TIER='ERROR: TST: no items'

# Every branch below reads Doorstop's output. Absent an interpreter there is none, and the
# tier diagnostic is what the last branch prints over that silence.
if [ ! -x "$DOORSTOP" ]; then
    echo "$DOORSTOP is missing or not executable — this check read no tree." >&2
    echo "Create the venv from docs/requirements/requirements-dev.txt." >&2
    exit 1
fi

if out=$("$DOORSTOP" --error-all --no-reformat 2>&1); then
    validated=yes
else
    validated=no
fi
printf '%s\n' "$out"

others=$(printf '%s\n' "$out" | grep '^ERROR:' | grep -vxF "$PENDING_TIER" || true)
if [ -n "$others" ]; then
    exit 1
fi

if [ "$validated" = yes ] || ! printf '%s\n' "$out" | grep -qxF "$PENDING_TIER"; then
    echo "The TST tier has an active item, so the pending-tier exception is dead — delete this" >&2
    echo "wrapper, restore the bare doorstop command in the recipe and CI, and close #78." >&2
    exit 1
fi

echo "Tree validates, with the pending-TST-tier exception #78 retires."
