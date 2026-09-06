#!/usr/bin/env python3
"""The `verify` job in `.github/workflows/publish.yml` holds no write scope.

Reads the workflow, locates the `verify` job, and fails unless its `permissions` mapping is
exactly `{contents: read}` and no step under it references `secrets.` — the `github.token`
expression is the one credential the job may read, by name (docs/CI.md § Publishing and
provenance). Fail-closed: not finding the job, or not finding its `permissions` block, fails
rather than passing over what it could not read.

No dependencies: Python stdlib only, plain text scanning (no YAML parser), matching
scripts/check-restart-policy.py's idiom.

What this has been run against, in both directions: cases/check-publish-permissions.md
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WORKFLOW = ".github/workflows/publish.yml"
JOB_NAME = "verify"
ALLOWED_PERMISSIONS = {"contents": "read"}
SECRETS_REFERENCE = re.compile(r"secrets\.")

# A mapping key and its indentation, matching scripts/check-restart-policy.py's KEY/scalar idiom.
KEY = re.compile(r"^(?P<indent>[^\S\n]*)(?P<name>[A-Za-z0-9_.-]+):(?P<value>[^\S\n].*)?$")

problems = []


def scalar(text):
    """A scalar as written, without a trailing comment or surrounding quotes."""
    value = re.sub(r"[^\S\n]#.*$", "", text or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value


def mapping_keys(lines):
    """Every mapping key in the file, as (line number, indent, name, value)."""
    found = []
    for number, line in enumerate(lines, start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = KEY.match(line)
        if match:
            found.append(
                (number, len(match.group("indent")), match.group("name"), match.group("value"))
            )
    return found


def block(keys, index):
    """The keys nested under keys[index], up to the next key at or above its indent."""
    indent = keys[index][1]
    nested = []
    for entry in keys[index + 1 :]:
        if entry[1] <= indent:
            break
        nested.append(entry)
    return nested


def block_end_line(lines, keys, index):
    """The last line number belonging to keys[index]'s own block (itself included) — the line
    before the next key at or above its indent, or end of file. Bounded this way rather than by
    the last nested key found: a step's body is list items, not mapping keys, so a scan anchored
    on the last matched key would stop before reaching it."""
    indent = keys[index][1]
    for entry in keys[index + 1 :]:
        if entry[1] <= indent:
            return entry[0] - 1
    return len(lines)


path = ROOT / WORKFLOW
if not path.is_file():
    problems.append(f"{WORKFLOW} is absent, so this read no workflow")
    keys = []
    lines = []
else:
    lines = path.read_text(encoding="utf-8").split("\n")
    keys = mapping_keys(lines)

jobs_indices = [index for index, entry in enumerate(keys) if entry[1] == 0 and entry[2] == "jobs"]
if path.is_file() and not jobs_indices:
    problems.append(f"{WORKFLOW} declares no top-level 'jobs:' key, or this cannot read this layout")

job_index = None
if jobs_indices:
    job_entries = block(keys, jobs_indices[0])
    if not job_entries:
        problems.append(f"{WORKFLOW}: 'jobs:' declares nothing under it")
    else:
        depth = min(entry[1] for entry in job_entries)
        for offset, entry in enumerate(job_entries):
            if entry[1] == depth and entry[2] == JOB_NAME:
                job_index = jobs_indices[0] + 1 + offset
                break
        if job_index is None:
            problems.append(f"{WORKFLOW}: no '{JOB_NAME}' job was found under 'jobs:'")

if job_index is not None:
    job_body = block(keys, job_index)
    depth = min((entry[1] for entry in job_body), default=None)
    permissions_indices = [
        job_index + 1 + offset
        for offset, entry in enumerate(job_body)
        if entry[1] == depth and entry[2] == "permissions"
    ]
    if not permissions_indices:
        problems.append(f"{WORKFLOW}: '{JOB_NAME}' declares no 'permissions:' block")
    else:
        grants = block(keys, permissions_indices[0])
        grant_depth = min((entry[1] for entry in grants), default=None)
        top_grants = [entry for entry in grants if entry[1] == grant_depth]
        found = {entry[2]: scalar(entry[3]) for entry in top_grants}
        if found != ALLOWED_PERMISSIONS:
            problems.append(
                f"{WORKFLOW}: '{JOB_NAME}' permissions are {found}, expected exactly "
                f"{ALLOWED_PERMISSIONS}"
            )

    end_line = block_end_line(lines, keys, job_index)
    for number in range(keys[job_index][0], end_line + 1):
        if SECRETS_REFERENCE.search(lines[number - 1]):
            problems.append(
                f"{WORKFLOW}:{number}: '{JOB_NAME}' references 'secrets.', the one credential "
                f"it may read is 'github.token'"
            )

if problems:
    print(f"check-publish-permissions: {len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print("  " + problem, file=sys.stderr)
    sys.exit(1)
print(f"'{JOB_NAME}' job permissions are exactly {ALLOWED_PERMISSIONS}, no 'secrets.' reference found.")
