#!/usr/bin/env python3
"""Every requirement sits at the least-decidable method among its children.

Decidability order, per docs/requirements/README.md: test > analysis > inspection > demonstration.
A parent above its least-decidable child claims a machine settles what one of its own obligations
leaves to a human. A parent below every child understates what the tree already proves.

The two directions are not symmetric. Overstating is never excusable. Understating is, where the
parent holds a residual obligation no child carries — so it is permitted only with a written
verification-justification, which is the argument for why the residue exists.
"""

import re
import sys
from pathlib import Path

RANK = {"test": 4, "analysis": 3, "inspection": 2, "demonstration": 1}
TREE = Path(__file__).resolve().parent.parent / "docs" / "requirements"

METHOD = re.compile(r"^verification-method: (.*)$", re.M)
JUSTIFIED = re.compile(r"^verification-justification: \|$", re.M)
LINKS = re.compile(r"^links:\n((?:- .*\n)+)", re.M)
PARENT = re.compile(r"- (\w+):")


def load():
    method, children, justified = {}, {}, set()
    for silo in ("sys", "srs", "tst"):
        for path in sorted((TREE / silo).glob("*.yml")):
            text = path.read_text()
            uid = path.stem
            found = METHOD.search(text)
            method[uid] = found.group(1).strip().strip("'") if found else ""
            if JUSTIFIED.search(text):
                justified.add(uid)
            block = LINKS.search(text)
            if block:
                for line in block.group(1).splitlines():
                    hit = PARENT.match(line.strip())
                    if hit:
                        children.setdefault(hit.group(1), []).append(uid)
    return method, children, justified


def main():
    method, children, justified = load()
    failures = []
    for parent, kids in sorted(children.items()):
        rank = RANK.get(method.get(parent, ""))
        kid_ranks = [RANK[method[k]] for k in kids if method.get(k) in RANK]
        if rank is None or not kid_ranks:
            continue
        least = min(kid_ranks)
        if rank == least:
            continue
        if rank < least and parent in justified:
            continue  # residual obligation no child carries, argued in the justification
        weakest = ", ".join(f"{k} ({method[k]})" for k in kids if RANK.get(method[k]) == least)
        if rank > least:
            reason = "above its least-decidable child"
        else:
            reason = "below every child with no verification-justification"
        failures.append(f"{parent} ({method[parent]}) is {reason}: {weakest}")

    if failures:
        print("Verification-method inconsistency:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        print(
            f"\n{len(failures)} item(s). A parent is verified by the aggregate of its children, so it"
            "\ncan be no more decidable than the least. Promote the lagging child, split the parent so"
            "\neach clause sits at its own honest method, or - where the parent holds a residue no child"
            "\ncarries - record a verification-justification (docs/requirements/README.md).",
            file=sys.stderr,
        )
        return 1

    print(f"Verification methods are consistent across {len(children)} parent items.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
