#!/usr/bin/env python3
"""No item reaches the validator carrying an unwritten review.

Doorstop stamps a fingerprint into any item whose `reviewed` value is absent, and into any link
carrying no stamp, the first time it validates the tree. It does that whether or not a person
looked, and `--no-reformat` does not stop it. An item authored in one commit is therefore
"reviewed" by whoever next runs the gate.

That is the one thing the fingerprint is supposed to prove. ADR 0005 rev 1 stores state for human
decisions only and holds the axiom tier by review alone, mechanized by fingerprints; a fingerprint
the gate writes for itself proves that the gate ran. `reviewed: true` is the same defect declared by
hand: Doorstop reads it as "matching, hash to follow" and fills the hash in unprompted.

So this runs first and fails, and `check-reqs` stops before Doorstop can stamp anything. Clearing it
is `doorstop review <uid>` — the same act, performed deliberately.

A missing stamp is not the only way to record a review nobody performed. A stamp is a digest of the
parent's content, so it can be copied from the parent's own `reviewed` value by hand, and the result
is indistinguishable from one `doorstop clear` earned. What gives it away is the company it keeps:
`review` writes the item's own fingerprint and `clear` writes its links' stamps, so an item whose own
review is unwritten cannot have reached a state where its links are stamped. Committed, that pairing
says the stamp was authored rather than produced.
"""

import sys
from pathlib import Path

import yaml

TREE = Path(__file__).resolve().parent.parent / "docs" / "requirements"


def unstamped_value(value):
    """A fingerprint is the digest string Doorstop writes. `true` is its manually-confirmed
    placeholder, which the `Item.reviewed` property replaces with a computed stamp the next time
    anything reads it — a review declared rather than recorded, so it is unstamped here."""
    return not isinstance(value, str) or not value.strip()


def load():
    """Parse every item. YAML, not regex: a link is either a bare string (never stamped) or a
    single-key mapping whose value is the stamp or None, and a pattern reading one form drops the
    other silently."""
    unreviewed, unstamped, authored = [], [], []
    for silo in ("sys", "srs", "tst"):
        # Both suffixes: Doorstop indexes a .yaml item, and globbing only .yml would leave one
        # unread by a check whose whole subject is items nobody has reviewed.
        for path in sorted([*(TREE / silo).glob("*.yml"), *(TREE / silo).glob("*.yaml")]):
            if path.stem.startswith("."):
                continue  # pathlib globs dotfiles: the silo's own .doorstop.yml is not an item
            item = yaml.safe_load(path.read_text()) or {}
            uid = path.stem
            item_unreviewed = unstamped_value(item.get("reviewed"))
            if item_unreviewed:
                unreviewed.append(uid)
            for link in item.get("links") or []:
                parent = next(iter(link)) if isinstance(link, dict) else link
                stamp = link[parent] if isinstance(link, dict) else None
                if unstamped_value(stamp):
                    unstamped.append(f"{uid} -> {parent}")
                elif item_unreviewed:
                    authored.append(f"{uid} -> {parent}")
    return unreviewed, unstamped, authored


def main():
    unreviewed, unstamped, authored = load()

    if authored:
        print(f"{len(authored)} link stamp(s) no review produced:", file=sys.stderr)
        for line in authored:
            print(f"  {line}", file=sys.stderr)
        print(
            "\nThe item carries no review fingerprint of its own, so nothing has reviewed it, yet its"
            "\nlink to the parent is stamped. `doorstop review` writes the first and `doorstop clear`"
            "\nthe second, and neither reaches this state alone — the stamp was written by hand, and a"
            "\ncopied digest is indistinguishable from an earned one everywhere but here. Remove the"
            "\nvalue, read the item against its parent, then stamp both.",
            file=sys.stderr,
        )

    if unreviewed:
        print(f"{len(unreviewed)} item(s) carry no review fingerprint:", file=sys.stderr)
        for prefix in ("SYS", "SRS", "TST"):
            tier = [u for u in unreviewed if u.startswith(prefix)]
            if tier:
                print(f"  {prefix} ({len(tier)}): {' '.join(tier)}", file=sys.stderr)

    if unstamped:
        print(f"\n{len(unstamped)} link(s) were never reviewed against their parent:", file=sys.stderr)
        for line in unstamped:
            print(f"  {line}", file=sys.stderr)

    if unreviewed or unstamped or authored:
        print(
            "\nDoorstop would stamp every one of these on its next run, recording a review nobody"
            "\nperformed. Read the item against its parent and run `doorstop review <uid>`, or"
            "\ndelete it. Do not clear this by running the gate.",
            file=sys.stderr,
        )
        return 1

    print("Every item and every link carries a review fingerprint.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
