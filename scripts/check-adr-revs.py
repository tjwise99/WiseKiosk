#!/usr/bin/env python3
"""Every citation of an ADR pins that ADR's current rev.

An ADR is a versioned document (`docs/decisions/README.md`): merged text is revisable, and a
correction is a new rev. A citation names the rev it was written against, so revving an ADR reaches
every document citing it — each is then updated or re-decided rather than left asserting a claim the
ADR's current rev does not make.

Three assertions, over the tracked file set:

- Each ADR's head carries `**Rev:** N`, and the index table in `docs/decisions/README.md` agrees
  with it. The head is authoritative; the table is checked against it, never trusted.
- Every `ADR NNNN` in prose is followed by `rev M`, and M is that ADR's current rev.
- Every markdown link resolving to an ADR file is titled `ADR NNNN rev M` likewise. The link rule is
  what the prose rule cannot reach: a citation spelled `[NNNN](NNNN-slug.md)` names no ADR in prose
  at all.

That an ADR's rev was raised for a good reason, and that a citation pinning the current rev still
means what the ADR says, is decided by nothing here.

Whether every ADR has an index row, every row a file, and numbering is contiguous is
`scripts/check-adr-index.mjs`.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DECISIONS = ROOT / "docs" / "decisions"
INDEX = DECISIONS / "README.md"

ADR_FILE = re.compile(r"^(\d{4})-[a-z0-9-]+\.md$")
HEAD_REV = re.compile(r"^\*\*Rev:\*\* *(\d+) *$", re.M)
INDEX_ROW = re.compile(r"^\| *\[(\d{4})\]\([^)]+\) *\| *([^|]*?) *\|", re.M)

PROSE = re.compile(r"\bADR ?(\d{4})\b(?: +rev +(\d+))?")
LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)[^)]*\)")
LINK_TITLE = re.compile(r"^ADR ?(\d{4}) +rev +(\d+)$")

SECTION = re.compile(r"^## +(.+?) *$")


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


def tracked():
    """Every tracked path, from git rather than a walk — the set CI is asked to judge."""
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout
    return [ROOT / name.decode() for name in listing.split(b"\0") if name]


def current_revs(problems):
    """Each ADR's number and the rev its own head declares."""
    revs = {}
    for path in sorted(DECISIONS.iterdir()):
        match = ADR_FILE.match(path.name)
        if not match:
            continue
        # An entry named like an ADR that is a directory or a dangling symlink is not one, and must
        # not pass for want of a readable head.
        if not path.is_file():
            problems.append(f"docs/decisions/{path.name} is not a readable file")
            continue
        heads = HEAD_REV.findall(path.read_text(encoding="utf-8"))
        if len(heads) != 1:
            problems.append(
                f"docs/decisions/{path.name} declares {len(heads)} `**Rev:** N` lines, expected 1"
            )
            continue
        revs[match.group(1)] = int(heads[0])
    if not revs:
        problems.append("no ADR declared a rev — the head format or this parser is wrong")
    return revs


def check_index(revs, problems):
    """The index table's rev column repeats the head, and is checked against it."""
    rows = {number: cell for number, cell in INDEX_ROW.findall(INDEX.read_text(encoding="utf-8"))}
    for number, rev in sorted(revs.items()):
        if number not in rows:
            problems.append(f"ADR {number} rev {rev} has no row in docs/decisions/README.md")
        elif not rows[number].isdigit():
            problems.append(
                f"docs/decisions/README.md row {number} has rev cell {rows[number]!r}, not a number"
            )
        elif int(rows[number]) != rev:
            problems.append(
                f"docs/decisions/README.md row {number} says rev {rows[number]}, "
                f"its head says rev {rev}"
            )


def exempt_lines(path, text):
    """Line numbers a citation may pin a stale rev on.

    A *Revisions* line records what a rev did at the moment it did it — `superseded by ADR NNNN
    rev M` is a statement about that moment, and holding it to current would rewrite it every time
    the ADR it names revs. An index row names its own document rather than citing it.

    Both are scoped to `docs/decisions/`: nothing outside it earns either exemption, and inside it
    the *Revisions* exemption ends at the next section heading rather than running to end of file.
    """
    if path.parent != DECISIONS:
        return set()
    exempt, in_revisions = set(), False
    for number, line in enumerate(text.split("\n"), start=1):
        heading = SECTION.match(line)
        if heading:
            in_revisions = heading.group(1) == "Revisions"
        elif in_revisions or (path == INDEX and INDEX_ROW.match(line)):
            exempt.add(number)
    return exempt


def check_citations(revs, problems):
    unreadable = []
    for path in tracked():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Not a skip the count hides: a file whose bytes are not text cannot carry a citation in
            # the form the rule defines, and every one of them is named on the way past.
            unreadable.append(path.relative_to(ROOT))
            continue
        except OSError as error:
            problems.append(f"{path.relative_to(ROOT)}: {error}")
            continue

        where = f"{path.relative_to(ROOT)}"
        exempt = exempt_lines(path, text)
        for number, line in enumerate(text.split("\n"), start=1):
            if number in exempt:
                continue
            for cited, pinned in PROSE.findall(line):
                problems.extend(judge(revs, where, number, cited, pinned, line.strip()))
            for title, target in LINK.findall(line):
                name = target.split("#")[0].split("/")[-1]
                match = ADR_FILE.match(name)
                if not match:
                    continue
                titled = LINK_TITLE.match(title.strip())
                if not titled:
                    problems.append(
                        f"{where}:{number}: link to {name} is titled {title!r}, "
                        f"expected `ADR {match.group(1)} rev N`"
                    )
                elif titled.group(1) != match.group(1):
                    problems.append(
                        f"{where}:{number}: link titled ADR {titled.group(1)} targets {name}"
                    )
                else:
                    problems.extend(
                        judge(revs, where, number, titled.group(1), titled.group(2), title)
                    )
    if unreadable:
        print(
            f"not scanned, not decodable as text: {', '.join(map(str, unreadable))}",
            file=sys.stderr,
        )


def judge(revs, where, number, cited, pinned, context):
    """One citation against the ADR it names."""
    if cited not in revs:
        return [f"{where}:{number}: cites ADR {cited}, which is not an ADR — {context}"]
    if pinned is None or pinned == "":
        return [f"{where}:{number}: cites ADR {cited} without a rev — {context}"]
    if int(pinned) != revs[cited]:
        return [
            f"{where}:{number}: pins ADR {cited} rev {pinned}, current is rev {revs[cited]}"
        ]
    return []


def main():
    problems = []
    revs = current_revs(problems)
    if revs:
        check_index(revs, problems)
        check_citations(revs, problems)
    if problems:
        return fail(sorted(problems))
    print(f"{len(revs)} ADRs; every citation pins the current rev")
    return 0


if __name__ == "__main__":
    sys.exit(main())
