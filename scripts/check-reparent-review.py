#!/usr/bin/env python3
"""No item's parent set moves without a fresh review fingerprint.

The `reviewed` stamp covers `uid`, `text`, `ref`, `references` and the three attributes each silo's
`.doorstop.yml` names. **`links` is in none of them**, so an item can be moved to a different parent,
text untouched, and go on reporting as reviewed against a parent nobody read it against. Commit
`1f1d5a1` re-parented eleven `TST` items that way and every fingerprint stayed valid.

Adding `links` to the `reviewed:` attribute list does not fix it and must not be retried: Doorstop
holds links in a `set`, `_convert_to_str` has no `set` branch, and the resulting `str()` of a
hash-randomised set gives a stamp that differs between processes for the same untouched item. Any
item with two parents would flap between reviewed and unreviewed on the hash seed.

So this compares the diff instead: for every item file the change touches, the **set of parent UIDs**
against the merge base, failing when that set moved and `reviewed` did not. Link stamps are ignored
because `doorstop clear` rewrites them legitimately whenever a parent's own text changes.

What it does not decide is whether the re-read was any good — only that one was recorded. It reads the
diff against the merge base, so it binds on a branch and is a no-op on the base itself. Nothing is
written.
"""

import os
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SILOS = [f"docs/requirements/{silo}" for silo in ("sys", "srs", "tst")]


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )


def base_ref(argv):
    """The ref this change is measured against: an explicit argument, the pull request's base branch
    in CI, or the default branch. Named rather than guessed — a base that does not resolve is a
    broken gate, not a clean run."""
    if argv[1:2]:
        candidates = argv[1:2]
    elif os.environ.get("GITHUB_BASE_REF"):
        candidates = [f"origin/{os.environ['GITHUB_BASE_REF']}", os.environ["GITHUB_BASE_REF"]]
    else:
        candidates = ["origin/main", "main"]

    for ref in candidates:
        if git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode == 0:
            return ref
    return None


def parents(item):
    """The set of parent UIDs. A link is either a bare string or a single-key mapping whose value is
    the stamp, and only the key identifies the parent."""
    return {
        next(iter(link)) if isinstance(link, dict) else link
        for link in (item.get("links") or [])
    }


def reviewed(item):
    return str(item.get("reviewed") or "").strip()


def touched(merge_base):
    """Item files this change touches. `git diff <sha>` with no second ref includes uncommitted work,
    so an edit is caught before it is committed."""
    result = git("diff", "--name-only", merge_base, "--", *SILOS)
    result.check_returncode()
    return [
        path
        for path in result.stdout.split()
        if path.endswith(".yml") and not Path(path).name.startswith(".")
    ]


def reparented(merge_base):
    """Every touched item whose parent set moved while its own fingerprint stood still."""
    found = []
    for path in touched(merge_base):
        before = git("show", f"{merge_base}:{path}")
        if before.returncode != 0:
            continue  # added by this change: its review lands with it
        current = ROOT / path
        if not current.is_file():
            continue  # deleted by this change: nothing left to review
        was = yaml.safe_load(before.stdout) or {}
        now = yaml.safe_load(current.read_text()) or {}
        if parents(was) != parents(now) and reviewed(was) == reviewed(now):
            found.append((Path(path).stem, parents(was), parents(now)))
    return sorted(found)


def main(argv):
    base = base_ref(argv)
    if base is None:
        print(
            "check-reparent-review: no base ref resolves — pass one as an argument"
            " (e.g. `origin/main`) or fetch the default branch.",
            file=sys.stderr,
        )
        return 1

    merge_base = git("merge-base", base, "HEAD")
    if merge_base.returncode != 0:
        print(
            f"check-reparent-review: no merge base between '{base}' and HEAD"
            " — the history is shallow or unrelated.",
            file=sys.stderr,
        )
        return 1
    merge_base = merge_base.stdout.strip()

    found = reparented(merge_base)

    if found:
        print(
            f"{len(found)} item(s) changed parent without a new review fingerprint:",
            file=sys.stderr,
        )
        for uid, was, now in found:
            added = " ".join(sorted(now - was)) or "-"
            removed = " ".join(sorted(was - now)) or "-"
            print(f"  {uid}: added {added}, removed {removed}", file=sys.stderr)
        print(
            "\nThe fingerprint does not cover `links`, so each of these still reports as reviewed"
            "\nagainst a parent it no longer has. Read the item against the parent it now has and"
            "\nrun `doorstop review <uid>`. `doorstop clear` alone re-blesses the link and leaves"
            "\nthe item's own stamp untouched, which is the hole this closes.",
            file=sys.stderr,
        )
        return 1

    count = len(touched(merge_base))
    print(
        f"{count} item(s) touched against {base}; every parent set change carries a fresh review."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
