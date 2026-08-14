# `check-languages.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/decisions/0017-authored-language-set.md`](../../docs/decisions/0017-authored-language-set.md)'s;
how to run a case is [`../README.md`](../README.md)'s.

Exercised at `fb8f193`, script md5 `bd4f004a9b6bdb37596abfb14417d831`, where a passing run over this
repository reports **211 tracked files**.

| Direction | Case | Input |
|---|---|---|
| Must fail | A tracked file carries an extension outside the declared set | `scripts/rogue.rs` added to the tree |
| Must fail | A declared extension spelled in a different case | `scripts/rogue.PY`, a copy of a real check, added beside it |
| Must fail | A file with no extension and no declared entry for its exact path | `scripts/rogue-noext` added to the tree |
| Must fail | A declared no-extension basename reused at a path that is not declared | `scripts/decoy/LICENSE`, a copy of the real `LICENSE`, added under a subdirectory |
| Must fail | The population is empty | a freshly `git init`'d repository with nothing added, so `git ls-files` resolves nothing |
| Must pass | The tree as it stands | — |
| Must pass | A new file with an already-declared extension | `scripts/new-check.py`, a placeholder script, added to the tree |

**What the cases prove, beyond what the table shows on its own.**

- **The case-variant and basename-reuse rows are the same claim from two directions.** Matching is
  exact — on the extension's characters for a suffixed file, on the full repository-relative path for
  an extensionless one — so neither a spelling variant of a declared extension nor a declared
  no-extension name showing up somewhere else earns a pass by resemblance.
- **The empty-population row is the population guard, not an accident of the fixture.** Run this check
  from a path that does not put it two directories below a git worktree root and `git ls-files` fails
  outright (`CalledProcessError`, exit 128 from git) rather than returning nothing — that failure mode
  was hit once while building this fixture, from a script placed at the fixture root instead of under
  `scripts/`, and is why the case above is seeded with the script correctly placed and a genuinely
  empty index, not a broken `cwd`.
- **The tree-as-it-stands row is what makes every other row mean something.** Everything else here is
  a targeted seed; this one is the population `just verify` actually runs the check against, and it is
  the row that would catch the allowlist itself being wrong rather than the check's logic.

**Known rejections.**

- A declared extension spelled with different case (`.PY` beside `.py`) is rejected rather than
  folded in. That is intentional, not an oversight of case-insensitive filesystems: a case variant is
  an undecided spelling exactly as much as a new extension is, and folding case would quietly widen
  the declared set past what ADR 0017 rev 4 names.

**Known gaps.**

- **A new `.sh` or `.mjs` file passes exactly as the legacy check scripts already in the tree do.**
  Declaring those two extensions at all is recording ADR 0017 rev 4's Consequences-section
  disposition — Node and sh check scripts converting to Python under tracked tickets — not a decided
  authoring language, and the set is bounded by extension rather than by which file already earned its
  place in it. Closing this gap would need per-file rather than per-extension judgment, which is a
  different check.
- **Content is never read.** A no-extension file passes on its path alone, and an extension-bearing
  file passes on its suffix alone — nothing here notices `LICENSE` replaced with a shell script, or a
  `.py` file that is not valid Python. That is deliberate: this check asserts the tree's declared
  *shape*, and a mismatch between a file's declared kind and its actual content is the reviewer's,
  under `CONTRIBUTING.md` review checklist item 12, *Languages* — the same item ADR 0017 rev 4 names
  as the mechanism for a language decision this check cannot make.
