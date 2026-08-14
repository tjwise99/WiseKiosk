# `check-adr-index.mjs`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

| Direction | Case | Input |
|---|---|---|
| Must fail | ADR file with no row | a new `0003-gamma.md` |
| Must fail | Row naming no file | a row for `0003` with no such ADR |
| Must fail | Row linking the wrong filename | the row's target renamed |
| Must fail | Two files carrying one number | `0002-beta.md` beside `0002-dup.md` |
| Must fail | Two rows for one number | the row duplicated |
| Must fail | Numbering not contiguous from 0001 | a gap, and an ADR numbered `0000` |
| Must fail | File not named `NNNN-<slug>.md` | `notes.md`, and a five-digit `00010-x.md` |
| Must fail | A directory named like an ADR | `0002-notreal.md/` holding a file |
| Must fail | A dangling symlink named like an ADR | a link to a nonexistent target |
| Must pass | The index as it stands | — |
| Must pass | A new ADR plus its row | both added together |
| Must pass | `TEMPLATE.md` and `README.md` | skipped by name |
| Must pass | A non-`.md` file, and a subdirectory | `notes.txt`, `assets/` |
| Must pass | A row target carrying a title, angle brackets, `./` or an `#anchor` | four spellings of the same filename |
| Must pass | A 4-space indented example row | not a table row, because it does not start with `\|` |
| Must pass | A row in a Markdown file outside `docs/decisions/` | only the index is read |

The directory row is the one that matters: `readdirSync` reports *names*, so an entry counted as an
ADR on the strength of its name alone needed only a matching row to be reported as fully agreeing.
`statSync().isFile()` closes it.

**Known rejections.** A row inside a fenced code block is read as a real index row — there is no fence
blanking — so `docs/decisions/README.md` may not carry a fenced example table. `name.endsWith(".md")`
is case-sensitive, so an ADR named with an uppercase extension is invisible rather than rejected; no
such file exists, and the naming rule would reject one on sight.
