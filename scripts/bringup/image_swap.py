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
from pathlib import Path

import common

MOUNT_TARGET = "/srv/kiosk/config.json"
VERSION_ANNOTATION = "org.opencontainers.image.version"


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
        raise common.HarnessError(
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
        raise common.HarnessError(
            f"`docker run {image_ref}` exited {completed.returncode} ({completed.stderr.strip()})"
        )
    return completed.stdout.strip()


def container_address(container):
    completed = subprocess.run(
        ["docker", "port", container, "8080"], capture_output=True, text=True
    )
    if completed.returncode != 0 or not completed.stdout.strip():
        raise common.HarnessError(
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
        raise common.HarnessError(
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
        raise common.HarnessError(
            f"`docker image inspect {image_id}` exited {completed.returncode} "
            f"({completed.stderr.strip()})"
        )
    repo_digests = json.loads(completed.stdout.strip()) or []
    if image_ref not in repo_digests:
        raise common.HarnessError(
            f"{container}'s image resolves to {repo_digests}, not {image_ref} — the running "
            f"image did not come from the registry pull alone"
        )


def resolve_version(image_ref):
    """The `org.opencontainers.image.version` annotation on the manifest image_ref names."""
    annotations, detail = common.imagetools_inspect(image_ref, ".Manifest.Annotations")
    if annotations is None:
        raise common.HarnessError(
            f"`docker buildx imagetools inspect {image_ref}` failed ({detail})"
        )
    version = (annotations or {}).get(VERSION_ANNOTATION)
    if not version:
        raise common.HarnessError(
            f"{image_ref}'s manifest carries no {VERSION_ANNOTATION} annotation"
        )
    return version


def run_and_assert(tag, digest):
    """Runs image@digest under the shared mount, asserts it, tears it down, returns its version."""
    image_ref = f"{common.IMAGE}@{digest}"
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        download_config(tag, directory)
        config_path = directory / "config.json"
        shutil.copy(directory / "config.example.json", config_path)
        container = None
        try:
            container = start_container(image_ref, config_path)
            assert_pulled_digest(container, image_ref)
            common.wait_healthy(container, common.healthcheck_deadline(image_ref))
            address = container_address(container)
            common.assert_config_served(address, config_path.read_bytes())
            version = resolve_version(image_ref)
            expected_version = tag[1:] if tag.startswith("v") else tag
            if version != expected_version:
                raise common.HarnessError(
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
            raise common.HarnessError(
                f"{args.tag_a} and {args.tag_b} both report version {version_a!r} — the swap "
                f"changed nothing"
            )
    except common.HarnessError as error:
        return fail(str(error))

    print(
        f"{args.tag_a} ({version_a}) and {args.tag_b} ({version_b}) each serve their mounted "
        f"configuration under the same mount arguments, with no builder invoked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
