#!/usr/bin/env python3
"""The image's health signal moves with the backend: healthy while it serves, unhealthy while it
does not.

docs/CI.md § Deployment and bring-up: a signal only ever observed in the healthy state cannot be
told from a hardcoded success. Both states are read from one command — the argument vector the
image's own `HEALTHCHECK` declares, rather than a command restated here, so what is asserted is the
signal a container runtime reports on.

- **Serving.** The declared vector, run inside a container that answers liveness, exits 0.
- **Not serving.** The same vector, run in a container of its own where nothing is listening, exits
  non-zero. A container's health is judged from inside its own network namespace, which is what
  makes the second direction a container rather than a stopped server.

Docker reserves 125, 126 and 127 for a container that never ran the command; the second direction
treats those as having judged nothing, so a vector that cannot be executed does not read as a
correctly reported failure.

Usage: health_signal.py [image-ref]
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_IMAGE = "wisekiosk:citest"

HEALTH_URL = "/healthz"

READY_TIMEOUT = 30.0
READY_INTERVAL = 0.2

# The declared form this can run both inside a running container and as a container's entrypoint.
# A shell-form declaration is one string rather than a vector, and is reported rather than run.
HEALTHCHECK_FORM = "CMD"

# What docker returns when the container did not run the command it was given.
DOCKER_RESERVED = {125, 126, 127}


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


class DockerError(Exception):
    """A docker command that did not run, or did not succeed."""


def run(*arguments):
    """A docker command's exit status and stderr, whatever the status."""
    try:
        finished = subprocess.run(["docker", *arguments], capture_output=True)
    except OSError as error:
        raise DockerError(f"docker could not be run ({error})") from error
    detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
    return finished.returncode, detail, finished.stdout.decode(errors="replace")


def docker(*arguments):
    """A docker command's stdout."""
    status, detail, stdout = run(*arguments)
    if status != 0:
        raise DockerError(f"`docker {' '.join(arguments)}` exited {status} ({detail})")
    return stdout


def declared(image, problems):
    """The argument vector the image's own HEALTHCHECK runs."""
    healthcheck = json.loads(
        docker("image", "inspect", "--format", "{{json .Config.Healthcheck}}", image)
    )
    test = (healthcheck or {}).get("Test") or []
    if not test or test[0] != HEALTHCHECK_FORM:
        problems.append(
            f"{image} declares no {HEALTHCHECK_FORM}-form healthcheck ({test or 'nothing'}) — "
            f"this read no signal in either direction"
        )
        return None
    return test[1:]


def address(container):
    """The host address the container's port is published on."""
    return docker("port", container, "8080/tcp").strip().split("\n")[0]


def wait_ready(base, problems):
    """Poll liveness until the container answers, or report that it never did."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://{base}{HEALTH_URL}", timeout=5) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.HTTPError):
            pass
        time.sleep(READY_INTERVAL)
    problems.append(
        f"no 200 from {HEALTH_URL} within {READY_TIMEOUT:.0f}s — this judged no serving container"
    )
    return False


def check_serving(image, vector, problems):
    """A container that is serving reports healthy."""
    container = docker("run", "--rm", "--detach", "--publish", "127.0.0.1::8080", image).strip()
    try:
        if not wait_ready(address(container), problems):
            return
        status, detail, _ = run("exec", container, *vector)
        if status != 0:
            problems.append(
                f"the declared healthcheck exited {status} ({detail}) in a container answering "
                f"{HEALTH_URL} — the signal reports unhealthy while the backend serves"
            )
    finally:
        docker("stop", "--timeout", "2", container)


def check_not_serving(image, vector, problems):
    """The same signal, where nothing is serving, reports unhealthy."""
    status, detail, _ = run("run", "--rm", "--entrypoint", vector[0], image, *vector[1:])
    if status in DOCKER_RESERVED:
        problems.append(
            f"the declared healthcheck could not be run on its own ({status}: {detail}) — this "
            f"judged nothing about the unhealthy direction"
        )
    elif status == 0:
        problems.append(
            f"the declared healthcheck exited 0 with nothing listening — the signal reports "
            f"healthy in both states, so a healthy verdict from it means nothing"
        )


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    try:
        vector = declared(image, problems)
        if vector is not None:
            check_serving(image, vector, problems)
            check_not_serving(image, vector, problems)
    except DockerError as error:
        problems.append(f"{error} — this judged no image")

    if problems:
        return fail(problems)
    print(
        f"{image}'s declared healthcheck exits 0 in a serving container and non-zero where nothing "
        f"is listening"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
