#!/usr/bin/env python3
"""The checked-out branch is named type_number-snake_name.

Runs as the `branch-shape` local pre-push hook in `.pre-commit-config.yaml` — advisory fast
feedback; the binding gate is CI's `process` check (`just check-branch`), which also resolves the
issue via the API. The pattern is defined once in scripts/branch-shape.regex, shared with
check-branch.sh. `main` and `dependabot/*` are exempt, and a detached HEAD names no branch to judge.

What this has been run against, in both directions: cases/branch-shape-py.md
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    result = subprocess.run(
        ["git", "symbolic-ref", "--short", "-q", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return 0
    branch = result.stdout.strip()
    if branch == "main" or branch.startswith("dependabot/"):
        return 0
    pattern = (ROOT / "scripts" / "branch-shape.regex").read_text().strip()
    if not re.search(pattern, branch):
        print(
            f"branch-shape: branch '{branch}' does not match type_number-snake_name "
            "(see scripts/branch-shape.regex).",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
