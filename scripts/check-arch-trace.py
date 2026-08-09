#!/usr/bin/env python3
"""The architecture model and the requirements tree name each other completely, in both directions.

Tags → tree: every requirement identifier tagged in the model resolves to an accepted item. Tree →
tags: every accepted, active item in an obliging tier is tagged somewhere in the model.

The rules are `docs/CI.md` § Documentation integrity; the tag mechanism and the tier it carries are
ADR 0019 rev 1, and the completeness obligation is ADR 0022 rev 1.

Scope is resolution and completeness. Whether the tagged element is the one that requirement
obliges, and whether the tier suits the level, are read at review.

The second direction's population is decided here rather than filtered into existence:

- **Tier decides first.** `SYS` and `SRS` oblige the software and are in; `TST` says how an
  obligation is settled rather than what the software owes, and is out. A tier in neither set fails,
  so a fourth one cannot escape the rule by being unrecognised.
- **A status outside `accepted` and `proposed` fails.** A comparison against `accepted` alone would
  read a mis-spelled status as *not accepted* and drop the item silently.
- **`proposed` is out**, because the first direction resolves a tag only to an accepted item, so a
  proposed item cannot be tagged and a rule reaching it would be unsatisfiable.
- **Retired — `active: false`, `status` untouched — is out**, because a retired item obliges nothing.
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import doorstop

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "docs" / "architecture" / "model"
LIKEC4 = ROOT / "docs" / "architecture" / "node_modules" / ".bin" / "likec4"

UID = re.compile(r"^(?:SYS|SRS|TST)\d{3}$")
# Judged case-insensitively so a mis-cased identifier is reported rather than skipped: recognising
# only the canonical spelling makes every other spelling invisible to this check rather than wrong.
UID_ANY_CASE = re.compile(r"^(?:SYS|SRS|TST)\d{3}$", re.IGNORECASE)

OBLIGING_TIERS = ("SYS", "SRS")
VERIFICATION_TIERS = ("TST",)
STATUSES = ("accepted", "proposed")


def export():
    """The model as LikeC4 resolves it. Reading the `.likec4` source instead would judge a
    re-implementation of the parser rather than the parser's own answer.

    `validate` runs first for the reason ADR 0003 rev 1 records against `codegen`: `export json` also
    succeeds on a broken model, emitting a degraded document whose tags have silently gone missing —
    which reads here as a model that tags nothing."""
    if not LIKEC4.exists():
        sys.exit("check-arch-trace: LikeC4 is not installed — run `just arch-install`")
    valid = subprocess.run(
        [str(LIKEC4), "validate", str(MODEL)], capture_output=True, text=True
    )
    if valid.returncode != 0:
        sys.exit(f"check-arch-trace: the model does not validate:\n{valid.stderr.strip()}")
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "model.json"
        run = subprocess.run(
            [str(LIKEC4), "export", "json", str(MODEL), "-o", str(out)],
            capture_output=True,
            text=True,
        )
        if run.returncode != 0 or not out.exists():
            sys.exit(f"check-arch-trace: `likec4 export json` failed:\n{run.stderr.strip()}")
        return json.loads(out.read_text(encoding="utf-8"))


def tree_items():
    """Every item in the tree, paired with the prefix of the document holding it — the tier comes
    from the document rather than from the identifier's first three characters.

    Document.items skips inactive items, which would report a tag on a retired item as resolving to
    nothing rather than as pointing at something retired, and would hide the retired items the
    second direction counts."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))
    return [
        (str(document.prefix), item)
        for document in tree.documents
        for item in document._iter()
    ]


