#!/usr/bin/env python3
"""The proposed-item backlog, printed on a passing run. Reports; not a gate.

ADR 0005 rev 1 makes the tree the backlog: `proposed` items live on `main`, and the backlog is
"reported as the work queue, never a blocking failure — a scoping-only session stays green." This is
that report, and nothing more: what the tree holds decides the output and never the exit status, so
the run it prints on stays exactly as green or red as its gates made it.

Two shapes the report refuses, both of the kind where a wrong answer reads as a clean one:

- **Every tier prints, zero included.** A line that disappears at the zero count cannot be told from
  a report that did not run, so each tier states its count against the population it read.
- **A status outside `proposed` | `accepted` is listed, not silently filed as baselined.** Counting
  only the canonical spelling would read a mis-spelled status as not-proposed and deflate the very
  count this exists to surface. Listing is where a reporter's authority ends: for the obliging tiers
  the failure belongs to `check-arch-trace.py`, which gates the same vocabulary.

Items are read as YAML files, the idiom of `check-unreviewed.py`: Doorstop's `Document.items` is
active-only, and a pending item is precisely the kind that sits at `proposed`. An item carrying no
`status` key takes its document's `attributes.defaults` value, which is how Doorstop fills the
attribute in.

What this has been run against, in both directions: cases/report-proposed-py.md
"""

import sys
from pathlib import Path

import yaml

TREE = Path(__file__).resolve().parent.parent / "docs" / "requirements"

STATUSES = ("proposed", "accepted")

# Tiers print in tree order, parent first; a prefix outside this tuple prints after them.
TIER_ORDER = ("SYS", "SRS", "TST")


def load():
    """Item statuses per document prefix. The prefix comes from the document's own config rather
    than the identifier's first characters, and the status default from the same file, because that
    is where Doorstop resolves both."""
    tiers = {}
    for config in sorted(TREE.rglob(".doorstop.yml")):
        document = config.parent
        if any(part.startswith(".") for part in document.relative_to(TREE).parts):
            continue  # `.venv` lives in the tree
        settings = yaml.safe_load(config.read_text()) or {}
        prefix = str((settings.get("settings") or {}).get("prefix") or document.name)
        default = ((settings.get("attributes") or {}).get("defaults") or {}).get("status")
        tier = tiers.setdefault(prefix, {"total": 0, "proposed": [], "unplaced": []})
        # Both suffixes, as in check-unreviewed.py: Doorstop indexes .yaml items too.
        for path in sorted([*document.glob("*.yml"), *document.glob("*.yaml")]):
            if path.stem.startswith("."):
                continue  # pathlib globs dotfiles: the silo's own .doorstop.yml is not an item
            item = yaml.safe_load(path.read_text()) or {}
            status = str(item.get("status", default) or "").strip()
            tier["total"] += 1
            if status == "proposed":
                tier["proposed"].append(path.stem)
            elif status not in STATUSES:
                tier["unplaced"].append(f"{path.stem} ({status or 'unset'})")
    return tiers


def main():
    tiers = load()
    ordered = [p for p in TIER_ORDER if p in tiers] + sorted(set(tiers) - set(TIER_ORDER))

    print("proposed backlog (reported, never gating):")
    for prefix in ordered:
        tier = tiers[prefix]
        listed = f": {' '.join(tier['proposed'])}" if tier["proposed"] else ""
        print(f"  {prefix}: {len(tier['proposed'])} of {tier['total']} item(s) proposed{listed}")
    unplaced = [entry for prefix in ordered for entry in tiers[prefix]["unplaced"]]
    if unplaced:
        print(
            f"  {len(unplaced)} item(s) carry a status outside proposed | accepted, counted in "
            f"neither: {' '.join(unplaced)}"
        )
    total = sum(tier["total"] for tier in tiers.values())
    backlog = sum(len(tier["proposed"]) for tier in tiers.values())
    print(f"  {backlog} of {total} item(s) in the tree await baselining.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
