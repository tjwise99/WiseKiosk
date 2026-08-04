#!/usr/bin/env python3
"""Every requirement identifier tagged in the architecture model resolves to an accepted item.

The rule is `docs/CI.md` § Documentation integrity; the tag mechanism and the tier it carries are
ADR 0019.

Scope is resolution: a tag names an item that exists, is active and accepted, is spelled
canonically, and is applied somewhere. Whether the tagged element is the one that requirement
obliges, and whether the tier suits the level, are read at review.
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


def export():
    """The model as LikeC4 resolves it. Reading the `.likec4` source instead would judge a
    re-implementation of the parser rather than the parser's own answer.

    `validate` runs first for the reason ADR 0003 records against `codegen`: `export json` also
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
    """Every item in the tree. Document.items skips inactive items, which would report a tag on a
    retired item as resolving to nothing rather than as pointing at something retired."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))
    return {item.uid.value: item for document in tree.documents for item in document._iter()}


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
    for kind, group in (("element", elements), ("relationship", relations)):
        for key, body in group.items():
            for tag in body.get("tags") or []:
                applied.setdefault(tag, []).append(f"{kind} {body.get('title') or key!r}")

    items = tree_items()
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

    if problems:
        print(f"check-arch-trace: {len(problems)} tag(s) do not resolve:", file=sys.stderr)
        for problem in problems:
            print("  " + problem, file=sys.stderr)
        sys.exit(1)

    tagged = len(set(declared) | set(applied))
    print(
        f"architecture → requirements holds: {tagged} tag(s) over "
        f"{len(elements)} element(s) and {len(relations)} relationship(s) resolve to accepted items."
    )


if __name__ == "__main__":
    main()
