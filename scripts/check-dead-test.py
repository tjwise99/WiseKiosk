#!/usr/bin/env python3
"""Every committed test file falls under a configured runner's reach.

[`docs/CI.md`](../docs/CI.md) § *Gate wiring* states what this asserts. The population is the
tracked, test-named files the repository carries; the reach is the union of what each configured
runner says it would discover, asked of the runners themselves rather than restated here as a
second copy of their globs. A file in the difference is dead: it is committed, it looks like a
test, and nothing executes it — the failure a green test run cannot report, because a runner that
never discovered a file has nothing to say about it.

- **Population**, by name and repository-wide: Go's `*_test.go`, and the frontend's `*.test.ts`,
  `*.spec.ts`, `*.test.tsx` and `*.spec.tsx`. Deliberately broader than any one runner's own
  configuration — a `.spec.ts` under `frontend/src/`, where Vitest matches only `.test.ts`, is a
  candidate precisely so that the glob gap is visible rather than definitional.
- **Reach**, from each runner's own discovery: `go list -json`'s `TestGoFiles` and `XTestGoFiles`,
  which respect build tags and the host's filename suffixes; `vitest list --filesOnly`; and
  `playwright test --list`. There is no per-file allowlist to append to
  ([ADR 0010 rev 2](../docs/decisions/0010-runtime-materialised-gate-fixtures.md) rules out a
  hand-maintained per-file list), so a file that stops being reached is closed by wiring it to a
  runner or by deleting it.

**Fail-closed on both ends.** A discovery command that fails leaves the reach unmeasured, so the
run reports that rather than a difference computed against a partial set — an unreachable runner
must not read as a tree of unreached files, and neither may it read as clean. An empty population
fails too: a run that resolved no test file judged nothing.

What this has been run against, in both directions: cases/check-dead-test-py.md
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Repository-wide, by name: what a reader would call a test file, whatever any runner is configured
# to pick up.
CANDIDATES = ("*_test.go", "*.test.ts", "*.spec.ts", "*.test.tsx", "*.spec.tsx")

VITEST = ROOT / "frontend" / "node_modules" / ".bin" / "vitest"
PLAYWRIGHT = ROOT / "frontend" / "node_modules" / ".bin" / "playwright"


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


def run(command, failures, **kwargs):
    """A discovery command's stdout, or None with the reason recorded. A runner that cannot be run
    and one that exits non-zero are the same case here: neither measured a reach."""
    try:
        finished = subprocess.run(command, cwd=ROOT, capture_output=True, **kwargs)
    except OSError as error:
        failures.append(f"{command[0]} could not be run ({error}) — this measured no reach")
        return None
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        failures.append(
            f"`{' '.join(command)}` exited {finished.returncode} ({detail}) — this measured no reach"
        )
        return None
    return finished.stdout.decode()


def tracked():
    """The population: every tracked path whose name says it is a test."""
    listing = subprocess.run(
        ["git", "ls-files", "-z", "--", *CANDIDATES],
        cwd=ROOT, capture_output=True, check=True,
    ).stdout
    return {name.decode() for name in listing.split(b"\0") if name}


def untracked():
    """Untracked, non-ignored paths — outside the population above, so reported rather than
    silently unjudged."""
    listing = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "-z"],
        cwd=ROOT, capture_output=True, check=True,
    ).stdout
    return [name.decode() for name in listing.split(b"\0") if name]


def relative(path):
    """A discovered path as the repository-relative POSIX spelling the population is keyed on, or
    None where it lands outside the tree."""
    resolved = Path(path).resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return None


def go_reach(failures):
    """What `go list` says the module's test files are — build tags and the host's `_GOOS` filename
    suffixes already applied, which is why the runner is asked rather than the filenames read."""
    stdout = run(["go", "-C", "backend", "list", "-json", "./..."], failures)
    if stdout is None:
        return set()

    # `go list -json` writes one JSON object per package, concatenated rather than in an array.
    reached, decoder, index = set(), json.JSONDecoder(), 0
    while True:
        while index < len(stdout) and stdout[index].isspace():
            index += 1
        if index >= len(stdout):
            break
        package, index = decoder.raw_decode(stdout, index)
        directory = Path(package["Dir"])
        for name in (package.get("TestGoFiles") or []) + (package.get("XTestGoFiles") or []):
            found = relative(directory / name)
            if found:
                reached.add(found)
    return reached


def vitest_reach(failures):
    """The files Vitest would run, from its own listing. Written to a file rather than read from
    stdout, which carries the plugin banner alongside the JSON."""
    with tempfile.TemporaryDirectory() as directory:
        listing = Path(directory) / "vitest.json"
        stdout = run(
            [str(VITEST), "list", "--root", "frontend", "--filesOnly", "--json", str(listing)],
            failures,
        )
        if stdout is None:
            return set()
        if not listing.is_file():
            failures.append(f"{VITEST.name} list wrote no listing — this measured no reach")
            return set()
        entries = json.loads(listing.read_text(encoding="utf-8"))
    return {found for entry in entries if (found := relative(entry["file"]))}


def playwright_reach(failures):
    """The files Playwright would run, from its own collection. `--list` collects and reports
    without running, so no browser and no dev server is started."""
    with tempfile.TemporaryDirectory() as directory:
        report = Path(directory) / "playwright.json"
        stdout = run(
            [
                str(PLAYWRIGHT), "test",
                "--config", "frontend/playwright.config.ts",
                "--list", "--reporter=json",
            ],
            failures,
            env={**os.environ, "PLAYWRIGHT_JSON_OUTPUT_NAME": str(report)},
        )
        if stdout is None:
            return set()
        if not report.is_file():
            failures.append(f"{PLAYWRIGHT.name} --list wrote no report — this measured no reach")
            return set()
        collected = json.loads(report.read_text(encoding="utf-8"))

    # A suite's `file` is relative to the run's own root, and suites nest.
    root = Path(collected["config"]["rootDir"])
    reached, pending = set(), list(collected.get("suites") or [])
    while pending:
        suite = pending.pop()
        if "file" in suite:
            found = relative(root / suite["file"])
            if found:
                reached.add(found)
        pending.extend(suite.get("suites") or [])
    return reached


def main():
    population = tracked()
    if not population:
        return fail(["no tracked test file was resolved — an empty population is not a clean run"])

    problems = [
        f"{name}: untracked, so this check cannot judge it — git add or gitignore it"
        for name in untracked()
        if any(Path(name).match(pattern) for pattern in CANDIDATES)
    ]

    failures = []
    reach = {
        "go": go_reach(failures),
        "vitest": vitest_reach(failures),
        "playwright": playwright_reach(failures),
    }
    if failures:
        # The difference below is not computed: subtracting a reach nobody measured reports every
        # test file of that runner's as dead, which is a diagnosis the input cannot support.
        return fail(problems + failures)

    reached = set().union(*reach.values())
    problems.extend(
        f"{name}: committed, named as a test, and reached by no configured runner"
        for name in sorted(population - reached)
    )

    if problems:
        return fail(sorted(problems))
    counts = ", ".join(f"{len(files)} {runner}" for runner, files in reach.items())
    print(f"{len(population)} test file(s), all reached: {counts}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
