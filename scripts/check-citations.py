#!/usr/bin/env python3
"""Every citation names something that exists, and requirement citations carry the item's header.

A bare identifier is a pointer with no meaning of its own. A renumber rewrites `links:` and leaves
every sentence pointing at whatever now occupies the number, and the prose still reads as correct —
so an identifier alone can go silently wrong in a way no reader notices. Repeating the header beside
it makes the citation self-describing: the name carries the meaning, the number is only the handle,
and a drifted pair is a mismatch a machine can see.

ADR numbers are exempt from the header rule. They are chronological and immutable
(`docs/decisions/README.md`), so the number cannot come to mean a different decision; only its
existence is checked.

An identifier followed by `.yml` names an item's own file rather than citing the item, so it is not
a citation and carries no header.

Scope is resolution and the header pair. Whether a cited item is accepted, and whether the sentence
means the item it names, is beyond this.
"""

import re
import sys
from pathlib import Path
from subprocess import run

import doorstop

ROOT = Path(__file__).resolve().parent.parent
DECISIONS = ROOT / "docs" / "decisions"

UID = re.compile(r"\b(?:SYS|SRS|TST)\d{3}\b")
ADR = re.compile(r"\bADR[ -]?(\d{4})\b")
FENCE = re.compile(r"^\s*(?:```|~~~)")


def items():
    """Every item in the tree. Document.items skips inactive items; the whole TST tier is
    inactive."""
    tree = doorstop.build(cwd=str(ROOT), root=str(ROOT))
    return [item for document in tree.documents for item in document._iter()]


def adr_numbers():
    return {path.name[:4] for path in DECISIONS.glob("[0-9][0-9][0-9][0-9]-*.md")}


def markdown_sources():
    """Tracked Markdown, less `.claude/` — agent instructions cite the tree to describe how to work
    on it, and are not part of the documentation set."""
    tracked = run(
        ["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    for name in tracked:
        if name.startswith(".claude/"):
            continue
        yield name, blank_fences((ROOT / name).read_text())


def blank_fences(text):
    """Fenced code blocks replaced by spaces of equal length, so offsets still name the right line."""
    out, fence = [], None
    for line in text.split("\n"):
        marker = FENCE.match(line)
        if fence is None and marker:
            fence = marker.group().strip()[0]
        elif fence is not None and marker and marker.group().strip()[0] == fence:
            fence = None
            out.append(" " * len(line))
            continue
        out.append(" " * len(line) if fence is not None else line)
    return "\n".join(out)


def item_sources(tree_items):
    """Each item's explanatory fields, with the line their first content line sits on. The fields
    are literal block scalars, so an offset within the value is an offset within the file."""
    for item in tree_items:
        path = Path(item.path)
        lines = path.read_text().split("\n")
        for field in ("rationale", "verification-justification"):
            value = item.get(field) or ""
            if not value.strip():
                continue
            start = next(i for i, line in enumerate(lines) if line.startswith(f"{field}:"))
            yield path.relative_to(ROOT).as_posix(), value, start + 2


def follows(text, header):
    """The text right after a citation begins with the header, once the markup between them is out
    of the way: the identifier's own closing backtick or possessive clitic, the HTML comment markers,
    and a blockquote marker continuing the line the citation sits on."""
    window = re.sub(r"\n\s*>", "\n", text[: len(header) + 200])
    window = re.sub(r"^(?:\s*(?:`|'s))+", "", window)
    for token in ("<!--", "-->", "`"):
        window = window.replace(token, " ")
    return " ".join(window.split()).casefold(), " ".join(header.split()).casefold()


def check(source, text, item_headers, adrs, base=1):
    problems = []
    for match in UID.finditer(text):
        uid = match.group()
        if text[match.end() :].startswith(".yml"):
            continue  # an item's own filename, not a citation
        line = base + text.count("\n", 0, match.start())
        if uid not in item_headers:
            problems.append(f"{source}:{line}  {uid}  names no item in the requirements tree")
            continue
        found, expected = follows(text[match.end() :], item_headers[uid])
        if not found.startswith(expected):
            problems.append(
                f"{source}:{line}  {uid}  expected the item's header '{item_headers[uid]}'"
                f", found '{found[: len(expected)]}'"
            )
    for match in ADR.finditer(text):
        if match.group(1) not in adrs:
            line = base + text.count("\n", 0, match.start())
            problems.append(f"{source}:{line}  {match.group()}  names no file in docs/decisions/")
    return problems


def main():
    tree_items = items()
    item_headers = {str(item.uid): (item.header or "").strip() for item in tree_items}
    adrs = adr_numbers()

    problems = []
    for name, text in markdown_sources():
        problems += check(name, text, item_headers, adrs)
    for path, value, base in item_sources(tree_items):
        problems += check(path, value, item_headers, adrs, base)

    if problems:
        print(f"{len(problems)} citation(s) name nothing, or name it without its header:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        print(
            "\nA citation carries the identifier and the item's header verbatim, either as visible"
            "\ntext or in an HTML comment: `SRS015 <!-- One schema, all boundary value classes -->`."
            "\nAn ADR number needs no header; it needs a file.",
            file=sys.stderr,
        )
        return 1

    print("Every citation resolves, and every requirement citation carries its item's header.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
