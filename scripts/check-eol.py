#!/usr/bin/env python3
"""Every file git treats as text is LF-only, over the whole tracked tree.

`.gitattributes` decides which files git treats as text. Runs as the `check-eol` local hook in
`.pre-commit-config.yaml`, beside `mixed-line-ending` — which judges only the files pre-commit hands
it and counts one uniform ending kind as unmixed, so a committed-but-unstaged CRLF file and a
uniformly-CRLF file both pass it. This is authored for that remainder: the tracked tree, any CRLF
(ADR 0016 rev 3).

`git grep -lI` skips binary content; `-P` gives `\r` its perl-regex meaning. Exit 0 is a match —
this check's failure case — and 1 is none, which over an empty tracked tree reports success
(ADR 0016 rev 3 owner ruling). Any other status is the search itself failing, and is propagated.

What this has been run against, in both directions: cases/check-eol-py.md
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    result = subprocess.run(
        ["git", "grep", "-lIP", r"\r$", "--", "."],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        sys.stdout.write(result.stdout)
        print("CRLF found in the files above; the repo is LF-only (.gitattributes).", file=sys.stderr)
        return 1
    if result.returncode == 1:
        print("No CRLF line endings in the tracked tree.")
        return 0
    sys.stderr.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
