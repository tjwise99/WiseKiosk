#!/usr/bin/env python3
"""The published image carries nothing a deployment supplies.

SRS018<!-- One generic published image --> bars deployment-specific content from the artifact, which
is two assertions about two surfaces:

- **The filesystem.** The image is exported and read for the configuration path. Nothing may sit
  there: a file at that path is what a bind mount would shadow, so an image carrying one serves it to
  every deployment that forgets the mount, and the failure is silent by construction.
- **The image environment.** No variable naming a secret's file
  ([ADR 0024 rev 1](../../docs/decisions/0024-secret-file-delivery.md) fixes that as `<NAME>_FILE`,
  which is a deployment's to set and not an image's to carry), no value naming the configuration
  file, and no variable named for something the configuration schema declares.

What makes a value deployment-specific is not decidable in general, so the third arm ranges over what
the schema declares: every property name the configuration schema carries, at any depth, is a name a
deployment supplies a value for, and an image carrying one in its environment carries that
deployment's answer. The comparison folds case, because the schema spells a property `edge_band`
while an environment spells the same thing `EDGE_BAND` — matching only the schema's own spelling
would range over the vocabulary while missing every conventional way of writing it. A schema that
declares nothing would range over nothing, and is reported rather than passed.

The export is read for the served tree as well as against it: an export holding nothing under the
static root judged nothing, and must not read as an image free of deployment content.

Usage: no_deployment_content.py [image-ref]
"""

import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA = ROOT / "frontend" / "src" / "config" / "schema.json"

DEFAULT_IMAGE = "wisekiosk:citest"

# Where a deployment binds its configuration, and the tree the image serves it from.
CONFIG_PATH = "srv/kiosk/config.json"
STATIC_ROOT = "srv/kiosk/"

# The name shape ADR 0024 rev 1 gives a secret's delivery, and the file a deployment supplies.
SECRET_SUFFIX = "_FILE"
CONFIG_NAME = "config.json"


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


def exported(image, directory):
    """The image's filesystem, as the member names of a container exported from it."""
    container = docker("create", image).strip()
    archive = Path(directory) / "image.tar"
    try:
        with archive.open("wb") as sink:
            docker("export", container, stdout=sink)
    finally:
        docker("rm", "--force", container)
    with tarfile.open(archive) as tar:
        # A member name is written either bare or relative; `removeprefix` rather than `lstrip`,
        # which strips characters and would rename a dotfile at the root.
        return [name.removeprefix("./") for name in tar.getnames()]


def check_filesystem(image, problems):
    """Nothing sits at the configuration path, in an export that reached the served tree."""
    with tempfile.TemporaryDirectory() as directory:
        names = exported(image, directory)

    if not any(name.startswith(STATIC_ROOT) for name in names):
        problems.append(
            f"the export holds nothing under /{STATIC_ROOT} — this read no served tree, so it "
            f"cannot report what the served tree does not carry"
        )
    if CONFIG_PATH in names:
        problems.append(
            f"/{CONFIG_PATH} exists in the image — a deployment's configuration is bind-mounted "
            f"there, and a file underneath it is served wherever the mount is missing"
        )
    return len(names)


def declared_names(problems):
    """Every property name the configuration schema declares, at any depth, keyed on its folded
    form and carrying the spelling the schema gave it."""
    try:
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        problems.append(
            f"{SCHEMA.relative_to(ROOT)} could not be read as a schema ({error}) — this ranged over "
            f"no declared name"
        )
        return {}

    names = {}
    pending = [schema]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict):
                names.update((str(key).casefold(), str(key)) for key in properties)
            pending.extend(node.values())
        elif isinstance(node, list):
            pending.extend(node)

    if not names:
        problems.append(
            f"{SCHEMA.relative_to(ROOT)} declares no property — this ranged over no declared name, "
            f"so it cannot report an environment free of them"
        )
    return names


def check_environment(image, declared, problems):
    """No variable naming a secret's file or a name the schema declares, and no value naming the
    configuration file."""
    config = json.loads(docker("image", "inspect", "--format", "{{json .Config}}", image))
    if not isinstance(config, dict) or not config:
        problems.append(f"{image} inspected to no image configuration — this judged no environment")
        return []

    environment = config.get("Env") or []
    for entry in environment:
        name = entry.split("=", 1)[0]
        if name.endswith(SECRET_SUFFIX):
            problems.append(
                f"the image environment carries {name}, which names a secret's file — a deployment "
                f"sets that, and an image carrying one is specific to the deployment that set it"
            )
        if name.casefold() in declared:
            problems.append(
                f"the image environment carries {name}, which the configuration schema declares as "
                f"{declared[name.casefold()]} — a deployment supplies that value, and an image "
                f"carrying one carries its answer"
            )
        if CONFIG_NAME in entry.split("=", 1)[-1]:
            problems.append(
                f"the image environment carries {entry!r}, which names the configuration file a "
                f"deployment supplies"
            )
    return environment


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    declared = declared_names(problems)
    try:
        members = check_filesystem(image, problems)
        environment = check_environment(image, declared, problems)
    except DockerError as error:
        return fail([f"{error} — this judged no image"])

    if problems:
        return fail(problems)
    print(
        f"{members} exported path(s) and {len(environment)} environment entr(ies) in {image}: "
        f"nothing at /{CONFIG_PATH}, no {SECRET_SUFFIX} variable, no configuration file named, and "
        f"none of the {len(declared)} name(s) the configuration schema declares"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
