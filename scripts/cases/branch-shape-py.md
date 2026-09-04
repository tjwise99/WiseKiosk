# `branch-shape.py`

The inputs this hook has been run against, in both directions. What it *asserts* is the branch shape
[`docs/CI.md`](../../docs/CI.md) § *Repository shape* states; the pattern is read from
[`branch-shape.regex`](../branch-shape.regex), shared with `check-branch.py`, which resolves the
issue conditions this hook deliberately does not. Advisory: it runs as the `branch-shape` local
pre-push hook in [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml), and the binding gate is
CI's `process` check.

| Direction | Input |
|---|---|
| Must fail | `feature/foo` — no type prefix |
| Must fail | `task_0-leading_zero` — the number set is `[1-9][0-9]*` |
| Must fail | `task_2-Upper_Case` — the name is lowercase snake_case |
| Must fail | `feature/bar`, invoked through `pre-commit run branch-shape --hook-stage pre-push` — the wiring, not just the script |
| Must fail | `dependabot/pip/foo-1.2.3` — only Renovate names its own branches; a Dependabot-shaped name has no exemption |
| Must pass | `task_1-ok` |
| Must pass | `main` — exempt: the mainline is not a work branch |
| Must pass | `renovate/npm/foo-1.2.3` — exempt: Renovate names its own branches |
| Must pass | a detached HEAD — no branch is checked out, so there is nothing to judge |
| Must pass | `epic_7-name` against a seeded two-line regex file whose second line admits it — each non-blank line is a pattern, the reading `check-branch.py` shares |
| Must fail | `nodashes` against the same two-line file, matching neither line |
| Must fail | `nodashes` against a regex file carrying a trailing blank line — a blank line is dropped, not read as an empty pattern matching every name |
| Must pass | `task_1-ok` against the same trailing-blank file |

The two-line must-pass row is the one that separates the readings: a reader taking the whole file as
one regex rejects a branch either line admits, splitting this hook's verdict from `check-branch.py`'s
on the same name. Seeded rows run against a copy of the script and the seeded file in a scratch
repository with the case's branch checked out.
