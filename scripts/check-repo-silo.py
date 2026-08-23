#!/usr/bin/env python3
"""Tooling is siloed with the feature it serves: a depth-1 listing of the
repository root holds no manifest or environment directory, and every
Dependabot entry that is not github-actions names a directory holding the
manifest its ecosystem implies — non-root, docker excepted. See docs/CI.md
§ Repository shape.

No dependencies: Python stdlib only, plain text scanning (no YAML parser).

What this has been run against, in both directions: cases/check-repo-silo-py.md
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

problems = []


def listing(directory):
    try:
        return sorted((ROOT / directory).iterdir(), key=lambda path: path.name)
    except OSError:
        return None


ROOT_FORBIDDEN = [
    re.compile(r"^package\.json$"),
    re.compile(r"^go\.mod$"),
    re.compile(r"^pyproject\.toml$"),
    re.compile(r"^requirements.*\.txt$"),
    re.compile(r"^\.venv$"),
]

for entry in listing("."):
    if any(pattern.search(entry.name) for pattern in ROOT_FORBIDDEN):
        problems.append(
            f"'{entry.name}' sits at the repository root — silo it with the feature it serves"
        )

# Each ecosystem → the manifest patterns its Dependabot directory must hold.
# An ecosystem absent here fails rather than passing unmapped.
MANIFESTS = {
    "pip": [re.compile(r"^requirements.*\.txt$"), re.compile(r"^pyproject\.toml$")],
    "npm": [re.compile(r"^package\.json$")],
    "gomod": [re.compile(r"^go\.mod$")],
    "docker": [re.compile(r"^Dockerfile$")],
}

dependabot_text = (ROOT / ".github/dependabot.yml").read_text(encoding="utf-8")
entries = re.split(r"\n(?=\s*- package-ecosystem:)", dependabot_text)[1:]

# The split is this script's only view of the file, and a layout it does not anticipate yields no
# entries. The guard counts list items under `updates:` instead — deliberately sharing no assumption
# with the split, because a guard keyed on the same literal goes to zero alongside the thing it
# guards and the two then agree that nothing is wrong.
after_updates = re.split(r"^updates:[^\S\n]*$", dependabot_text, flags=re.M)
list_items = [
    len(line) - len(line.lstrip())
    for line in (after_updates[1] if len(after_updates) > 1 else "").split("\n")
    if re.match(r"\s*-\s", line)
]
# Only the shallowest list items are entries. A nested one belongs to a key an entry contains —
# `patterns:` written as a block list rather than inline — and counting those as entries fails a
# configuration that is merely spelled differently.
entry_depth = min(list_items, default=None)
declared = sum(1 for depth in list_items if depth == entry_depth)
# Asserted before the count, and sharing no assumption with the parser: a count derived from the
# same literal-matching goes to zero alongside the split, and the two then agree that nothing is
# wrong. No spelling of the keys can make a real entry list parse as empty.
if not entries:
    problems.append(
        ".github/dependabot.yml — no ecosystem entry parsed, so none was examined; either the file "
        "declares none, or check-repo-silo.py cannot read this layout"
    )
elif len(entries) != declared:
    problems.append(
        f".github/dependabot.yml holds {declared} entr(ies) under 'updates:' but {len(entries)} "
        f"parsed — check-repo-silo.py cannot read this layout, so the two disagree on what is there"
    )

checked = 0
actions = False
for entry in entries:
    ecosystem_match = re.search(r'^\s*- package-ecosystem:\s*"?([\w-]+)"?', entry, flags=re.M)
    ecosystem = ecosystem_match.group(1) if ecosystem_match else None
    if ecosystem == "github-actions":
        actions = True
        continue
    checked += 1
    directory_match = re.search(r'^\s*directory:\s*"?([^"\n]+?)"?\s*$', entry, flags=re.M)
    directory = directory_match.group(1) if directory_match else None
    if not directory:
        problems.append(f"the '{ecosystem}' Dependabot entry declares no 'directory' key")
        continue
    # docker alone may name the root: ADR 0021 rev 1 puts the Dockerfile there, a build reading
    # `PATH/Dockerfile` by default. Every other ecosystem's manifest is siloed with its feature.
    if directory == "/" and ecosystem != "docker":
        problems.append(f"the '{ecosystem}' Dependabot entry points at the repository root")
        continue
    patterns = MANIFESTS.get(ecosystem)
    if not patterns:
        problems.append(
            f"ecosystem '{ecosystem}' has no manifest mapping in check-repo-silo.py — add one"
        )
        continue
    contents = listing("." + directory)
    if contents is None:
        problems.append(
            f"the '{ecosystem}' Dependabot entry names '{directory}', which does not exist"
        )
        continue
    if not any(pattern.search(item.name) for item in contents for pattern in patterns):
        problems.append(
            f"the '{ecosystem}' Dependabot entry names '{directory}', which holds no "
            + " or ".join(pattern.pattern for pattern in patterns)
        )

# The loop above exempts github-actions from the manifest rule, so its entry is asserted to exist
# here instead. See docs/CI.md § Repository shape.
# Conditioned on the split above having produced entries: with none, the guard has already reported
# why, and this would add a claim about the file that the parse cannot support.
if entries and not actions:
    problems.append(
        ".github/dependabot.yml declares no 'github-actions' entry, so action pins go stale"
    )

# No recipe carries a shebang, read from just's own dump. See docs/CI.md § Repository shape.
just_dump = json.loads(
    subprocess.run(
        ["just", "--dump", "--dump-format", "json"], cwd=ROOT, capture_output=True, check=True
    ).stdout
)
recipes = just_dump.get("recipes")
# A module's recipes sit outside `recipes`, so a script hidden in one would pass unseen. A dump
# shape this does not recognise is reported too: `--dump` is a debug surface, not a stable schema,
# and a missing field would otherwise read as an affirmative "no script here".
modules = just_dump.get("modules")
if not isinstance(modules, dict):
    problems.append(
        "the justfile dump carries no `modules` map, so this cannot tell whether a module is declared"
    )
elif modules:
    problems.append(
        f"the justfile declares module(s) {', '.join(modules)}, whose recipes this does not read"
    )
# Asserted before the loop, which passes vacuously over an empty set and would then agree that a
# justfile this could not read holds no script.
if not recipes:
    problems.append("the justfile dump names no recipe, so nothing here judged it")
for name, recipe in (recipes or {}).items():
    if not isinstance(recipe.get("shebang"), bool):
        problems.append(
            f"the dump for recipe '{name}' carries no `shebang` field, so this judged nothing about it"
        )
        continue
    if recipe["shebang"]:
        problems.append(
            f"justfile recipe '{name}' is a shell script — move it under scripts/ and call it from a one-line recipe"
        )

if problems:
    print(f"check-repo-silo: tooling is not siloed ({len(problems)}):", file=sys.stderr)
    for problem in problems:
        print("  " + problem, file=sys.stderr)
    sys.exit(1)
print(
    f"Repository root holds no manifest, no justfile recipe is a shell script, github-actions is "
    f"covered, and {checked} Dependabot entr(ies) resolve to their manifests."
)
