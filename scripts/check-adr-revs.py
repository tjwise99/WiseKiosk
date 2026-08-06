#!/usr/bin/env python3
"""Every citation of an ADR pins that ADR's current rev.

An ADR is a versioned document (`docs/decisions/README.md`): merged text is revisable, and a
correction is a new rev. A citation names the rev it was written against, so revving an ADR reaches
every document citing it — each is then updated or re-decided rather than left asserting a claim the
ADR's current rev does not make.

Assertions, over the tracked file set:

- Each ADR's head carries `**Rev:** N`, and the index table in `docs/decisions/README.md` agrees
  with it. The head is authoritative; the table is checked against it, never trusted.
- Each ADR's *Revisions* section carries one changelog line per rev, numbered 1 to that head rev.
- Every `ADR NNNN` in prose is followed by `rev M`, and M is that ADR's current rev.
- Every markdown link resolving to an ADR file is titled `ADR NNNN rev M` likewise. The link rule is
  what the prose rule cannot reach: a citation spelled `[NNNN](NNNN-slug.md)` names no ADR in prose
  at all.
- A citation spelled in any other way — a plural, a hyphen, the wrong case, a reference-style link, a
  raw `<a href>` — is reported as malformed rather than passed over. The set this recognises is the
  set it can hold to a rev, so anything outside it must fail rather than shrink the population.

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
INDEX_ROW = re.compile(r"^(\| *\[\d{4}\]\([^)]+\) *\|)(.*)$")

# Any spelling that reaches for an ADR by number. Canonical form is checked against the match text,
# so a plural, a hyphen or the wrong case is reported rather than missed.
CITATION = re.compile(r"\bADRs?[ \-]?(\d{4})\b(?: +rev +(\d+))?", re.I)
CANONICAL = re.compile(r"^ADR \d{4}(?: rev \d+)?$")

LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)[^)]*\)")
LINK_TITLE = re.compile(r"^ADR ?(\d{4}) +rev +(\d+)$")
# Forms this cannot hold to a rev; each is reported if it targets an ADR.
REF_DEF = re.compile(r"^\[[^\]]+\]:\s*(\S+)")
RAW_HREF = re.compile(r"<a\s[^>]*href=[\"']([^\"']+)[\"']", re.I)

SECTION = re.compile(r"^## +(.+?) *$")
CHANGELOG = re.compile(r"^- \*\*rev (\d+)\*\* — ")
CONTINUATION = re.compile(r"^ {2,}\S")


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


def changelog_revs(text):
    """The rev numbers a document's *Revisions* section declares."""
    found, inside = [], False
    for line in text.split("\n"):
        heading = SECTION.match(line)
        if heading:
            inside = heading.group(1) == "Revisions"
            continue
        if inside:
            entry = CHANGELOG.match(line)
            if entry:
                found.append(int(entry.group(1)))
    return found


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
        text = path.read_text(encoding="utf-8")
        heads = HEAD_REV.findall(text)
        if len(heads) != 1:
            problems.append(
                f"docs/decisions/{path.name} declares {len(heads)} `**Rev:** N` lines, expected 1"
            )
            continue
        rev = int(heads[0])
        revs[match.group(1)] = rev
        declared = changelog_revs(text)
        if sorted(declared) != list(range(1, rev + 1)):
            problems.append(
                f"docs/decisions/{path.name} is at rev {rev} but its Revisions section declares "
                f"{declared or 'nothing'}, expected one line per rev from 1"
            )
    if not revs:
        problems.append("no ADR declared a rev — the head format or this parser is wrong")
    return revs


def check_index(revs, problems):
    """The index table's rev column repeats the head, and is checked against it."""
    rows = {}
    for line in INDEX.read_text(encoding="utf-8").split("\n"):
        row = INDEX_ROW.match(line)
        if row:
            number = re.search(r"\[(\d{4})\]", row.group(1)).group(1)
            rows[number] = row.group(2).split("|")[0].strip()
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


