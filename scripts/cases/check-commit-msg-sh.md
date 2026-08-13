# `check-commit-msg.sh`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

CI-only: the PR-title form has no local equivalent, no PR title existing locally. Both modes take a
message file, so both are exercised without any credential.

| Direction | Input |
|---|---|
| Must fail | plain prose; a capitalised type; no colon; an empty scope; an uppercase scope; an empty subject; an unknown type |
| Must pass | `fix: a thing`; `feat(ci): a thing`; `feat(ci)!: a thing` |
| Must pass | `fixup! …` and `Merge branch 'x'` in default mode |
| Must fail | those same two under `--pr-title` |

The last pair is the one that matters: the allowances exist because a fixup or merge commit never
survives the squash, but a PR title *becomes* the commit on `main`, so the same string must be
accepted in one mode and rejected in the other.
