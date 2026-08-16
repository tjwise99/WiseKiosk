# `check-adr-revs.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

Seeded state is described rather than committed, and never spells a live ADR number — this check
reads one as a citation like any other.

Exercised at `66d168f`, script md5 `c816ba0d4e721b862efec9d363128b38`, where a passing run reports
**20 ADRs** — read that count before any row whose input is spelled *all twenty*. The headline
title-number row is the state at `128ff83` and is reachable from no later commit, the rename that
caused it and the correction that ended it both being on that branch; extract it literally.

| Direction | Case | Input |
|---|---|---|
| Must fail | Prose citation with no rev | a pinned citation in `CONTRIBUTING.md` cut back to the bare form |
| Must fail | Prose citation pinning a stale rev | the same citation moved to a rev its ADR does not carry |
| Must fail | Link titled with a bare number | a titled link in `docs/CI.md` retitled to the number alone |
| Must fail | Link title naming a different ADR than it targets | the title's number changed, the target left |
| Must fail | Ordinary prose inside a *Revisions* section | a sentence carrying an unpinned citation and a bare-titled link, one line below a legal changelog line |
| Must fail | The same, indented so it continues the changelog line | the exemption drops staleness, not form |
| Must fail | A changelog continuation naming a number no ADR carries | a rev that has moved is exempt; an ADR that does not exist is not |
| Must fail | An unpinned citation beside a correctly titled link | both on one line, naming the same ADR |
| Must fail | A stale citation in an index row's *Decision* cell | a supersession note written into the free-prose column |
| Must fail | Index rev column disagreeing with the ADR's head | one row's rev raised, its head left |
| Must fail | An ADR head with no `**Rev:** N` | the line deleted from one ADR |
| Must fail | An ADR revved with no changelog line for the new rev | head and index row to rev 2, every citation moved, *Revisions* untouched |
| Must fail | Citation of a number no ADR carries | the same citation renumbered past the highest ADR |
| Must fail | A plural, a hyphen, or the wrong case | the plural, hyphenated and lowercase spellings |
| Must fail | An underscore, a hash, a doubled space, too few digits | four more separators and widths on one line |
| Must fail | A reference-style link or a raw `<a href>` to an ADR | each appended to `docs/TESTING.md` |
| Must fail | A link to an ADR whose title carries brackets | a bracketed phrase inside the title, over an ADR target |
| Must fail | A link to an ADR wrapped across two lines | the opening bracket on the line above |
| Must fail | The head format changed everywhere, so nothing parses | `**Rev:**` renamed in all twenty ADRs |
| Must fail | The prose citation spelling drifted, so none is recognised | `CITATION` altered not to match |
| Must fail | The link spelling drifted, so none is recognised | `TARGET` altered not to match |
| Must fail | An ADR revved with one citation left behind | one ADR to rev 2, every citation but one moved |
| Must fail | Two files carrying one number, at the same rev | a copy of an ADR under a second slug — the quiet shape |
| Must fail | The same, at different revs | the copy's head raised, so the two disagree |
| Must fail | An ADR titling itself a number its filename does not carry | the state at `128ff83`, where a rename left the title behind — 1 problem, naming the file |
| Must fail | The same, seeded elsewhere | one ADR's title line renumbered to another live ADR's number — 1 problem |
| Must fail | Two ADRs' title numbers swapped | the set of title numbers is still contiguous from 0001 — **2 problems**, one per file |
| Must fail | A title number of the wrong digit count | one title line cut to three digits |
| Must fail | An ADR with no title line | the first line of one ADR deleted |
| Must fail | The title format changed everywhere, so no number parses | the space after `#` dropped in all twenty — 20 problems, not silence |
| Must fail | An entry named outside `NNNN-<lowercase-slug>.md` | a copy of an ADR under a mixed-case slug |
| Must pass | The tree as it stands | — |
| Must pass | An ADR revved with everything moved with it | one ADR to rev 2: head, index row, a new changelog line, and all its citations |
| Must pass | A changelog line pinning a rev that is not current | a supersession line on that same rev-2 ADR |
| Must pass | An indented continuation of one, pinning a stale rev | the wrapped form of the same line |
| Must pass | An index row's leading self-link | every row in the index table |
| Must pass | A title spelled with a hyphen rather than an em-dash | the separator changed on one ADR — only the number is compared |
| Must pass | A title whose text differs from its index row's *Decision* cell | the tree as it stands: the cell is a summary written for the table |
| Must pass | A blank line before the title | one ADR given a leading newline — the opening line is the first non-blank one, not byte 0 |
| Must pass | A UTF-8 byte-order mark before the title | the same ADR given a BOM — stripped, not read as part of the number |

What the cases prove, beyond what the table shows on its own:

- **The two rev-2 must-pass rows are a pair, same tree**: without both, *the exemption works* and
  *the exemption is narrow* are indistinguishable.
- **The title-number rows are the collision rule's other half** — a collision asks which of two
  files a number names, a wrong title asks whether the one file naming it agrees.
  `check-adr-index.mjs` derives every number from a filename or an index row and never opens a body,
  so it passed a tree where one ADR's title named a different number.
