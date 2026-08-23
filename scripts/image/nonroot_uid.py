#!/usr/bin/env python3
"""The image runs as a non-root user, and says so.

SRS020<!-- Non-root container user --> is decidable on the artifact rather than on a deployment, and
this reads it from the artifact two independent ways:

- **What a container actually runs as.** `id -u` inside a container started from the image, which is
  the effective uid the process holds however it was arrived at.
- **What the image declares.** A `USER` instruction in the committed Dockerfile's final stage, naming
  something other than root. A container running non-root because of a daemon default would satisfy
  the first alone, and the declaration is what survives a rebuild elsewhere.

The Dockerfile is read for its *final* stage only: an earlier stage running as root is a build-time
property that ships no layer, and folding the two together would fail a legitimate multi-stage build.

Usage: nonroot_uid.py [image-ref]
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DOCKERFILE = ROOT / "Dockerfile"
DEFAULT_IMAGE = "wisekiosk:citest"

# A stage boundary, and the user a stage declares. `USER name:group` and a bare uid both parse here.
FROM = re.compile(r"^\s*FROM\s", re.IGNORECASE)
USER = re.compile(r"^\s*USER\s+(\S+)", re.IGNORECASE)

# What root is called, by name and by id.
ROOT_USER = {"root", "0"}


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


def docker(arguments, problems):
    """A docker command's stdout, or None with the reason recorded."""
    try:
        finished = subprocess.run(["docker", *arguments], capture_output=True)
    except OSError as error:
        problems.append(f"docker could not be run ({error}) — this judged no image")
        return None
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        problems.append(
            f"`docker {' '.join(arguments)}` exited {finished.returncode} ({detail}) — "
            f"this judged no image"
        )
        return None
    return finished.stdout.decode(errors="replace")


def running_uid(image, problems):
    """The effective uid a container started from the image holds."""
    stdout = docker(["run", "--rm", "--entrypoint", "id", image, "-u"], problems)
    if stdout is None:
        return None
    text = stdout.strip()
    if not re.fullmatch(r"\d+", text):
        problems.append(f"`id -u` in the container printed {text!r}, which is not a uid")
        return None
    uid = int(text)
    if uid == 0:
        problems.append(f"{image} runs as uid 0 — the container process holds root")
    return uid


def declared_user(problems):
    """The user the committed Dockerfile's final stage declares."""
    if not DOCKERFILE.is_file():
        problems.append("Dockerfile is absent — this read no declaration")
        return None

    declared = None
    for line in DOCKERFILE.read_text(encoding="utf-8").split("\n"):
        if FROM.match(line):
            declared = None
            continue
        found = USER.match(line)
        if found:
            declared = found.group(1)

    if declared is None:
        problems.append(
            "the Dockerfile's final stage declares no USER — the image would run as root wherever "
            "no daemon default intervenes"
        )
    elif declared.split(":")[0] in ROOT_USER:
        problems.append(f"the Dockerfile's final stage declares USER {declared}, which is root")
    return declared


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    uid = running_uid(image, problems)
    declared = declared_user(problems)

    if problems:
        return fail(problems)
    print(f"{image} declares USER {declared} and runs as uid {uid}, which is not root")
    return 0


if __name__ == "__main__":
    sys.exit(main())