def main():
    model = export()
    elements = model.get("elements") or {}
    relations = model.get("relations") or {}
    declared = (model.get("specification") or {}).get("tags") or {}

    # A model this failed to read carries no tags, and a tag check over no tags agrees that nothing
    # is wrong. Assert the export produced the things tags hang off, which shares no assumption with
    # the tag set itself.
    if not elements:
        sys.exit("check-arch-trace: the export names no element, so nothing here judged the model")

    applied = {}
    # Subjects are counted separately from applications: one identifier may sit on several
    # subjects and one subject may carry several identifiers, so neither count derives from
    # the other, and neither derives from the size of the model.
    tagged_subjects = set()
    for kind, group in (("element", elements), ("relationship", relations)):
        for key, body in group.items():
            for tag in body.get("tags") or []:
                applied.setdefault(tag, []).append(f"{kind} {body.get('title') or key!r}")
                tagged_subjects.add((kind, key))

    # A model carrying no tag resolves every tag it carries. The link this asserts would be absent
    # rather than sound, and the two read identically in a green run.
    if not declared and not applied:
        sys.exit(
            "check-arch-trace: the model names no requirement, so the architecture → requirements "
            "link is absent rather than holding"
        )

    tiered = tree_items()
    items = {item.uid.value: item for _, item in tiered}
    if not items:
        sys.exit("check-arch-trace: the requirements tree loaded no item, so nothing here judged a tag")

    problems = []
    for tag in sorted(set(declared) | set(applied)):
        where = "; ".join(applied.get(tag, []))
        if not UID_ANY_CASE.match(tag):
            problems.append(
                f"{tag}: not a requirement identifier ({where or 'declared only'}). Every tag in "
                "this model carries one; a tag that carries something else is a decision, not an "
                "exemption to add here"
            )
        elif not UID.match(tag):
            problems.append(f"{tag}: mis-cased — items are upper-case ({where or 'declared only'})")
        elif tag not in applied:
            problems.append(f"{tag}: declared and applied to nothing")
        elif tag not in items:
            problems.append(f"{tag}: no such item in the requirements tree ({where})")
        elif not items[tag].active:
            problems.append(f"{tag}: the item is retired ({where})")
        elif str(items[tag].get("status") or "").strip() != "accepted":
            status = str(items[tag].get("status") or "").strip() or "unset"
            problems.append(f"{tag}: the item is {status}, not accepted ({where})")

    # Keyed on the document set rather than on any item attribute, so it still fires where the tiers
    # are present but nothing in them reads — the state the population guard below cannot separate
    # from a tree that legitimately obliges nothing.
    if not any(prefix in OBLIGING_TIERS for prefix, _ in tiered):
        sys.exit(
            "check-arch-trace: no document carries an obliging tier, so nothing here judged "
            "allocation"
        )

    unbound = []
    unjudged = []
    population = []
    proposed = retired = verification = 0
    for prefix, item in tiered:
        uid = item.uid.value
        if prefix in VERIFICATION_TIERS:
            verification += 1
            continue
        if prefix not in OBLIGING_TIERS:
            unjudged.append(
                f"{uid}: tier {prefix} is neither obliging nor verification, and ADR 0022 rev 1 "
                "says nothing about whether it allocates — a tier to decide, not one to pass over"
            )
            continue
        status = str(item.get("status") or "").strip() or "unset"
        if status not in STATUSES:
            unjudged.append(
                f"{uid}: status {status} is outside the vocabulary this rule reads, so whether it "
                "must bind is undecided rather than settled"
            )
            continue
        if not item.active:
            retired += 1
        elif status != "accepted":
            proposed += 1
        else:
            population.append(uid)
            if uid not in applied:
                unbound.append(uid)

    # The unbound set is a subset of the population, so an empty population reports perfect
    # allocation over nothing judged.
    if not population:
        sys.exit(
            "check-arch-trace: no item is accepted and active, so nothing here judged allocation"
        )

    # Each direction reports in full rather than the first one exiting, so a tag that stops
    # resolving stays legible while the allocation set is non-empty.
    if problems:
        print(f"check-arch-trace: {len(problems)} tag(s) do not resolve:", file=sys.stderr)
        for problem in problems:
            print("  " + problem, file=sys.stderr)
    if unjudged:
        print(
            f"check-arch-trace: {len(unjudged)} item(s) this rule cannot place:", file=sys.stderr
        )
        for problem in unjudged:
            print("  " + problem, file=sys.stderr)
    if unbound:
        print(
            f"check-arch-trace: {len(unbound)} of {len(population)} accepted, active item(s) are "
            "tagged nowhere in the model:",
            file=sys.stderr,
        )
        for uid in sorted(unbound):
            print(f"  {uid}: {items[uid].header}", file=sys.stderr)
    if problems or unjudged or unbound:
        sys.exit(1)

    identifiers = len(set(declared) | set(applied))
    applications = sum(len(where) for where in applied.values())
    subjects = len(elements) + len(relations)
    print(
        f"architecture → requirements holds: {applications} tag application(s) on "
        f"{len(tagged_subjects)} of {subjects} element(s) and relationship(s), "
        f"naming {identifiers} accepted item(s)."
    )
    print(
        f"requirements → architecture holds: all {len(population)} accepted, active item(s) in an "
        f"obliging tier are tagged, of {len(tiered)} item(s) in the tree — {proposed} proposed, "
        f"{retired} retired and {verification} verification item(s) are outside the population."
    )


if __name__ == "__main__":
    main()
