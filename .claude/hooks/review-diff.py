#!/usr/bin/env python3
"""Stop hook: surface review-checklist questions scoped to what the turn changed.

Reads CONTRIBUTING.md's "## Review checklist" section, groups its numbered
questions under their **Group** heading, and maps the paths the turn changed
to those groups (union — a path can pull in more than one group). Prints the
matching questions, deduped, one line per question as number and name only,
to stderr and exits 2 so the model reads them before the turn ends.

Fires at most once per prompt_id: there is no documented stop_hook_active
field for the Stop event, so a marker file under the system temp dir is the
loop guard. Never fails the session on its own error — any internal problem
exits 0 silently rather than raising.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

GUARD_DIR = os.path.join(tempfile.gettempdir(), "claude-review-diff-hook")


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt_id = payload.get("prompt_id") if isinstance(payload, dict) else None
    if not isinstance(prompt_id, str) or not prompt_id:
        return 0

    if not claim_prompt_id(prompt_id):
        return 0

    try:
        repo_root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or "."

        changed = changed_paths(repo_root)
        if not changed:
            return 0

        groups_needed = select_groups(changed)
        if not groups_needed:
            return 0

        groups = parse_checklist(os.path.join(repo_root, "CONTRIBUTING.md"))

        seen = set()
        questions = []
        for name in groups_needed:
            for number, title in groups.get(name, []):
                if number in seen:
                    continue
                seen.add(number)
                questions.append((int(number), number, title.rstrip(".")))

        if not questions:
            return 0

        questions.sort(key=lambda q: q[0])
        lines = [f"{number}. {title}" for _, number, title in questions]
        message = "Review checklist questions for what this turn changed:\n" + "\n".join(lines)
        sys.stderr.write(message + "\n")
        return 2
    except Exception:
        return 0


def claim_prompt_id(prompt_id):
    """Return True the first time this prompt_id is seen, False every time after."""
    try:
        os.makedirs(GUARD_DIR, exist_ok=True)
        marker = os.path.join(GUARD_DIR, prompt_id)
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        return False
    except Exception:
        return False


def changed_paths(repo_root):
    """Union of git status --porcelain, git diff --name-only, and its staged form."""
    paths = set()

    status = run_git(repo_root, ["status", "--porcelain"])
    if status is not None:
        for line in status.splitlines():
            if len(line) <= 3:
                continue
            entry = line[3:]
            paths.update(split_rename(entry))

    for diff_args in (["diff", "--name-only"], ["diff", "--name-only", "--staged"]):
        out = run_git(repo_root, diff_args)
        if out is None:
            continue
        for line in out.splitlines():
            if line:
                paths.add(line.strip())

    paths.discard("")
    return paths


def split_rename(entry):
    if " -> " in entry:
        return [p.strip().strip('"') for p in entry.split(" -> ")]
    return [entry.strip().strip('"')]


def run_git(repo_root, args):
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    return result.stdout


GROUP_RE = re.compile(r"^\*\*([^*]+)\*\*\s*$")
ITEM_RE = re.compile(r"^(\d+)\.\s+\*\*([^*]+)\*\*")


def parse_checklist(contributing_path):
    """Group -> [(number, title), ...], parsed from '## Review checklist'."""
    with open(contributing_path, encoding="utf-8") as f:
        text = f.read()

    heading = "## Review checklist"
    start = text.find(heading)
    if start == -1:
        return {}
    section = text[start + len(heading):]
    next_h2 = re.search(r"\n## ", section)
    if next_h2:
        section = section[: next_h2.start()]

    groups = {}
    current_group = None

    for line in section.splitlines():
        gmatch = GROUP_RE.match(line)
        if gmatch:
            current_group = gmatch.group(1).strip()
            continue

        imatch = ITEM_RE.match(line)
        if imatch and current_group is not None:
            number, title = imatch.group(1), imatch.group(2).strip()
            groups.setdefault(current_group, []).append((number, title))

    return groups


def select_groups(changed):
    """Map changed paths to CONTRIBUTING.md Review checklist **Group** names (union)."""
    needed = set()
    for path in changed:
        norm = path.replace(os.sep, "/")
        if norm.startswith("docs/requirements/"):
            needed.add("Requirements")
        if norm.startswith("scripts/"):
            needed.add("Checks")
        if norm.startswith("docs/architecture/") or norm == "docs/ARCHITECTURE.md":
            needed.add("Architecture")
        if norm.endswith(".md"):
            needed.add("Documentation")
            needed.add("Prose")
        else:
            needed.add("Code")
            needed.add("Comments")
    return needed


if __name__ == "__main__":
    sys.exit(main())
