#!/usr/bin/env python3
"""The image comes up and serves on the architecture it was built for.

SRS019<!-- The backend runs on both supported architectures --> is settled one architecture at a
time, by a matrix that builds the image for each and runs this over what it loaded. What a leg has
to establish about its own artifact is that it runs at all, two ways:

- **It answers on its port.** A container is started with its port published and asked for liveness
  until it answers or the bound elapses. A binary built for another architecture, or one that cannot
  start under the emulation a foreign leg runs on, never answers here.
- **It answers the healthcheck it declares itself.** The vector the image's own `HEALTHCHECK`
  carries, run inside the container: the image's binary started a second time, on the container's
  architecture rather than this host's, asking the serving process the question a deployment's
  orchestrator asks.

**The architecture is the caller's.** This is handed an image ref and nothing else, so what
architecture was smoke-tested is decided by the leg that built the ref; the image's declared platform
is printed rather than asserted, there being nothing here to assert it against.

Deliberately not a re-run of the property harnesses beside it: coming up and serving is what varies
with architecture, and the configuration, layer and isolation obligations hold of the image on either.

Usage: smoke.py [image-ref]
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_IMAGE = "wisekiosk:citest"

HEALTH_URL = "/healthz"

# How long a container is given to answer, and how often it is asked. A bound rather than a wait: a
# container that never answers must fail this rather than hang the gate.
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


def start(image):
    """A detached container from the image, its port published on an ephemeral loopback port."""
    return docker(
        "run", "--rm", "--detach",
        "--publish", "127.0.0.1::8080",
        image,
    ).strip()


def address(container):
    """The host address the container's port is published on."""
    return docker("port", container, "8080/tcp").strip().split("\n")[0]


def fetch(base, path):
    """The status of a GET, with a 404 reported as a status rather than raised."""
    try:
        with urllib.request.urlopen(f"http://{base}{path}", timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def wait_ready(base, problems):
    """Poll liveness until the container answers, or report that it never did."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        try:
            status = fetch(base, HEALTH_URL)
        except OSError:
            time.sleep(READY_INTERVAL)
            continue
        if status == 200:
            return True
        time.sleep(READY_INTERVAL)
    problems.append(
        f"no 200 from {HEALTH_URL} within {READY_TIMEOUT:.0f}s — nothing this image was built for "
        f"came up serving"
    )
    return False


def platform(image):
    """The platform the image declares, which is what a leg loaded rather than what it asked for."""
    return docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", image).strip()


def healthcheck(image, problems):
    """The argument vector the image's own HEALTHCHECK runs."""
    declared = json.loads(docker("image", "inspect", "--format", "{{json .Config.Healthcheck}}", image))
    test = (declared or {}).get("Test") or []
    if not test or test[0] not in HEALTHCHECK_FORMS or test[0] == "NONE":
        problems.append(
            f"{image} declares no healthcheck to run — this cannot assert the container answers one"
        )
        return None
    return test[1:]


def check_serving(image, problems):
    """A container from the image answers on its port, and answers its declared healthcheck."""
    check = healthcheck(image, problems)
    container = start(image)
    try:
        if not wait_ready(address(container), problems):
            return
        if check is not None:
            try:
                docker("exec", container, *check)
            except DockerError as error:
                problems.append(f"the container failed the healthcheck the image declares: {error}")
    finally:
        docker("stop", "--timeout", "2", container)


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    try:
        declared = platform(image)
        check_serving(image, problems)
    except DockerError as error:
        return fail([f"{error} — this judged no image"])

    if problems:
        return fail(problems)
    print(
        f"{image} ({declared}) came up, answered {HEALTH_URL}, and passed the healthcheck it "
        f"declares"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
