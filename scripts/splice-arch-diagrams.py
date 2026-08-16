#!/usr/bin/env python3
"""The Mermaid diagrams embedded in docs/ARCHITECTURE.md are generated, never
hand-maintained: each `<!-- arch-export:begin <file> -->` …
`<!-- arch-export:end <file> -->` marker pair is rewritten from the named
artifact under docs/architecture/, wrapped in a ```mermaid fence. Enforces the
"one definition, many generated views" rule for the embedded diagrams — a hand
edit inside a marker region is overwritten here and caught by the staleness
gate. Exits non-zero on unpaired or malformed markers, a marker naming a
missing (or escaping) artifact, or a document with no markers at all.

Run as the final step of `just arch-export`. No dependencies: Python stdlib only.

What this has been run against, in both directions: cases/check-arch.md
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_PATH = ROOT / "docs" / "ARCHITECTURE.md"
ARTIFACT_ROOT = ROOT / "docs" / "architecture"


def fail(msg):
    print(f"splice-arch-diagrams: {msg}", file=sys.stderr)
    sys.exit(1)


text = TARGET_PATH.read_text(encoding="utf-8")
markers = [
    {"kind": m.group(1), "name": m.group(2), "start": m.start(), "end": m.end()}
    for m in re.finditer(r"<!-- arch-export:(begin|end) (\S+) -->", text)
]

if len(markers) == 0:
    fail("no arch-export markers found in docs/ARCHITECTURE.md")
if len(markers) % 2 != 0:
    fail("odd number of arch-export markers — an unpaired begin or end")

out = ""
cursor = 0
for i in range(0, len(markers), 2):
    begin = markers[i]
    end = markers[i + 1]
    if begin["kind"] != "begin" or end["kind"] != "end" or begin["name"] != end["name"]:
        fail(
            f"malformed marker pair: '{begin['kind']} {begin['name']}' followed by "
            f"'{end['kind']} {end['name']}'"
        )
    artifact = os.path.normpath(os.path.join(ARTIFACT_ROOT, begin["name"]))
    if not artifact.startswith(str(ARTIFACT_ROOT) + os.sep):
        fail(f"{begin['name']}: escapes docs/architecture/")
    if not os.path.exists(artifact):
        fail(f"{begin['name']}: no such generated artifact under docs/architecture/")
    # The guard above tests the marker text; this tests where the file actually is. A symlink under
    # docs/architecture/ satisfies the first and still reads from anywhere on the host.
    if not os.path.realpath(artifact).startswith(os.path.realpath(ARTIFACT_ROOT) + os.sep):
        fail(f"{begin['name']}: resolves outside docs/architecture/ through a symlink")
    if not os.path.isfile(artifact):
        fail(f"{begin['name']}: is not a regular file")
    body = Path(artifact).read_text(encoding="utf-8")
    if not body.endswith("\n"):
        body += "\n"
    # The body is about to be wrapped in a ```mermaid fence: a fence marker inside it would close
    # that fence early and splice the remainder into the document as running Markdown.
    if re.search(r"^\s*```", body, flags=re.M):
        fail(f"{begin['name']}: contains a ``` fence marker, which would break the generated fence")
    out += text[cursor : begin["end"]]
    out += "\n\n```mermaid\n" + body + "```\n\n"
    cursor = end["start"]
out += text[cursor:]

if out != text:
    TARGET_PATH.write_bytes(out.encode("utf-8"))
print(
    f"Spliced {len(markers) // 2} generated diagram(s) into docs/ARCHITECTURE.md"
    f"{' (already current)' if out == text else ''}."
)
