"""Exists only on the throwaway seed/codeql-2026-09-05 branch, to prove CodeQL's
py/command-line-injection query fires against the production analysis. Never merged."""

import subprocess
import sys


def run(name):
    subprocess.run(f"echo {name}", shell=True)


if __name__ == "__main__":
    run(sys.argv[1])
