#!/usr/bin/env python3
"""The path the shipped bundle polls for liveness is the path the running mux answers.

The path is spelled twice across the client/server seam — `LIVENESS_URL` in
[`frontend/src/lib/liveness.ts`](../../frontend/src/lib/liveness.ts), which the page polls to decide
whether the backend is reachable, and `healthPath` in
[`backend/cmd/main.go`](../../backend/cmd/main.go), which the mux registers liveness at — and
nothing else holds the two together. A rename of either alone ships a kiosk whose page reports the
backend unreachable against a backend that is serving, and every other gate stays green: the render
tier mocks the route from the frontend constant, and the backend tests assert the mux from the Go
constant, so each side agrees with itself.

Three steps, over the built image rather than over the two source files, so what is judged is what
ships:

- **The polled path is read from the source constant.** A constant that is absent, or not a literal,
  is reported rather than guessed at — this cannot decide what a computed URL asks for.
- **That literal is in the shipped bundle.** The emitted scripts under the served tree are read for
  it: a constant that no shipped script carries is one this could not have measured the mux against.
- **A container answers it.** The path is asked of a running container and must answer 200 with
  something other than the served index — a 404 is the divergence, and an answer equal to the index
  is the path falling through to the static tree rather than reaching the liveness handler.

**Readiness is judged on the served index, not on the polled path.** Waiting on the path under test
would report a renamed route as a container that never came up, which names the wrong defect and
spends the whole bound doing it.

A consistent rename of both sides passes here, and is what the sibling harnesses' own restatements of
`/healthz` would fail on; this reports the path it read, so that failure is legible.

Usage: liveness_path.py [image-ref]
"""

import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LIVENESS_SOURCE = ROOT / "frontend" / "src" / "lib" / "liveness.ts"

DEFAULT_IMAGE = "wisekiosk:citest"

# The authored constant the page polls, as a literal, in any of the three ways TypeScript spells one
# and with or without the type annotation that does not change what is asked for. A URL assembled
# rather than declared matches nothing here — a base joined to a suffix, or a template interpolating
# one, which is why the backtick arm refuses `$`: what is captured has to be the whole path.
POLLED = re.compile(
    r"""export\s+const\s+LIVENESS_URL(?:\s*:\s*string)?\s*=\s*"""
    r"""(?:['"](?P<quoted>[^'"]+)['"]|`(?P<template>[^`$]+)`)"""
)

# The tree the image serves, and what an emitted script is named.
STATIC_ROOT = "srv/kiosk/"
SCRIPT_SUFFIX = ".js"

# What the served index is asked for by, liveness being what is under test.
INDEX_PATH = "/"

# How long a container is given to answer, and how often it is asked. A bound rather than a wait: a
# container that never serves must fail this rather than hang the gate.
READY_TIMEOUT = 30.0
READY_INTERVAL = 0.2


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


class DockerError(Exception):
    """A docker command that did not run, or did not succeed."""


def docker(*arguments, stdout=subprocess.PIPE):
    """A docker command's stdout, captured, or written to the file handed in its place."""
    try:
        finished = subprocess.run(["docker", *arguments], stdout=stdout, stderr=subprocess.PIPE)
    except OSError as error:
        raise DockerError(f"docker could not be run ({error})") from error
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        raise DockerError(f"`docker {' '.join(arguments)}` exited {finished.returncode} ({detail})")
    return (finished.stdout or b"").decode(errors="replace")


def polled_path(problems):
    """The path the page polls, from the constant the frontend authors it in."""
    try:
        source = LIVENESS_SOURCE.read_text(encoding="utf-8")
    except OSError as error:
        problems.append(
            f"{LIVENESS_SOURCE.relative_to(ROOT)} could not be read ({error}) — this read no polled "
            f"path, so it cannot report the mux answering one"
        )
        return None

    found = POLLED.search(source)
    if not found:
        problems.append(
            f"{LIVENESS_SOURCE.relative_to(ROOT)} declares no LIVENESS_URL string literal — this "
            f"read no polled path, and cannot decide what a computed URL asks for"
        )
        return None
    return found.group("quoted") or found.group("template")


def shipped_scripts(image, directory):
    """The emitted scripts under the served tree, as name and bytes."""
    container = docker("create", image).strip()
    archive = Path(directory) / "image.tar"
    try:
        with archive.open("wb") as sink:
            docker("export", container, stdout=sink)
    finally:
        docker("rm", "--force", container)

    scripts = {}
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            # A member name is written either bare or relative; `removeprefix` rather than `lstrip`,
            # which strips characters and would rename a dotfile at the root.
            name = member.name.removeprefix("./")
            if not name.startswith(STATIC_ROOT) or not name.endswith(SCRIPT_SUFFIX):
                continue
            handle = tar.extractfile(member)
            if handle is not None:
                scripts[name] = handle.read()
    return scripts


def check_shipped(image, path, problems):
    """The polled path is a literal the shipped bundle carries."""
    with tempfile.TemporaryDirectory() as directory:
        scripts = shipped_scripts(image, directory)

    if not scripts:
        problems.append(
            f"the export holds no {SCRIPT_SUFFIX} under /{STATIC_ROOT} — this read no shipped "
            f"bundle, so it cannot report what the bundle polls"
        )
        return 0, 0

    wanted = path.encode()
    carrying = [name for name, content in scripts.items() if wanted in content]
    if not carrying:
        problems.append(
            f"no script of the {len(scripts)} under /{STATIC_ROOT} carries {path} — the constant "
            f"the frontend polls is not in what the image ships, so the answer below judges a path "
            f"nothing asks for"
        )
    return len(carrying), len(scripts)


def address(container):
    """The host address the container's port is published on."""
    return docker("port", container, "8080/tcp").strip().split("\n")[0]


def fetch(base, path):
    """The status and body of a GET, an error status reported rather than raised."""
    try:
        with urllib.request.urlopen(f"http://{base}{path}", timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def wait_index(base, problems):
    """Poll the served index until the container answers it, or report that it never did."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        try:
            status, body = fetch(base, INDEX_PATH)
        except OSError:
            time.sleep(READY_INTERVAL)
            continue
        if status == 200:
            return body
        time.sleep(READY_INTERVAL)
    problems.append(
        f"no 200 from {INDEX_PATH} within {READY_TIMEOUT:.0f}s — this judged no serving container, "
        f"so it read no answer to the polled path"
    )
    return None


def check_answered(image, path, problems):
    """A running container answers the polled path with liveness rather than with the index."""
    container = docker("run", "--rm", "--detach", "--publish", "127.0.0.1::8080", image).strip()
    try:
        base = address(container)
        index = wait_index(base, problems)
        if index is None:
            return
        status, body = fetch(base, path)
        if status != 200:
            problems.append(
                f"the bundle polls {path} and the container answered {status} — the page would "
                f"report the backend unreachable against a backend that is serving"
            )
        elif body == index:
            problems.append(
                f"{path} answered the served index rather than liveness — the polled path reaches "
                f"the static tree, not the handler the mux registers liveness at"
            )
    finally:
        docker("stop", "--timeout", "2", container)


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    carrying, scripts = 0, 0
    try:
        path = polled_path(problems)
        if path is not None:
            carrying, scripts = check_shipped(image, path, problems)
            check_answered(image, path, problems)
    except DockerError as error:
        return fail([f"{error} — this judged no image"])

    if problems:
        return fail(problems)
    print(
        f"{image} ships {path} in {carrying} of {scripts} script(s) under /{STATIC_ROOT}, and a "
        f"container answers it 200 with something other than the served index"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
