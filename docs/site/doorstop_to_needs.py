#!/usr/bin/env python3
"""Doorstop YAML -> sphinx-needs MyST transform.

Reads the Doorstop requirements tree under docs/requirements/{sys,srs,tst}/*.yml
(the canonical source — see ADR 0002) and emits one generated MyST file per
document under docs/site/generated/: sys.md, srs.md, tst.md. Each Doorstop item
becomes one sphinx-needs directive.

This is a THIN, presentation-free transform (ADR 0004): it copies fields
across, it does not decide how they look. No styling, no reordering beyond a
stable sort by id. The traceability *views* (needtable/needflow/matrix) are
hand-authored in docs/site/traceability.md, not here.

Pure PyYAML — does not import doorstop, so it carries none of Doorstop's own
dependency weight into the docs silo.

Usage: docs/site/.venv/bin/python docs/site/doorstop_to_needs.py
Output is generated and gitignored — never hand-edited, never committed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS_DIR = REPO_ROOT / "docs" / "requirements"
OUTPUT_DIR = REPO_ROOT / "docs" / "site" / "generated"

# One entry per Doorstop document: (subdirectory, sphinx-needs directive name,
# output filename stem, human-readable document title for the page heading).
DOCUMENTS = [
    ("sys", "sys", "sys", "System needs"),
    ("srs", "srs", "srs", "Software requirements"),
    ("tst", "tst", "tst", "Verification items"),
]


def load_items(doc_dir: Path) -> list[dict]:
    """Load every item in a Doorstop document directory, sorted by id.

    Skips `.doorstop.yml`, Doorstop's own document-metadata file (prefix,
    digits, separator) — not a requirement item.
    """
    items = []
    for path in sorted(doc_dir.glob("*.yml")):
        if path.name == ".doorstop.yml":
            continue
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f)
        items.append({"id": path.stem, **data})
    items.sort(key=lambda item: item["id"])
    return items


def parent_links(item: dict) -> list[str]:
    """Extract parent UIDs from Doorstop's `links` list.

    Each entry is a single-key mapping {parent_uid: fingerprint}; the
    fingerprint is Doorstop's own suspect-link bookkeeping, not part of the
    need graph, so only the key (the parent UID) crosses into the transform.
    """
    links = item.get("links") or []
    return [next(iter(link)) for link in links]


def simple_references(item: dict) -> list[str]:
    """Return TST reference paths if the `references` entries are plain file
    references (only `path` and `type: file`); otherwise an empty list.

    "Simple" is deliberately narrow: this transform surfaces plain text, never
    invents UI for a reference shape it doesn't recognise (ADR 0004).
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


def render_item(item: dict, directive: str) -> str:
    title = (item.get("header") or "").strip()
    text = (item.get("text") or "").strip()
    status = "active" if item.get("active") else "inactive"
    links = parent_links(item)

    lines = [f"```{{{directive}}} {title}", f":id: {item['id']}", f":status: {status}"]
    if links:
        lines.append(f":links: {', '.join(links)}")
    lines.append("")
    lines.append(text)

    refs = simple_references(item)
    if refs:
        lines.append("")
        lines.append("References:")
        for ref in refs:
            lines.append(f"- `{ref}`")

    lines.append("```")
    return "\n".join(lines)


def render_document(doc_title: str, directive: str, items: list[dict]) -> str:
    parts = [f"# {doc_title}"]
    parts.extend(render_item(item, directive) for item in items)
    return "\n\n".join(parts) + "\n"


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for subdir, directive, stem, doc_title in DOCUMENTS:
        items = load_items(REQUIREMENTS_DIR / subdir)
        rendered = render_document(doc_title, directive, items)
        (OUTPUT_DIR / f"{stem}.md").write_text(rendered, encoding="utf-8")
        print(f"Wrote {len(items)} item(s) to docs/site/generated/{stem}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
