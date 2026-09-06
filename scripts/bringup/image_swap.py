#!/usr/bin/env python3
"""Two published digests answer the same mount arguments, one after the other.

docs/CI.md § Deployment and bring-up: digest A runs under a mounted configuration and an
ephemeral published port; is asserted healthy, serving that configuration, and reporting its own
version; is stopped and removed; digest B runs under byte-identical mount arguments and is
asserted the same way — with no builder invoked at either step. Version is read from the OCI
`org.opencontainers.image.version` annotation on the manifest each digest names, and the two
versions must differ, each equalling its own release tag with the leading `v` stripped.

Usage: image_swap.py <tag_a> <digest_a> <tag_b> <digest_b>
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

IMAGE = "ghcr.io/tjwise99/wisekiosk"
MOUNT_TARGET = "/srv/kiosk/config.json"
CONFIG_URL = "/config.json"
VERSION_ANNOTATION = "org.opencontainers.image.version"

# Docker's own substitution for a HEALTHCHECK declaration naming no interval, retries or start
# period, in the units `docker image inspect` itself reports (nanoseconds).
DEFAULT_INTERVAL_NS = 30_000_000_000
DEFAULT_RETRIES = 3
DEFAULT_START_PERIOD_NS = 0

HEALTH_POLL_INTERVAL = 1.0


class ImageSwapError(Exception):
    """A run's mount, health, configuration or version assertion did not hold."""


def fail(problem):
    print(f"image-swap: {problem}", file=sys.stderr)
    return 1


def download_config(tag, directory):
    completed = subprocess.run(
        [
            "gh",
            "release",
            "download",
            tag,
            "--pattern",
            "config.example.json",
            "--dir",
            str(directory),
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`gh release download {tag}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )


def start_container(image_ref, config_path):
    completed = subprocess.run(
        [
            "docker",
            "run",
            "--detach",
            "--pull",
            "always",
            "--volume",
            f"{config_path}:{MOUNT_TARGET}:ro",
            "--publish",
            "127.0.0.1::8080",
            image_ref,
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`docker run {image_ref}` exited {completed.returncode} ({completed.stderr.strip()})"
        )
    return completed.stdout.strip()


def container_address(container):
    completed = subprocess.run(
        ["docker", "port", container, "8080"], capture_output=True, text=True
    )
    if completed.returncode != 0 or not completed.stdout.strip():
        raise ImageSwapError(
            f"`docker port {container} 8080` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    return completed.stdout.strip().split("\n")[0]


def assert_pulled_digest(container, image_ref):
    """The running container's image resolves to the requested digest — no builder invoked."""
    completed = subprocess.run(
        ["docker", "inspect", "--format", "{{json .Image}}", container],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`docker inspect {container}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    image_id = json.loads(completed.stdout.strip())
    completed = subprocess.run(
        ["docker", "image", "inspect", "--format", "{{json .RepoDigests}}", image_id],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`docker image inspect {image_id}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    repo_digests = json.loads(completed.stdout.strip()) or []
    if image_ref not in repo_digests:
        raise ImageSwapError(
            f"{container}'s image resolves to {repo_digests}, not {image_ref} — the running "
            f"image did not come from the registry pull alone"
        )


def healthcheck_deadline(image_ref):
    """The deadline a container from image_ref is given to reach Docker health status healthy."""
    completed = subprocess.run(
        ["docker", "image", "inspect", "--format", "{{json .Config.Healthcheck}}", image_ref],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`docker image inspect {image_ref}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    healthcheck = json.loads(completed.stdout.strip()) or {}
    interval = healthcheck.get("Interval") or DEFAULT_INTERVAL_NS
    retries = healthcheck.get("Retries") or DEFAULT_RETRIES
    start_period = healthcheck.get("StartPeriod") or DEFAULT_START_PERIOD_NS
    return (start_period + interval * (retries + 1)) / 1_000_000_000


def wait_healthy(container, deadline_seconds):
    deadline = time.monotonic() + deadline_seconds
    status = None
    while time.monotonic() < deadline:
        completed = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Health.Status}}", container],
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            raise ImageSwapError(
                f"`docker inspect {container}` exited {completed.returncode} "
                f"({completed.stderr.strip()})"
            )
        status = completed.stdout.strip()
        if status == "healthy":
            return
        if status == "unhealthy":
            raise ImageSwapError(f"{container} reported unhealthy before reaching healthy")
        time.sleep(HEALTH_POLL_INTERVAL)
    raise ImageSwapError(
        f"{container} did not reach healthy within {deadline_seconds:.0f}s, derived from its "
        f"declared healthcheck (last status {status!r})"
    )


def assert_config_served(container, config_path):
    """`GET /config.json` returns the mounted configuration, byte for byte."""
    address = container_address(container)
    expected = config_path.read_bytes()
    try:
        with urllib.request.urlopen(f"http://{address}{CONFIG_URL}", timeout=5) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    if status != 200:
        raise ImageSwapError(f"{CONFIG_URL} answered {status}, expected 200")
    if body != expected:
        raise ImageSwapError(
            f"{CONFIG_URL} served {len(body)} byte(s) that are not the mounted configuration's "
            f"{len(expected)} — the mount did not reach the page"
        )


def resolve_version(image_ref):
    """The `org.opencontainers.image.version` annotation on the manifest image_ref names."""
    completed = subprocess.run(
        [
            "docker",
            "buildx",
            "imagetools",
            "inspect",
            "--format",
            "{{json .Manifest.Annotations}}",
            image_ref,
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise ImageSwapError(
            f"`docker buildx imagetools inspect {image_ref}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    annotations = json.loads(completed.stdout.strip()) or {}
    version = annotations.get(VERSION_ANNOTATION)
    if not version:
        raise ImageSwapError(f"{image_ref}'s manifest carries no {VERSION_ANNOTATION} annotation")
    return version


def run_and_assert(tag, digest):
    """Runs `image@digest` under the shared mount, asserts it, tears it down, returns its version."""
    image_ref = f"{IMAGE}@{digest}"
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        download_config(tag, directory)
        config_path = directory / "config.json"
        shutil.copy(directory / "config.example.json", config_path)
        container = None
        try:
            container = start_container(image_ref, config_path)
            assert_pulled_digest(container, image_ref)
            wait_healthy(container, healthcheck_deadline(image_ref))
            assert_config_served(container, config_path)
            version = resolve_version(image_ref)
            expected_version = tag[1:] if tag.startswith("v") else tag
            if version != expected_version:
                raise ImageSwapError(
                    f"{image_ref} reports version {version!r}, expected {expected_version!r} "
                    f"from tag {tag}"
                )
            return version
        finally:
            if container is not None:
                subprocess.run(["docker", "stop", container], capture_output=True, text=True)
                subprocess.run(["docker", "rm", container], capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tag_a")
    parser.add_argument("digest_a")
    parser.add_argument("tag_b")
    parser.add_argument("digest_b")
    args = parser.parse_args()

    try:
        version_a = run_and_assert(args.tag_a, args.digest_a)
        version_b = run_and_assert(args.tag_b, args.digest_b)
        if version_a == version_b:
            raise ImageSwapError(
                f"{args.tag_a} and {args.tag_b} both report version {version_a!r} — the swap "
                f"changed nothing"
            )
    except ImageSwapError as error:
        return fail(str(error))

    print(
        f"{args.tag_a} ({version_a}) and {args.tag_b} ({version_b}) each serve their mounted "
        f"configuration under the same mount arguments, with no builder invoked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
