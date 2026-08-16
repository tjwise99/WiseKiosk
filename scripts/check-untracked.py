#!/usr/bin/env python3
"""No untracked, non-ignored file is present in the tree.

Several gates derive their population from `git ls-files`, which lists tracked files only — an
untracked file is invisible to each of them, so a defect in one passes locally and fails in CI once
committed. This fails on any untracked, non-ignored file, so the fix is `git add` (judged) or a
gitignore entry (declared not material). Each `git ls-files`-based gate also guards its own
population; the pairing is defence-in-depth, per docs/CI.md § Repository shape.

A CI checkout holds only tracked files, so this never fires there; the population it gates exists
only in a working tree.

What this has been run against, in both directions: cases/check-untracked-py.md
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    # check=True: a git failure (exit 128 outside a repository) raises rather than reading as an
    # empty listing, so a run that could not ask the question cannot report a clean tree.
    listing = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        capture_output=True,
        check=True,
    ).stdout
    names = sorted(name.decode() for name in listing.split(b"\0") if name)
    if names:
        print(
            f"{len(names)} untracked, non-ignored file(s) — invisible to every gate whose "
            "population is `git ls-files`:",
            file=sys.stderr,
        )
        for name in names:
            print(f"  {name}", file=sys.stderr)
        print("\n`git add` each file so the gates judge it, or gitignore it.", file=sys.stderr)
        return 1
    print("no untracked, non-ignored file; the tracked population is the whole tree.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
