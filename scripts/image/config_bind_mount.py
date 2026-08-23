#!/usr/bin/env python3
"""The configuration a deployment mounts is what the image serves, and nothing stands in for it.

SRS018<!-- One generic published image --> puts the configuration outside the image, which leaves
two things to settle about the running container, and they are opposite halves of one claim:

- **With a mount**, the bytes served at `/config.json` are the mounted file's, byte for byte. A
  comparison of parsed JSON would pass on a re-serialisation, and re-serialising is exactly the kind
  of quiet transformation a display page reading its own configuration cannot afford.
- **With no mount**, `/config.json` is 404. A baked default would serve *something* here, and a
  deployment whose mount silently failed would come up looking configured.

The fixture is arbitrary JSON written per run: what is asserted is fidelity, so its content only has
to be recognisable, and a fixture that is not committed cannot drift into being the default it exists
to disprove.

Usage: config_bind_mount.py [image-ref]
"""

import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_IMAGE = "wisekiosk:citest"

# Where a deployment binds its configuration, and the URL the display page fetches it from.
CONFIG_PATH = "/srv/kiosk/config.json"
CONFIG_URL = "/config.json"
HEALTH_URL = "/healthz"

# How long a container is given to answer, and how often it is asked. A bound rather than a wait:
# a container that never answers must fail this rather than hang the gate.
READY_TIMEOUT = 30.0
READY_INTERVAL = 0.2


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


class DockerError(Exception):
    """A docker command that did not run, or did not succeed."""


def docker(*arguments):
    """A docker command's stdout."""
    try:
        finished = subprocess.run(["docker", *arguments], capture_output=True)
    except OSError as error:
        raise DockerError(f"docker could not be run ({error})") from error
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        raise DockerError(f"`docker {' '.join(arguments)}` exited {finished.returncode} ({detail})")
    return finished.stdout.decode(errors="replace")


def start(image, mount):
    """A detached container from the image, its port published on an ephemeral loopback port.

    An ephemeral port rather than a fixed one: two of these run side by side under TST011, and a
    fixed port would make them collide with each other and with whatever else the host is running.
    """
    arguments = ["run", "--rm", "--detach", "--publish", "127.0.0.1::8080"]
    if mount is not None:
        arguments += ["--volume", f"{mount}:{CONFIG_PATH}:ro"]
    return docker(*arguments, image).strip()


def address(container):
    """The host address the container's port is published on."""
    published = docker("port", container, "8080/tcp").strip().split("\n")[0]
    return published


def fetch(base, path):
    """The status and body of a GET, with a 404 reported as a status rather than raised."""
    try:
        with urllib.request.urlopen(f"http://{base}{path}", timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def wait_ready(base, problems):
    """Poll liveness until the container answers, or report that it never did."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        try:
            status, _ = fetch(base, HEALTH_URL)
        except OSError:
            time.sleep(READY_INTERVAL)
            continue
        if status == 200:
            return True
        time.sleep(READY_INTERVAL)
    problems.append(
        f"no 200 from {HEALTH_URL} within {READY_TIMEOUT:.0f}s — this judged nothing the "
        f"container served"
    )
    return False


def check_mounted(image, fixture, problems):
    """The served configuration is the mounted file, byte for byte."""
    container = start(image, fixture)
    try:
        base = address(container)
        if not wait_ready(base, problems):
            return
        status, body = fetch(base, CONFIG_URL)
        if status != 200:
            problems.append(f"{CONFIG_URL} answered {status} with the fixture mounted, expected 200")
        elif body != fixture.read_bytes():
            problems.append(
                f"{CONFIG_URL} served {len(body)} byte(s) that are not the mounted fixture's "
                f"{fixture.stat().st_size} — the mounted configuration is not what reaches the page"
            )
    finally:
        docker("stop", "--timeout", "2", container)


def check_unmounted(image, problems):
    """With no mount, the configuration path serves nothing."""
    container = start(image, None)
    try:
        base = address(container)
        if not wait_ready(base, problems):
            return
        status, body = fetch(base, CONFIG_URL)
        if status != 404:
            problems.append(
                f"{CONFIG_URL} answered {status} with no mount, expected 404 — the image serves "
                f"{len(body)} byte(s) of a default nobody deployed"
            )
    finally:
        docker("stop", "--timeout", "2", container)


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    with tempfile.TemporaryDirectory() as directory:
        fixture = Path(directory) / "config.json"
        fixture.write_text(
            json.dumps({"wisekiosk": "bind-mount fixture", "nonce": str(time.time_ns())}) + "\n",
            encoding="utf-8",
        )
        # The container runs as a non-root user it does not choose, so the fixture is readable by
        # anyone; a mount the process cannot open would fail this as a missing mount would.
        Path(directory).chmod(0o755)
        fixture.chmod(0o644)
        try:
            check_mounted(image, fixture, problems)
            check_unmounted(image, problems)
        except DockerError as error:
            problems.append(f"{error} — this judged no image")

    if problems:
        return fail(problems)
    print(
        f"{image} serves the mounted configuration byte for byte at {CONFIG_URL}, and answers 404 "
        f"there with no mount"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
