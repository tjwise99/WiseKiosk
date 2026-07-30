#!/usr/bin/env python3
"""The review fingerprint holds over inactive items, which Doorstop skips.

Doorstop reports two kinds of drift against a stamp: a link is **suspect** when the parent's
fingerprint no longer matches the one stamped on the child at review time, and an item has
**unreviewed changes** when its own content no longer matches its `reviewed` stamp. It skips inactive
items for both, and every `TST` item is inactive until the code it checks exists — so neither signal
exists across the whole verification tier.

This restores both for the items Doorstop skips, and only those: an active item's drift is
`doorstop --error-all`'s to report, and a link carrying no stamp at all is `check-unreviewed.py`'s.

`Item.review()` stamps `stamp(links=True)`, which hashes the sorted parent UIDs alongside the item's
own content, so a re-parented item fails here. Link stamps are not in that hash, so `doorstop clear`
after a parent edit does not disturb it. `_data["reviewed"]` is read directly because the
`Item.reviewed` property rewrites a `True` placeholder as a side effect.

The comparison is Doorstop's own `Stamp`, taken from the library rather than reimplemented, so
anything reported here is what `doorstop review` would rewrite. Nothing is written.
"""

import sys
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent


def items():
    """Every item in the tree by UID. Tree.find_item and Document.items skip inactive items — the
    blind spot this closes."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))
    return {item.uid: item for document in tree.documents for item in document._iter()}


def suspect(by_uid):
    """Every inactive item's link whose stamp no longer matches its parent's fingerprint."""
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


def unreviewed_changes(by_uid):
    """Every inactive item whose own content no longer matches the stamp it was reviewed at."""
    found = [
        item.uid
        for item in by_uid.values()
        if not item.active and str(item._data["reviewed"]) != str(item.stamp(links=True))
    ]
    return sorted(found, key=str)


def main():
    by_uid = items()
    links, changed = suspect(by_uid), unreviewed_changes(by_uid)

    if links:
        print(f"{len(links)} inactive item link(s) are suspect:", file=sys.stderr)
        for child, parent in links:
            print(f"  {child} -> {parent}", file=sys.stderr)
        print(
            "\nThe parent's text, rationale, verification method or justification changed after"
            "\nthis link was reviewed, and Doorstop cannot see it: the child is inactive. Re-read"
            "\nthe item against the parent it now has and run `doorstop review <uid>`.",
            file=sys.stderr,
        )

    if changed:
        print(f"\n{len(changed)} inactive item(s) have unreviewed changes:", file=sys.stderr)
        for uid in changed:
            print(f"  {uid}", file=sys.stderr)
        print(
            "\nThe item's own statement, attributes or parent links changed after it was reviewed,"
            "\nand Doorstop cannot see it: the item is inactive. Re-read it — against the parent it"
            "\nnow has, if that is what moved — and run `doorstop review <uid>`.",
            file=sys.stderr,
        )

    if links or changed:
        return 1

    print(
        f"Every inactive item matches the stamp it was reviewed at, links included"
        f" ({len(by_uid)} items in the tree)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