- **The whole-tree title seed is the population guard**: respelling every title at once reports
  twenty problems, and correcting one title and re-running exits 0 — the satisfiability control the
  predecessor check could not produce.
- **Fixtures reckon with two file sets.** The ADR walk reads the filesystem; the citation scan reads
  `git ls-files`. A case about a title or filename needs no `git add`; a case about a citation does.

**Duplicate-number cases are seeded in both filename orders, because the verdict used to depend on
one.** The number → rev map was a plain assignment, so two files at one number left it holding
whichever sorted last. A seed that fixes the slug measures the sort order, not the check. The last row
carries no message count on purpose: how many problems that run prints depends on how the seed was
built, which is the defect this entry records.

| Seed (copy of an ADR under a second slug) | Old | Current |
|---|---|---|
| Sorts first, same rev | exit 0 | exit 1, the collision |
| Sorts last, same rev | exit 0 | exit 1, the collision |
| Sorts first, head raised | **exit 0** | exit 1, the collision |
| Sorts last, head raised | exit 1, on stale-citation messages against correct citations and an index-row disagreement — nothing pointing at the collision | exit 1, the collision |

**The equal-rev shape is the one that ran on a real branch**: two records at one number, both at rev 1,
reported as `23 ADRs` over a directory holding 24, exit 0. It is decidable only by reading the count
against the directory, which is why an equal-rev pair rather than a disagreeing one is the case that
matters.

**Known rejections and gaps.**

- **A citation a line wrap splits after the keyword is invisible here, and so permanently exempt from
  the rule.** `CITATION` is applied per line, so a line ending in the bare keyword and the next
  opening with the number and its rev matches neither: the first carries no digits, the second no
  keyword. **Two live instances were found this way, both in `scripts/cases/check-languages-py.md`,
  and one of them had already gone stale** — it kept a superseded rev straight through a sweep of
  that record while this check exited 0 over the whole tree. Joining the two lines and re-running
  reports the stale pin, so the rule is sound and only its window is wrong.
  `scripts/adr-rev-reach.py` is blind the same way and for the same reason, which is why the miss was
  reported from neither direction; it was found by grepping for lines ending in the keyword, which is
  the only thing that sees it today. This is the one gap here a sweep can *create* rather than
  merely miss: re-wrapping is what a prose pass does, and every citation in this repository is
  wrap-sensitive. The obligation that follows binds every prose edit in the repository rather than
  anyone running this check, so it is stated where a person reflowing a paragraph meets it —
  `CONTRIBUTING.md` review checklist item 21, *Rev reach*, and `docs/CI.md` beside what this gate
  leaves unproven. Closing the hole itself means matching across a line join — a change to what the
  population is, not to what the rule says.
- An illustrative example spelling a live ADR number is rejected as a stale citation. That is correct,
  and it cost three fixes: `docs/decisions/README.md`, this check's docstring, and the first draft of
  the tables above each named a real ADR while describing the citation form. A check that exempted
  examples would be exempting the spelling most likely to hide a bypass.
- **Only ADRs, the index and the template may live in `docs/decisions/`.** Every other entry — a
  subdirectory, a non-Markdown asset, an editor backup, a dotfile — is reported as unreadable-numbered,
  which narrows what the directory may hold.
- **An H1 indented up to three spaces is legal CommonMark and is rejected** — the opening line is
  matched from its first character. `opening.lstrip()` would close that gap, but would also accept an
  indented code block's opening line as a title, the worse trade.
- A title number is read as the first whitespace-delimited token after `# `, so a title running the
  number into its text is reported as titling itself that whole token rather than as malformed. The
  verdict is right and the message is not — reading a token rather than a number-shaped pattern is what
  lets *no title line* and *wrong digit count* both be reported instead of skipped.

**The two ADR checks disagree about strays, and the line between them is the `.md` suffix.** Observed,
one stray at a time:

| Stray in `docs/decisions/` | `check-adr-revs.py` | `check-adr-index.mjs` |
|---|---|---|
| `notes.txt` | exit 1 | **exit 0** |
| an editor backup ending `~` | exit 1 | **exit 0** |
| a subdirectory | exit 1 | **exit 0** |
| `draft-supersede-0007.md` | exit 1 | exit 1 |

Directory scope is `current_revs()`'s rather than one rule's, reading the filesystem rather than
tracked state. The consequence is wider than a stray — **an untracked file reds `just verify` locally
while CI stays green**, because `actions/checkout` gives CI committed state. Measured on one tree, one
file at a time:

| Untracked in `docs/decisions/` | Reported locally |
|---|---|
| `notes.txt` | the naming rule — 1 problem |
| an ADR drafted the ordinary way, at rev 1 with its changelog line | **1 problem, from neither** — `check_index()`, finding the number carries no index row |

An archive of the same `HEAD`, which is what CI gets, exits 0 for both. For a stray, the fix is to
rename or remove the file. The draft is the case with no stray to remove, and its answer differs: the
index row is genuinely owed, `check-adr-index.mjs` reds on the same file with the same remedy, and
nothing here gates a commit — the local hook layer (`.pre-commit-config.yaml`) is advisory and no
hook in it runs `verify`. What
the local run buys is notice before the push, not enforcement.
