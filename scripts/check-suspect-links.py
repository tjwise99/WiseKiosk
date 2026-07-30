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
    """Every inactive item's link whose stamp no longer matches its parent's fingerprint, and every
    link naming a parent the tree does not hold."""
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
    key = lambda pair: (str(pair[0]), str(pair[1]))
    return sorted(found, key=key), sorted(dangling, key=key)


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
    links, dangling = suspect(by_uid)
    changed = unreviewed_changes(by_uid)
    inactive = [item for item in by_uid.values() if not item.active]

    if dangling:
        print(f"{len(dangling)} inactive item link(s) name a parent the tree does not hold:", file=sys.stderr)
        for child, parent in dangling:
            print(f"  {child} -> {parent}", file=sys.stderr)

    if links:
        print(f"\n{len(links)} inactive item link(s) are suspect:", file=sys.stderr)
        for child, parent in links:
            print(f"  {child} -> {parent}", file=sys.stderr)
        print(
            "\nThe parent's fingerprint no longer matches the stamp this link carries: either the"
            "\nparent changed after the link was reviewed, or the link was pointed at a different"
            "\nparent. Doorstop cannot see it, because the child is inactive.",
            file=sys.stderr,
        )

    if changed:
        print(f"\n{len(changed)} inactive item(s) have unreviewed changes:", file=sys.stderr)
        for uid in changed:
            print(f"  {uid}", file=sys.stderr)
        print(
            "\nThe item's own statement, attributes or parent links changed after it was reviewed,"
            "\nand Doorstop cannot see it: the item is inactive.",
            file=sys.stderr,
        )

    if links or changed or dangling:
        print(
            "\nRe-read each item — against the parent it now has, if that is what moved — then"
            "\nre-stamp it. `doorstop review <uid>` cannot: `Tree.find_item` is active-only and"
            "\nanswers `no item with UID` for a pending item. See `docs/requirements/README.md"
            "\n§ Adding or changing requirements`.",
            file=sys.stderr,
        )
        return 1

    print(
        f"Every inactive item matches the stamp it was reviewed at, its parents included"
        f" ({len(inactive)} pending of {len(by_uid)})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
