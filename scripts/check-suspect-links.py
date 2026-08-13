#!/usr/bin/env python3
"""An inactive item's parent cannot move beneath it unseen.

Doorstop flags a link suspect when the parent's fingerprint no longer matches the one stamped on the
child at review time. It skips inactive items entirely, and every `TST` item is inactive until the
code it checks exists — so the signal is dead across the whole verification tier.

This restores it for the items Doorstop skips, and only those: an active item's suspect links are
`doorstop --error-all`'s to report, and a link carrying no stamp at all is `check-unreviewed.py`'s. A
link naming a parent no document holds is reported alongside, since resolving one is what makes the
comparison possible at all.

The comparison is Doorstop's own `Stamp`, taken from the library rather than reimplemented. Clearing
what it reports is not a CLI operation — `Tree.find_item` is active-only — so the remedy is the one
`docs/requirements/README.md § Adding or changing requirements` gives. Nothing is written.

What this has been run against, in both directions: cases/the-requirements-tree-checks.md
"""

import sys
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent


def suspect():
    """Every inactive item's link whose stamp no longer matches its parent's fingerprint, and every
    link naming a parent the tree does not hold."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))

    # Tree.find_item and Document.items skip inactive items — the blind spot this closes.
    by_uid = {}
    for document in tree.documents:
        for item in document._iter():
            by_uid[item.uid] = item

    found, dangling = [], []
    for item in by_uid.values():
        if item.active:
            continue
        for uid in item.links:
            parent = by_uid.get(uid)
            if parent is None:
                dangling.append((item.uid, uid))
                continue
            if not uid.stamp:
                continue  # never stamped: check-unreviewed.py's, and it runs first
            if uid.stamp != parent.stamp():
                found.append((item.uid, uid))
    return (
        sorted(found, key=lambda pair: (str(pair[0]), str(pair[1]))),
        sorted(dangling, key=lambda pair: (str(pair[0]), str(pair[1]))),
    )


def main():
    found, dangling = suspect()

    if dangling:
        print(
            f"{len(dangling)} inactive item link(s) name a parent the tree does not hold:",
            file=sys.stderr,
        )
        for child, parent in dangling:
            print(f"  {child} -> {parent}", file=sys.stderr)
        print(
            "\nPoint each at a parent some document holds, or delete the link.",
            file=sys.stderr,
        )

    if found:
        if dangling:
            print(file=sys.stderr)
        print(f"{len(found)} inactive item link(s) are suspect:", file=sys.stderr)
        for child, parent in found:
            print(f"  {child} -> {parent}", file=sys.stderr)
        print(
            "\nThe parent's fingerprint no longer matches the stamp this link carries: either the"
            "\nparent changed after the link was reviewed, or the link was pointed at a different"
            "\nparent. Doorstop cannot see it, because the child is inactive. Re-read the item"
            "\nagainst the parent it now has, then re-stamp it — which is not a CLI operation:"
            "\n`Tree.find_item` is active-only, so `doorstop review` and `doorstop clear` both"
            "\nanswer `no item with UID` for an inactive item. See `docs/requirements/README.md"
            "\n§ Adding or changing requirements`.",
            file=sys.stderr,
        )

    if found or dangling:
        return 1

    print("Every inactive item's links resolve and match the parents they were reviewed against.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
