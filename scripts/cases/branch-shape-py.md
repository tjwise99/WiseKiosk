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
| Must pass | `task_1-ok` |
| Must pass | `main` — exempt: the mainline is not a work branch |
| Must pass | `dependabot/pip/foo-1.2.3` — exempt: Dependabot names its own branches |
| Must pass | a detached HEAD — no branch is checked out, so there is nothing to judge |
