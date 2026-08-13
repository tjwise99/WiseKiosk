# `check-docs-index.mjs`

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
| Must pass | a new ADR under `docs/decisions/`, claimed by the subtree row without a row of its own |
| Must pass | a second tracked `.md` added under `docs/architecture/` |
| Must pass | an `.md` nested two levels under a subtree row |
| Must pass | an `.md` added under a dot-directory (`.github/`) |
| Must pass | a **new** top-level dot-directory (`.notes/NOTES.md`) — the accepted trade below |
| Must pass | a row whose rendered text and link target differ |

The rows exercise six distinct reporting paths — unclaimed document, row link resolving to no tracked
file, rendered path naming nothing, duplicate row, empty cell, table shape gone. A check reporting
through a single path would pass most of these while asserting nothing else, so the spread is the
point rather than the count.

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

The consequential one is the second: every `|`-leading line in `docs/README.md` is read as an index
row, so the file may hold exactly one table and no fenced example containing one. `docs/CI.md` and
ADR 0014 rev 2 both say a *Document* cell *renders* as a path where the check requires a Markdown link
whose text is a backticked path — the prose is looser than the code.

**What it does not catch.** A new top-level dot-directory is excluded the moment it exists, with no
edit anywhere: adding `.notes/NOTES.md` alone gives exit 0. That is the trade ADR 0014 rev 2 records —
it buys the absence of an exclusions list, since anything not a dot-directory cannot be excluded
without changing this check. An earlier revision carried an exclusions list; two one-line edits to it
turned out to hide a document, one needing no other change at all. The population comes from
`git ls-files`, so an unstaged document is invisible locally; CI checks out committed state.
