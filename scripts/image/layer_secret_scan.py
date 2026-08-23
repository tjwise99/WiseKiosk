#!/usr/bin/env python3
"""No layer of the published image carries anything shaped like a secret, and a planted one is seen.

SRS025<!-- No secret material in the published image --> is asserted against every layer rather than
against the filesystem a container sees: a file added and then deleted is gone from the flattened
tree and still shipped in the layer that added it, which is the case an export alone cannot report.
The image is saved, every blob in the archive is opened — each layer's members one by one, and each
non-layer blob (the image configuration and its manifests, which is where a baked environment lives)
as itself — and every byte matched against
[`secret-patterns.txt`](secret-patterns.txt), the committed enumeration that gives "secret material"
an oracle.

**A scan that cannot see a secret would pass on an image full of them**, so this proves the scan
before it reports the image: a throwaway image is built carrying a freshly generated canary in a
layer it then deletes, the same machinery is run over it, and the canary must come back. A run where
it does not fails here whatever the real image scanned clean. That is also what stands behind the
blob-by-blob reading above — a layer written in a compression this cannot open is read as opaque
bytes, and the canary is what reports it, because a canary planted in an unopenable layer is not
found. The canary is generated per run rather than committed — a committed one is a
credential-shaped string in the tree, and one that never changes is a value the scan could come to
recognise by accident.

A run that resolves no pattern, or opens no layer, fails: neither judged anything.

Usage: layer_secret_scan.py [image-ref]
"""

import io
import re
import secrets
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PATTERNS = HERE / "secret-patterns.txt"
DEFAULT_IMAGE = "wisekiosk:citest"

# The throwaway image the canary is planted in, and the alphabet the canary is drawn from — an AWS
# access key id's shape, which the pattern set describes by its issuer's prefix.
CANARY_IMAGE = "wisekiosk-canary:layer-secret-scan"
CANARY_PREFIX = "AKIA"
CANARY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
CANARY_LENGTH = 16
CANARY_PATH = "/tmp/planted"


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


def patterns(problems):
    """The committed enumeration, compiled. A pattern that does not compile is not skipped."""
    if not PATTERNS.is_file():
        problems.append(f"{PATTERNS.name} is absent — this matched against no enumeration")
        return []

    compiled = []
    for number, line in enumerate(PATTERNS.read_text(encoding="utf-8").split("\n"), start=1):
        source = line.strip()
        if not source or source.startswith("#"):
            continue
        try:
            compiled.append((number, source, re.compile(source)))
        except re.error as error:
            problems.append(f"{PATTERNS.name}:{number} does not compile ({error})")
    if not compiled:
        problems.append(f"{PATTERNS.name} declares no pattern — this matched against nothing")
    return compiled


def contents(archive):
    """Every blob in a saved image, as (where, bytes) pairs, with the layer count beside them.

    A blob that opens as a tar is a layer and is read member by member; one that does not is read as
    itself, which is what reaches the image configuration and the manifests.
    """
    layers, blobs = 0, []
    with tarfile.open(archive) as outer:
        for member in outer.getmembers():
            if not member.isfile():
                continue
            data = outer.extractfile(member).read()
            try:
                with tarfile.open(fileobj=io.BytesIO(data)) as inner:
                    entries = [
                        (f"{member.name}!{entry.name}", inner.extractfile(entry).read())
                        for entry in inner.getmembers()
                        if entry.isfile()
                    ]
            except tarfile.TarError:
                blobs.append((member.name, data))
                continue
            layers += 1
            blobs.extend(entries)
    return layers, blobs


def scan(image, compiled, problems):
    """Every match of the enumeration over every layer of the image, and how much was read."""
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / "image.tar"
        with archive.open("wb") as sink:
            docker("save", image, stdout=sink)
        layers, blobs = contents(archive)

    if not layers:
        problems.append(f"{image} saved with no layer this could open — this read no layer")

    findings = []
    for where, data in blobs:
        text = data.decode("latin-1")
        for number, source, expression in compiled:
            for found in expression.finditer(text):
                findings.append((where, number, source, found.group(0)))
    return layers, len(blobs), findings


def redacted(value):
    """A match reported by length. The pattern it matched is printed beside it and says the shape,
    so nothing is served by reproducing any of the value."""
    return f"{len(value)} chars, value not reproduced"


def check_canary(image, compiled, problems):
    """The same machinery, run over an image carrying a canary in a layer it deletes."""
    canary = CANARY_PREFIX + "".join(
        secrets.choice(CANARY_ALPHABET) for _ in range(CANARY_LENGTH)
    )
    with tempfile.TemporaryDirectory() as directory:
        context = Path(directory)
        (context / "planted").write_text(canary + "\n", encoding="utf-8")
        (context / "Dockerfile").write_text(
            f"FROM {image}\n"
            f"USER root\n"
            f"COPY planted {CANARY_PATH}\n"
            f"RUN rm -f {CANARY_PATH}\n",
            encoding="utf-8",
        )
        try:
            docker("build", "--tag", CANARY_IMAGE, str(context))
            _, _, findings = scan(CANARY_IMAGE, compiled, problems)
        finally:
            docker("image", "rm", "--force", CANARY_IMAGE)

    if not any(value == canary for _, _, _, value in findings):
        problems.append(
            f"the canary planted in {CANARY_PATH} was not reported — this scan cannot see a secret "
            f"in a layer, so its clean result on the real image says nothing"
        )
    return canary


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE

    problems = []
    compiled = patterns(problems)
    if problems:
        return fail(problems)

    try:
        layers, blobs, findings = scan(image, compiled, problems)
        problems.extend(
            f"{where} matches {PATTERNS.name}:{number} ({source}): {redacted(value)}"
            for where, number, source, value in findings
        )
        canary = check_canary(image, compiled, problems)
    except DockerError as error:
        return fail(problems + [f"{error} — this judged no image"])

    if problems:
        return fail(problems)
    print(
        f"{len(compiled)} pattern(s) over {blobs} file(s) in {layers} layer(s) of {image}: no match; "
        f"a canary planted and deleted in a throwaway layer was reported ({len(canary)} chars)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
