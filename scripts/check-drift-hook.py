#!/usr/bin/env python3
"""The `TST` document still arms the referenced-file drift hook.

`item_sha_required` makes `doorstop review` record a hash of each referenced file, and the
document's `item_validator` hook is what compares it back — together they are gate 1's drift
half (ADR 0005 rev 2). Both are declared in the `extensions:` block of
docs/requirements/tst/.doorstop.yml, and nothing else in the toolchain defends that block.
It is lost or disarmed two ways. A hand or tooling edit: `Document` stores `extensions`
raw, so an unrecognised key raises nothing where an unrecognised `attributes` key errors,
and `extensons:` therefore disarms the hook in silence. Or `Document.save()`, which
rebuilds the config from `settings` and `attributes` alone and drops `extensions` entirely
— reached by `Document.new()` and by the `prefix`/`sep`/`digits`/`parent` setters, not by
`doorstop add` or a reorder, neither of which saves the config. A disarmed hook fails no
run — it reports a clean tree over drifted evidence, which is the shape of failure this
record exists to catch.

The value is asserted as well as the key. Doorstop tests `"item_sha_required" in
extensions`, so `false` also enables hashing; a config saying `false` while hashing is on
would be read by the next person as a switch that had been thrown.

Two keys, and any others in the block go unjudged: `item_sha_buffer_size` is Doorstop's own,
and a closed set asserted here would fail on it and on whatever it gains next.

No dependencies: Python stdlib only, plain text scanning (no YAML parser), matching
scripts/check-restart-policy.py's idiom.

What this has been run against, in both directions: cases/check-drift-hook-py.md
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = "docs/requirements/tst/.doorstop.yml"
HOOK = "item_validator"
REQUIRED = {"item_sha_required": "true", HOOK: ".req_sha_item_validator.py"}

# A mapping key and its indentation. A list item, a blank line, a comment and a continuation
# all miss.
KEY = re.compile(r"^(?P<indent>[^\S\n]*)(?P<name>[A-Za-z0-9_.-]+):(?P<value>[^\S\n].*)?$")

problems = []


def scalar(text):
    """A scalar as written, without a trailing comment or surrounding quotes."""
    value = re.sub(r"[^\S\n]#.*$", "", text or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value


def extensions(lines):
    """Every key directly under a top-level `extensions:`, as {name: scalar}."""
    found = {}
    depth = None
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = KEY.match(line)
        if not match:
            continue
        indent = len(match.group("indent"))
        if depth is None:
            if indent == 0 and match.group("name") == "extensions":
                depth = -1
            continue
        if indent == 0:
            break
        if depth == -1:
            depth = indent
        if indent == depth:
            found[match.group("name")] = scalar(match.group("value"))
    return found


path = ROOT / CONFIG
declared = {}
if not path.is_file():
    problems.append(f"{CONFIG} is absent, so this read no configuration")
else:
    declared = extensions(path.read_text(encoding="utf-8").split("\n"))
    # A block this cannot parse yields no key, and every assertion below would then report a
    # missing key rather than an unreadable file. Saying which it is costs one line.
    if not declared:
        problems.append(
            f"{CONFIG} declares no top-level 'extensions' block, or check-drift-hook.py cannot "
            f"read this layout — either way no extension key was examined"
        )

for name, expected in sorted(REQUIRED.items()):
    if name not in declared:
        problems.append(
            f"{CONFIG}: 'extensions' declares no '{name}', so a referenced test can drift from "
            f"its review unreported"
        )
    elif declared[name] != expected:
        problems.append(
            f"{CONFIG}: 'extensions.{name}' is '{declared[name]}', expected '{expected}'"
        )

if declared.get(HOOK):
    hook = path.parent / declared[HOOK]
    if not hook.is_file():
        problems.append(
            f"{CONFIG}: 'extensions.{HOOK}' names {declared[HOOK]}, which is not a file beside it"
        )

if problems:
    print(f"check-drift-hook: the TST document's drift hook ({len(problems)}):", file=sys.stderr)
    for problem in problems:
        print("  " + problem, file=sys.stderr)
    sys.exit(1)
named = ", ".join(f"{name}: {declared[name]}" for name in sorted(REQUIRED))
print(f"{CONFIG} arms the drift hook — {named}; hook file present beside it.")
