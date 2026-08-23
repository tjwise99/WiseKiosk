#!/usr/bin/env python3
"""Two instances of one image share nothing.

SRS029<!-- One instance, one configuration, nothing shared with another --> is what
[`../../SECURITY.md`](../../SECURITY.md) rests on when it says an instance serves exactly one
configuration, and it is decided by running two of them at once rather than by reading either alone.
Three assertions, none of which the others imply:

- **Each serves its own configuration, and neither reflects the other's.** Two different fixtures on
  two ports, each container asked for both — the second direction is what a shared cache or a
  process-wide static would fail.
- **The image declares no shared writable volume.** An image carrying no deployment content still
  permits one, and two containers given the same declared volume would share it while every other
  assertion here passed.
- **Stopping one leaves the other serving.** The healthcheck the image itself declares is run inside
  the survivor, rather than a command restated here, so what is asserted is the check a deployment's
  orchestrator acts on.

Usage: two_instances.py [image-ref]
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

CONFIG_PATH = "/srv/kiosk/config.json"
CONFIG_URL = "/config.json"
HEALTH_URL = "/healthz"

READY_TIMEOUT = 30.0
READY_INTERVAL = 0.2

# What the declared healthcheck's argument vector is introduced by, and is not part of.
HEALTHCHECK_FORMS = {"CMD", "CMD-SHELL", "NONE"}


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
    """A detached container from the image, its port published on an ephemeral loopback port."""
    return docker(
        "run", "--rm", "--detach",
        "--publish", "127.0.0.1::8080",
        "--volume", f"{mount}:{CONFIG_PATH}:ro",
        image,
    ).strip()


def address(container):
    """The host address the container's port is published on."""
    return docker("port", container, "8080/tcp").strip().split("\n")[0]


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
        f"no 200 from {HEALTH_URL} within {READY_TIMEOUT:.0f}s — this judged nothing that "
        f"container served"
    )
    return False


def check_volumes(image, problems):
    """The image declares no volume: nothing two containers would be given in common."""
    volumes = json.loads(docker("image", "inspect", "--format", "{{json .Config.Volumes}}", image))
    if volumes:
        problems.append(
            f"{image} declares volume(s) {', '.join(sorted(volumes))} — a declared volume is "
            f"writable storage two instances can be pointed at together"
        )


def healthcheck(image, problems):
    """The argument vector the image's own HEALTHCHECK runs."""
    declared = json.loads(docker("image", "inspect", "--format", "{{json .Config.Healthcheck}}", image))
    test = (declared or {}).get("Test") or []
    if not test or test[0] not in HEALTHCHECK_FORMS or test[0] == "NONE":
        problems.append(
            f"{image} declares no healthcheck to run — this cannot assert a survivor answers one"
        )
        return None
    return test[1:]


def check_isolation(image, fixtures, problems):
    """Each instance serves its own configuration, and stopping one leaves the other serving."""
    check = healthcheck(image, problems)
    containers = [start(image, fixture) for fixture in fixtures]
    try:
        bases = [address(container) for container in containers]
        for base in bases:
            if not wait_ready(base, problems):
                return

        served = []
        for base in bases:
            status, body = fetch(base, CONFIG_URL)
            if status != 200:
                problems.append(f"{base}{CONFIG_URL} answered {status}, expected 200")
                return
            served.append(body)

        for index, (body, fixture) in enumerate(zip(served, fixtures)):
            if body != fixture.read_bytes():
                problems.append(
                    f"instance {index} serves {len(body)} byte(s) that are not its own fixture's"
                )
            other = fixtures[1 - index].read_bytes()
            if body == other:
                problems.append(f"instance {index} serves the other instance's configuration")

        docker("stop", "--timeout", "2", containers[1])
        containers.pop()

        if check is not None:
            try:
                docker("exec", containers[0], *check)
            except DockerError as error:
                problems.append(f"the surviving instance failed its declared healthcheck: {error}")
        status, body = fetch(bases[0], CONFIG_URL)
        if status != 200 or body != fixtures[0].read_bytes():
            problems.append(
                f"the surviving instance answered {status} at {CONFIG_URL} after the other stopped"
            )
    finally:
        for container in containers:
            docker("stop", "--timeout", "2", container)


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory).chmod(0o755)
        fixtures = []
        for index in range(2):
            fixture = Path(directory) / f"config-{index}.json"
            fixture.write_text(
                json.dumps({"wisekiosk": f"instance {index}", "nonce": str(time.time_ns())}) + "\n",
                encoding="utf-8",
            )
            fixture.chmod(0o644)
            fixtures.append(fixture)

        try:
            check_volumes(image, problems)
            check_isolation(image, fixtures, problems)
        except DockerError as error:
            problems.append(f"{error} — this judged no image")

    if problems:
        return fail(problems)
    print(
        f"two instances of {image} each served only their own configuration, the image declares no "
        f"volume, and the survivor answered its declared healthcheck after the other stopped"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
