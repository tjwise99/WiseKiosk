#!/usr/bin/env python3
"""No item's `text` cites another item by identifier.

A requirement must be understandable without fetching a second item — ISO/IEC/IEEE 29148's *complete*
and *singular* characteristics. An identifier in the obligation itself defeats both: the reader cannot
tell what is required without a lookup, and a renumber rewrites `links:` while leaving the sentence
pointing at whatever now occupies the number.

The explanatory fields are not bound by that. `rationale` and `verification-justification` explain a
decision to someone reading the tree as a tree, so they may name items; the obligation may not.

Scope is the identifier shape only. Whether a cited identifier resolves, and whether it carries the
header of the item it names, is `scripts/check-citations.py`. Whether the sentence means the item it
names is decided by nothing here.
"""

import re
import sys
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent

UID = re.compile(r"\b(?:SYS|SRS|TST)\d{3}\b")


def cited():
    """Every item whose `text` names another item, with the identifiers it names."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))

    found = []
    for document in tree.documents:
        # Document.items skips inactive items; the whole TST tier is inactive.
        for item in document._iter():
            uids = sorted(set(UID.findall(item.text)))
            if uids:
                found.append((item.uid, uids))
    return sorted(found, key=lambda pair: str(pair[0]))


def main():
    found = cited()

    if found:
        print(f"{len(found)} item(s) cite another item in `text`:", file=sys.stderr)
        for uid, cites in found:
            print(f"  {uid} -> {', '.join(cites)}", file=sys.stderr)
        print(
            "\nAn obligation states what is required without a lookup. Rewrite the sentence to say"
            "\nthe thing itself, and move the citation to `rationale` or `verification-justification`"
            "\nif the relationship is worth recording.",
            file=sys.stderr,
        )
        return 1

    print("No item's `text` cites another item.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
