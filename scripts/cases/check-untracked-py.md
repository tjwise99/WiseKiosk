# `check-untracked.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

A case is a throwaway repository; the check reads `git ls-files --others --exclude-standard` and
nothing else, so a case is a tree state, never a file's content.

| Direction | Case | Input |
|---|---|---|
| Must fail | An untracked, non-ignored file | one plain file, never added |
| Must fail | A file inside an untracked directory | a file two levels under a directory git does not know |
| Must fail | A legal file, untracked | a well-formed document — content is never read, so visibility rather than merit is what is judged |
| Must fail | git itself failing | the script run with its parent directory outside any repository, where `git ls-files` exits 128 — a raised error, not a clean report |
| Must pass | A fully tracked tree | every file added |
| Must pass | An ignored file | a path a `.gitignore` entry matches |
| Must pass | A tracked file with uncommitted modifications | modified is not untracked — the population gates read the working tree for every tracked path |

**`--exclude-standard` reads more than `.gitignore`**: `.git/info/exclude` and the user's
`core.excludesFile` also ignore a path, so a machine-local exclude entry passes this check without a
tree change. That is the intended remedy for machinery a workflow parks in the tree — a venv symlink
in an agent worktree, say — which is not material for any gate to judge.

**What this does not decide.** A tracked path whose staged content diverges from its working tree is
invisible here in both directions — the check asks git which paths are untracked, never what any
blob holds. The one gate with a recorded local false green of that shape is `check-arch`
([cases](check-arch.md)), and this check does not change it.
