#!/usr/bin/env python3
"""Every item's header is well-formed for machine use: non-empty, charset-safe, prefix-free.

A header is no longer only a label. A citation carries it verbatim into an HTML comment inside
running prose, so header text is embedded into contexts with metacharacters of their own — the
surrounding Markdown, the comment itself, and the citation checker's normalisation. The constraint
is a property of the specification rather than of the repository, so it is stated in
`docs/requirements/README.md` and runs with the tree's own integrity checks (ADR 0011).

The permitted set is an allowlist: a list of characters to reject fails open on the one nobody
enumerated.
"""

import re
import sys
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent
PERMITTED = re.compile(r"^[A-Za-z0-9 ,.'()&:;-]+$")


def headers():
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))
    for document in tree.documents:
        for item in document._iter():
            # Split on ASCII whitespace only, and trim by dropping the empty edge segments the split
            # produces: str.split() and str.strip() both fold U+00A0 and friends into ordinary
            # whitespace, retiring them before the permitted-set test ever sees them.
            yield str(item.uid), " ".join(
                part for part in re.split(r"[ \t\r\n\f\v]+", item.header or "") if part
            )


def main():
    problems = []
    known = list(headers())

    for uid, header in known:
        if not header:
            problems.append(f"{uid}  has no header")
        elif not PERMITTED.match(header):
            outside = sorted({c for c in header if not PERMITTED.match(c)})
            problems.append(
                f"{uid}  header uses {' '.join(repr(c) for c in outside)}, outside the permitted set"
            )

    # No word boundary is required: the pairs that matter continue with punctuation, so a boundary
    # test would pass exactly the case worth catching.
    for uid, header in known:
        for other, other_header in known:
            if uid >= other or not header:
                continue  # each pair once, in one direction
            if other_header.casefold() == header.casefold():
                problems.append(f"{uid}  and {other}  carry the same header")
            elif other_header.casefold().startswith(header.casefold()):
                problems.append(f"{uid}  header is a prefix of {other}'s — a reader tells them apart only at the end")
            elif header.casefold().startswith(other_header.casefold()):
                problems.append(f"{other}  header is a prefix of {uid}'s — a reader tells them apart only at the end")

    if problems:
        print(f"{len(problems)} malformed header(s):", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1

    print(f"Every header is non-empty, within the permitted set, and prefix-free ({len(known)} items).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
