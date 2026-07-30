#!/usr/bin/env python3
"""Every item carries a verification-justification, and sits at the least-decidable method
among its children.

Decidability order, per docs/requirements/README.md: test > analysis > inspection > demonstration.
A parent above its least-decidable child claims a machine settles what one of its own obligations
leaves to a human. A parent below every child understates what the tree already proves.

The two directions are not symmetric. Overstating is never excusable. Understating is, where the
parent holds a residual obligation no child carries — so it is permitted only with a written
verification-justification, which is the argument for why the residue exists.

That attribute is also required on its own, on every item, per ADR 0009: below `test`, what blocks a
mechanical check; at `test`, what the check leaves unproven. Absence is the failure the method rule
cannot see — an item with no justification satisfies the rule by having nothing to argue.
"""

import sys
from pathlib import Path

import yaml

RANK = {"test": 4, "analysis": 3, "inspection": 2, "demonstration": 1}
TREE = Path(__file__).resolve().parent.parent / "docs" / "requirements"


def load():
    """Parse every item. YAML, not regex: a link may be a plain string or a
    single-key mapping, and a justification a block or a plain scalar — forms a
    pattern would drop silently, taking the item's children or its argument with
    them."""
    method, children, justified = {}, {}, set()
    for silo in ("sys", "srs", "tst"):
        for path in sorted((TREE / silo).glob("*.yml")):
            if path.stem.startswith("."):
                continue  # pathlib globs dotfiles: the silo's own .doorstop.yml is not an item
            item = yaml.safe_load(path.read_text()) or {}
            uid = path.stem
            method[uid] = str(item.get("verification-method") or "").strip()
            if str(item.get("verification-justification") or "").strip():
                justified.add(uid)
            for link in item.get("links") or []:
                parent = next(iter(link)) if isinstance(link, dict) else link
                children.setdefault(str(parent), []).append(uid)
    return method, children, justified


def main():
    method, children, justified = load()
    unjustified = sorted(set(method) - justified)
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

    if unjustified:
        print(f"{len(unjustified)} item(s) carry no verification-justification:", file=sys.stderr)
        for prefix in ("SYS", "SRS", "TST"):
            tier = [u for u in unjustified if u.startswith(prefix)]
            if tier:
                print(f"  {prefix} ({len(tier)}): {' '.join(tier)}", file=sys.stderr)
        print(
            "\nEvery item states what its verification settles and what it does not (ADR 0009):"
            "\nbelow `test`, what blocks a mechanical check; at `test`, what the check leaves"
            "\nunproven.",
            file=sys.stderr,
        )

    if failures:
        print("\nVerification-method inconsistency:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        print(
            f"\n{len(failures)} item(s). A parent is verified by the aggregate of its children, so it"
            "\ncan be no more decidable than the least. Promote the lagging child, split the parent so"
            "\neach clause sits at its own honest method, or - where the parent holds a residue no child"
            "\ncarries - record a verification-justification (docs/requirements/README.md).",
            file=sys.stderr,
        )

    if unjustified or failures:
        return 1

    print(
        f"All {len(method)} items carry a verification-justification; methods are consistent "
        f"across {len(children)} parent items."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
