#!/usr/bin/env python3
"""The boundary drift gate can fail, proven by seeding the drift it must catch.

`docs/CI.md` § Generated boundary types requires each side to be seeded independently — the
committed types edited away from what the schema produces, one language at a time, each asserted to
exit non-zero — and a regeneration of both to exit zero. A gate reporting "no drift" is
indistinguishable from a gate pointed at the wrong tree, so the only evidence it works is a seeded
failure ([ADR 0010 rev 1](../docs/decisions/0010-runtime-materialised-gate-fixtures.md)).

**The seed is committed, not merely written.** `check-boundary` clears the generated directories and
regenerates them before it diffs, so an edit left in the working tree is deleted by the gate's own
first step and measures nothing. What the gate compares is a regeneration against `HEAD`, which is
what the seed has to move.

Everything runs in a temp copy of the tracked tree with a history of its own, never in the working
tree: the gate rewrites the generated directories and commits are made against the seed. The gate is
invoked as `just check-boundary` rather than as a restatement of its steps — a second spelling would
prove the wrong thing.

`frontend/node_modules` is untracked, so it is symlinked into the copy; the Go module cache is
already shared.

What this has been run against, in both directions: cases/check-boundary.md
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GATE = ["just", "check-boundary"]

GO_TYPES = "backend/internal/boundary/boundary.gen.go"
TS_TYPES = "frontend/src/lib/boundary/schema.ts"
NODE_MODULES = "frontend/node_modules"

# Each seed renames a field the schema decides, which is drift the generators express. A seed that
# only reformatted would be invisible to a regeneration and would pass for the wrong reason.
SEEDS = {
    GO_TYPES: ("Message string", "MessageDrifted string"),
    TS_TYPES: ("message: string", "messageDrifted: string"),
}

IDENTITY = ["-c", "user.name=selftest", "-c", "user.email=selftest@invalid"]


def git(destination, *arguments, check=True):
    return subprocess.run(
        ["git", *arguments], cwd=destination, check=check, capture_output=True, text=True
    )


def tracked():
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout
    return [name.decode() for name in listing.split(b"\0") if name]


def materialise(destination):
    """The tracked tree, copied file by file and committed, with the untracked npm silo linked in."""
    for name in tracked():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target, follow_symlinks=False)

    silo = ROOT / NODE_MODULES
    if not silo.is_dir():
        sys.exit(
            f"{NODE_MODULES} is absent, so the TypeScript generator cannot run and this check would "
            f"report a failure it never measured — run `npm --prefix frontend ci` first."
        )
    (destination / NODE_MODULES).symlink_to(silo)

    git(destination, "init", "-q")
    git(destination, "add", "-A")
    git(destination, *IDENTITY, "commit", "-qm", "fixture")
    return git(destination, "rev-parse", "HEAD").stdout.strip()


def seed(destination, name):
    """Drift one language's types and commit them. The edit is asserted to land: a seed that
    silently fails to apply looks exactly like a gate that works."""
    path = destination / name
    before = path.read_text(encoding="utf-8")
    old, new = SEEDS[name]
    after = before.replace(old, new, 1)
    if after == before:
        sys.exit(f"the seed for {name} matched nothing, so nothing below it measures the gate")
    path.write_text(after, encoding="utf-8")
    git(destination, "add", "--", name)
    git(destination, *IDENTITY, "commit", "-qm", f"seed drift into {name}")


def gate(destination):
    return subprocess.run(GATE, cwd=destination, capture_output=True, text=True)


def report(label, outcome):
    """The run's own output. Captured so a passing self-test is quiet, and printed whenever a
    result is not the expected one — a bare verdict in a CI log says nothing about why."""
    print(f"--- {label}: `{' '.join(outcome.args)}` exited {outcome.returncode}", file=sys.stderr)
    for stream in (outcome.stdout, outcome.stderr):
        if stream:
            print(stream, end="" if stream.endswith("\n") else "\n", file=sys.stderr)


def main():
    failures = []
    with tempfile.TemporaryDirectory() as workspace:
        destination = Path(workspace) / "tree"
        destination.mkdir()
        baseline = materialise(destination)

        # The baseline first: with an unseeded copy failing, every seeded run below would report
        # non-zero for a reason that has nothing to do with the seed.
        outcome = gate(destination)
        if outcome.returncode != 0:
            report("unseeded copy", outcome)
            sys.exit(
                "the gate fails on an unseeded copy of the tree, so this fixture measures nothing "
                "— fix `just check-boundary` before reading any result below"
            )

        for name in (GO_TYPES, TS_TYPES):
            seed(destination, name)
            outcome = gate(destination)
            if outcome.returncode == 0:
                failures.append(f"{name} committed away from the schema, and the gate passed")
                report(f"{name} seeded", outcome)
            git(destination, "reset", "--hard", "-q", baseline)

        # Both sides seeded, then regenerated and committed: what the gate reports afterwards is the
        # half saying drift is clearable rather than only detectable.
        for name in (GO_TYPES, TS_TYPES):
            seed(destination, name)
        regeneration = subprocess.run(
            ["just", "codegen"], cwd=destination, capture_output=True, text=True
        )
        if regeneration.returncode != 0:
            report("regeneration", regeneration)
            sys.exit("`just codegen` failed, so the regeneration case measured nothing")
        git(destination, "add", "-A")
        git(destination, *IDENTITY, "commit", "-qm", "regenerate both sides")
        outcome = gate(destination)
        if outcome.returncode != 0:
            failures.append("both sides regenerated from the schema, and the gate still failed")
            report("regenerated", outcome)

    if failures:
        print(f"{len(failures)} problem(s) with the boundary drift gate:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1

    print(
        "The boundary drift gate fails on seeded Go drift, fails on seeded TypeScript drift, and "
        "passes once both are regenerated."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
