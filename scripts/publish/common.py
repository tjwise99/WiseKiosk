#!/usr/bin/env python3
"""Helpers the publish-time SBOM/attestation producer and the verify job's checks all call.

docs/CI.md § Publishing and provenance: the platform children of a pushed release image are read
from the index rather than hardcoded, by `docker buildx imagetools inspect`, in
scripts/publish/sbom_attest.py, scripts/publish/verify_metadata.py and
scripts/publish/verify_release.py alike. Matches the shared-helper shape
scripts/bringup/common.py already takes for the same command against a different field.
"""

import json
import subprocess


class CheckError(Exception):
    """A command this module ran did not produce what its caller needed."""


def imagetools_inspect(ref, digest, format=None, raw=False):
    """`docker buildx imagetools inspect` against ref@digest, parsed as JSON.

    Exactly one of `format` (a Go template, e.g. '{{json .Manifest}}') or `raw` (the manifest's own
    JSON, unformatted) is given.
    """
    args = ["docker", "buildx", "imagetools", "inspect", f"{ref}@{digest}"]
    if raw:
        args.append("--raw")
    else:
        args.extend(["--format", format])
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise CheckError(f"`{' '.join(args)}` exited {result.returncode}: {result.stderr.strip()}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise CheckError(f"`{' '.join(args)}`: output did not parse as JSON: {error}") from error


def read_children(ref, digest):
    """Every platform child of the index at ref@digest, as [{"digest": ..., "platform": "os/arch"}]."""
    manifest = imagetools_inspect(ref, digest, format="{{json .Manifest}}")
    return [
        {
            "digest": entry["digest"],
            "platform": f"{entry['platform']['os']}/{entry['platform']['architecture']}",
        }
        for entry in manifest.get("manifests", [])
    ]
