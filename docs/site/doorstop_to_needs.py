#!/usr/bin/env python3
"""Doorstop YAML -> sphinx-needs MyST transform.

Reads docs/requirements/{sys,srs,tst}/*.yml (canonical, ADR 0002 rev 3) and emits,
per item, one page under docs/site/generated/items/ holding its sphinx-needs
directive (the definition every id link resolves to), plus one sheet page per
document (sys.md/srs.md/tst.md) that pulls all items of that type together
via `needextract` and toctrees the item pages in by glob.

Presentation-free beyond a stable sort by id and the toctree/needextract
structure needed to make every generated page reachable (ADR 0004 rev 1: the
transform copies fields and wires structure, it does not decide how needs
look — that stays in docs/site/traceability.md).

Usage: docs/site/.venv/bin/python docs/site/doorstop_to_needs.py
Output is generated and gitignored.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS_DIR = REPO_ROOT / "docs" / "requirements"
OUTPUT_DIR = REPO_ROOT / "docs" / "site" / "generated" / "requirements"
ITEMS_DIR = OUTPUT_DIR / "items"

# (Doorstop subdirectory, sphinx-needs directive name, id prefix, sheet
# filename stem, sheet page title)
DOCUMENTS = [
    ("sys", "sys", "SYS", "sys", "System needs"),
    ("srs", "srs", "SRS", "srs", "Software requirements"),
    ("tst", "tst", "TST", "tst", "Verification items"),
]


def load_items(doc_dir: Path) -> list[dict]:
    """Load every item in a Doorstop document directory, sorted by id.

    Skips `.doorstop.yml`, Doorstop's own document-metadata file — not a
    requirement item.
    """
    items = []
    # Both suffixes: Doorstop indexes a .yaml item, and one this loader misses is judged by the
    # tree gates and then dropped from the published site with nothing to report the difference.
    for path in sorted([*doc_dir.glob("*.yml"), *doc_dir.glob("*.yaml")]):
        if path.name == ".doorstop.yml":
            continue
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f)
        items.append({"id": path.stem, **data})
    items.sort(key=lambda item: item["id"])
    return items


def parent_links(item: dict) -> list[str]:
    """Extract parent UIDs from Doorstop's `links` list.

    Each entry is a single-key mapping {parent_uid: fingerprint}; only the
    key crosses into the transform.
    """
    links = item.get("links") or []
    return [next(iter(link)) for link in links]


def simple_references(item: dict) -> list[str]:
    """Return TST reference paths if every `references` entry is a plain
    {path, type: file} mapping; otherwise an empty list — this transform
    never invents a rendering for a reference shape it doesn't recognise.
    """
    references = item.get("references")
    if not references:
        return []
    paths = []
    for ref in references:
        if set(ref.keys()) != {"path", "type"} or ref.get("type") != "file":
            return []
        paths.append(ref["path"])
    return paths


def fence_for(body: str) -> str:
    """Return a backtick fence longer than any backtick run inside `body`.

    Fixed-size fences would truncate if an item's verbatim `text` ever
    contained its own code fence.
    """
    longest = max((len(run) for run in re.findall(r"`+", body)), default=0)
    return "`" * max(3, longest + 1)


def render_need_directive(item: dict, directive: str) -> str:
    """Render one item as a sphinx-needs directive fence."""
    title = (item.get("header") or "").strip()
    text = (item.get("text") or "").strip()
    status = "active" if item.get("active") else "inactive"
    links = parent_links(item)

    body_lines = [f":id: {item['id']}", f":status: {status}"]
    if links:
        body_lines.append(f":links: {', '.join(links)}")
    body_lines.append("")
    body_lines.append(text)

    refs = simple_references(item)
    if refs:
        body_lines.append("")
        body_lines.append("References:")
        for ref in refs:
            body_lines.append(f"- `{ref}`")

    body = "\n".join(body_lines)
    fence = fence_for(body)
    return "\n".join([f"{fence}{{{directive}}} {title}", body, fence])


def render_item_page(item: dict, directive: str) -> str:
    return f"# {item['id']}\n\n{render_need_directive(item, directive)}\n"


def render_sheet_page(doc_title: str, directive: str, id_prefix: str) -> str:
    return (
        f"# {doc_title}\n\n"
        f'```{{needextract}}\n:filter: type == "{directive}"\n```\n\n'
        "```{toctree}\n:hidden:\n:glob:\n\n"
        f"items/{id_prefix}*\n```\n"
    )


def main() -> int:
    ITEMS_DIR.mkdir(parents=True, exist_ok=True)
    for subdir, directive, id_prefix, stem, doc_title in DOCUMENTS:
        items = load_items(REQUIREMENTS_DIR / subdir)
        for item in items:
            (ITEMS_DIR / f"{item['id']}.md").write_text(
                render_item_page(item, directive), encoding="utf-8"
            )
        (OUTPUT_DIR / f"{stem}.md").write_text(
            render_sheet_page(doc_title, directive, id_prefix), encoding="utf-8"
        )
        print(f"Wrote {len(items)} item page(s) and generated/requirements/{stem}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
