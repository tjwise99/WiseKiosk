#!/usr/bin/env python3
"""An inactive item's parent cannot move beneath it unseen.

Doorstop flags a link suspect when the parent's fingerprint no longer matches the one stamped on the
child at review time. It skips inactive items entirely, and every `TST` item is inactive until the
code it checks exists — so the signal is dead across the whole verification tier.

This restores it for the items Doorstop skips, and only those: an active item's suspect links are
`doorstop --error-all`'s to report, and a link carrying no stamp at all is `check-unreviewed.py`'s.

The comparison is Doorstop's own `Stamp`, taken from the library rather than reimplemented, so
anything reported here is what `doorstop review` would rewrite. Nothing is written.
"""

import sys
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent


def suspect():
    """Every inactive item's link whose stamp no longer matches its parent's fingerprint."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))

    # Tree.find_item and Document.items skip inactive items — the blind spot this closes.
    by_uid = {}
    for document in tree.documents:
        for item in document._iter():
            by_uid[item.uid] = item

    found = []
    for item in by_uid.values():
        if item.active:
            continue
        for uid in item.links:
            if not uid.stamp:
                continue  # never stamped: check-unreviewed.py's, and it runs first
            if uid.stamp != by_uid[uid].stamp():
                found.append((item.uid, uid))
    return sorted(found, key=lambda pair: (str(pair[0]), str(pair[1])))


def main():
    found = suspect()

    if found:
        print(f"{len(found)} inactive item link(s) are suspect:", file=sys.stderr)
        for child, parent in found:
            print(f"  {child} -> {parent}", file=sys.stderr)
        print(
            "\nThe parent's text, rationale, verification method or justification changed after"
            "\nthis link was reviewed, and Doorstop cannot see it: the child is inactive. Re-read"
            "\nthe item against the parent it now has and run `doorstop review <uid>`.",
            file=sys.stderr,
        )
        return 1

    print("Every inactive item's links match the parents they were reviewed against.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
