# `check-docs-index.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

A case is a throwaway repository holding a **minimal fixture index** — three rows over `README.md`,
`decisions/` and `architecture/` — rather than a copy of the real documentation set, so a case states
its own premise and the tree cannot drift out from under it.

| Direction | Input |
|---|---|
| Must fail | a tracked `docs/NEWDOC.md` with no row in the index |
| Must fail | the `architecture/` row deleted while `docs/architecture/README.md` remains |
| Must fail | a row linking `decisions/GONE.md`, which is not a tracked file |
| Must fail | a row whose *Guarantees* cell is emptied |
| Must fail | the index reshaped so its rows are list items rather than table rows |
| Must fail | two rows for one rendered path |
| Must fail | a row whose rendered path names no tracked document (`GHOST.md`) |
| Must fail | a subtree row over a directory holding no tracked document (`ghost/`) |
| Must fail | a row indexing a dot-directory, which holds machinery rather than documents |
| Must fail | a dot-prefixed file at the repository root (`.HIDDEN.md`) — a dot-*file* is not a dot-*directory* |
| Must fail | an untracked `.md` — the untracked guard names it as unreadable, whatever it contains |
| Must fail | an untracked `.md` under a dot-directory — the guard is deliberately wider than the claims rule, which lets the same file through once tracked |
| Must pass | a new ADR under `docs/decisions/`, claimed by the subtree row without a row of its own |
| Must pass | a second tracked `.md` added under `docs/architecture/` |
| Must pass | an `.md` nested two levels under a subtree row |
| Must pass | an `.md` added under a dot-directory (`.github/`) |
| Must pass | a **new** top-level dot-directory (`.notes/NOTES.md`) — the accepted trade below |
| Must pass | a row whose rendered text and link target differ |
| Must pass | an untracked file that is not `.md` — outside this gate's population, so outside its guard |

The must-fail rows exercise six distinct reporting paths, not one — the spread is the point, since a
check reporting through a single path would pass most of them while asserting nothing else.

**Known rejections.** Legal Markdown the check refuses. Each was run against a frozen extraction; all
fail closed, so none can let a defect through, and each constrains how `docs/README.md` may be written
rather than being a defect in it.

| Input | Reported as |
|---|---|
| GFM alignment delimiters in the separator row | the delimiter read as a *Document* cell, which is not a backticked-path link |
| a second Markdown table anywhere in the file | `a row has 2 cells, expected Document, Guarantees, Excludes` |
| a fenced table example — a code fence is not skipped | `a row has 2 cells, …` |
| the table indented one to three spaces, which still renders | `no index row parsed — the table's shape has moved` |
| a *Document* cell whose link text carries no backticks | the cell read as not a backticked-path link |
| an escaped pipe inside any cell | `a row has 4 cells, …` |

Two constraints on `docs/README.md` follow from the second row: it may hold exactly one table, and no
fenced example containing one, every `|`-leading line being read as an index row.

**A documented divergence.** `docs/CI.md` and ADR 0014 rev 4 both say a *Document* cell *renders* as a
path; the check requires a Markdown link whose text is a backticked path. The prose is looser than the
code.

What this gate lets through — a new top-level dot-directory — is
[`docs/CI.md`](../../docs/CI.md)'s, and the trade behind it is ADR 0014 rev 4's; an untracked
document fails the untracked guard rather than passing unread.