def readable(path, text):
    """The text of each line to judge, with the two exemptions applied.

    A **changelog line** records what a rev did at the moment it did it, so the rev it names is left
    as written. The exemption is the line's shape, not its neighbourhood: an ordinary sentence in a
    *Revisions* section is judged like any other, which is what stops the section being the place a
    stale citation is parked.

    An **index row** names its own document in its leading self-link, whose title is a bare number by
    construction. Only that link is dropped; the row's *Decision* cell is free prose and is judged.
    """
    in_revisions, in_entry = False, False
    for number, line in enumerate(text.split("\n"), start=1):
        heading = SECTION.match(line)
        if heading:
            in_revisions, in_entry = heading.group(1) == "Revisions", False
            yield number, line
            continue
        if in_revisions and path.parent == DECISIONS:
            if CHANGELOG.match(line):
                in_entry = True
                continue
            if in_entry and CONTINUATION.match(line):
                continue
            in_entry = False
        row = INDEX_ROW.match(line) if path == INDEX else None
        yield number, row.group(2) if row else line


def check_citations(revs, problems):
    unreadable, judged = [], {"prose": 0, "link": 0}
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

        where = str(path.relative_to(ROOT))
        for number, line in readable(path, text):
            titles = []
            for title, target in LINK.findall(line):
                name = target.split("#")[0].split("/")[-1]
                match = ADR_FILE.match(name)
                if not match:
                    continue
                titles.append(title)
                judged["link"] += 1
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

            for form, pattern in (("reference-style link", REF_DEF), ("raw <a href>", RAW_HREF)):
                for target in pattern.findall(line):
                    if ADR_FILE.match(target.split("#")[0].split("/")[-1]):
                        judged["link"] += 1
                        problems.append(
                            f"{where}:{number}: cites an ADR as a {form}, which carries no rev — "
                            f"write it inline as `[ADR NNNN rev M](...)`"
                        )

            for match in CITATION.finditer(line):
                # A title already judged above; judging it again would report one defect twice.
                if any(match.group(0) in title for title in titles):
                    continue
                judged["prose"] += 1
                spelling = match.group(0).split(" rev ")[0]
                if not CANONICAL.match(match.group(0)):
                    problems.append(
                        f"{where}:{number}: {spelling!r} is not a citation this can pin — "
                        f"write `ADR {match.group(1)} rev N`"
                    )
                    continue
                problems.extend(
                    judge(revs, where, number, match.group(1), match.group(2), line.strip())
                )

    if unreadable:
        print(
            f"not scanned, not decodable as text: {', '.join(map(str, unreadable))}",
            file=sys.stderr,
        )
    # The mirror of the guard in current_revs, and per mechanism rather than over the total: the
    # tree exercises both, so either falling to zero means that reader stopped seeing its citations
    # while the other kept the run green.
    for mechanism, count in judged.items():
        if not count:
            problems.append(
                f"no {mechanism} citation was judged — that spelling or this parser is wrong"
            )
    return sum(judged.values())


def judge(revs, where, number, cited, pinned, context):
    """One citation against the ADR it names."""
    if cited not in revs:
        return [f"{where}:{number}: cites ADR {cited}, which is not an ADR — {context}"]
    if not pinned:
        return [f"{where}:{number}: cites ADR {cited} without a rev — {context}"]
    if int(pinned) != revs[cited]:
        return [f"{where}:{number}: pins ADR {cited} rev {pinned}, current is rev {revs[cited]}"]
    return []


def main():
    problems = []
    revs = current_revs(problems)
    judged = 0
    if revs:
        check_index(revs, problems)
        judged = check_citations(revs, problems)
    if problems:
        return fail(sorted(problems))
    print(f"{len(revs)} ADRs; {judged} citations, every one pinning the current rev")
    return 0


if __name__ == "__main__":
    sys.exit(main())
