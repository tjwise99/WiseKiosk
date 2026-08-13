# What each check has been exercised against

The inputs each check in this directory has been run against, in both directions: the defect it must
catch, and the legal input spelled differently that it must not reject.

**What belongs here, and what does not.** A section holds four things — the cases in both directions,
the legal input the check rejects anyway, the gaps it is known to leave, and how to re-run a case. A
note beside a table says in **one line** what a case proves, where the row does not show it. Anything
longer is somewhere else: what a check asserts and why is [`docs/CI.md`](../docs/CI.md)'s, and how a
check works is its own header comment's. A section that argues rather than records has stopped being a
record.

**Why the record exists.** A check that reads nothing finds no violations and prints success, and a
check that rejects a legal spelling looks identical to one catching a real defect. Neither shows up in
a green run, so the only evidence a check works is the list of inputs somebody put through it.

**A check with no section here has no record** — not a claim that it is unverified, and not a claim
that it is verified.

**This is a snapshot and nothing gates it.** `just verify` grows and each new check arrives with no
section and nothing to say so. A complete-looking file is a record of what somebody ran, on the day
they ran it.

**A success line says how much was checked, not how much exists.** Only the first is evidence:
`17 tags over 5 elements and 6 relationships` reads the same whether every element carries a
requirement link or none does, where `18 tag applications on 7 of 11 elements and relationships` moves
when a link breaks. Nothing enforces this — a wrong success line fails no build.

## Running a case

A case is a throwaway repository, so it cannot pollute the tree under test and a seeded
credential-shaped string never reaches a remote. Run from the repository root, which is where the `cp`
reads from; a case for another check writes that check's input in place of the workflow file.

```sh
case_run () { # $1 label   $2 expect (pass|fail)   $3 file contents
  d=$(mktemp -d); mkdir -p "$d/.github/workflows"
  printf '%s\n' "$3" > "$d/.github/workflows/w.yml"
  ( cd "$d" && git init -q . && git add -A )
  cp scripts/check-workflow-hardening.mjs "$d/"
  ( cd "$d" && node check-workflow-hardening.mjs >/dev/null 2>&1 )
  [ $? -eq 0 ] && got=pass || got=fail
  [ "$got" = "$2" ] && echo "ok   $1" || echo "WRONG $1 (got $got)"
  rm -rf "$d"
}
```

Where a case is keyed on what the tree holds, extract a named commit rather than `HEAD`:

```sh
d=$(mktemp -d)
( cd "$REPO" && git archive <commit> | tar -x -C "$d" )
ln -s "$REPO/docs/requirements/.venv"        "$d/docs/requirements/.venv"
ln -s "$REPO/docs/architecture/node_modules" "$d/docs/architecture/node_modules"
cp "$REPO/scripts/<check>" "$d/scripts/"   # fresh: the archive carries that commit's copy
md5sum "$d/scripts/<check>"                # assert against the section's pin before reading a result
( cd "$d" && git init -q . && git add -A && git commit -qm fixture )   # citation scans read git ls-files
```

Seven standing traps, each hit at least once:

- **Confirm the seed applied before reading the result.** A seed that fails to land looks exactly like
  a working check. Seeding into a tree: `git diff --quiet <path>` first, and read a clean diff as the
  case failing.
- **Assert the property the case is about**, not that the text changed. Three seeds failed this way in
  one afternoon on `check-arch-trace.py` — one never wrote the file, one selected lines by indentation
  and moved 11 of 18, one used an input another case already satisfied. Each reported the verdict its
  row expected.
- **`git init` the scratch tree and run the script from inside it.** Every `.mjs` check resolves its
  root with `git rev-parse --show-toplevel` and several build their file list with `git ls-files`. In a
  bare directory `rev-parse` climbs out or fails and `ls-files` returns nothing, so the check reads no
  files and prints success — the fail-open this file exists to catch, wearing a passing case's costume.
- **Copy the script under test into the scratch tree**, not the other way round: the Python checks
  derive the tree they read from their own `__file__`.
- **Copy it in fresh each time and assert its md5.** A `git archive` fixture carries the scripts as
  they were at that commit, so a case run inside it exercises the *old* script and a fix appears to do
  nothing — three false "unfixed" results before this was noticed. The md5 assertion separates *the fix
  does not work* from *the fix was not in the tree you ran*. Pin the hash to a **commit that carries
  the script**, never a working tree: a hash paired with a commit whose tree holds a different script
  says nothing about which half is wrong.
- **Pin the tree as well as the script where a case counts anything.** A whole-tree seed counts what
  the directory or model holds, which the script's hash cannot see. Where a section states a baseline,
  reproduce it before trusting any figure below it.
- **Doorstop cases run against a copy of the tree, never the tree.** `doorstop --error-all` stamps a
  review fingerprint into any unstamped item, a mutation
  [`../CONTRIBUTING.md`](../CONTRIBUTING.md) says must never be cleared by re-running. All seven tree
  checks pass on one unseeded copy, which is what makes it a fixture rather than an approximation;
  `git status --short docs/requirements/` afterwards is the proof no case escaped.

## `check-workflow-hardening.mjs`

| Direction | Case | Input |
|---|---|---|
| Must fail | Unpinned action | `uses: actions/checkout@v7` |
| Must fail | Expression as the reference | `uses: ${{ env.ACTION }}` |
| Must fail | Pinned, no version comment | a 40-hex SHA with the trailing `# vN` removed |
| Must fail | Container action on a tag | `uses: docker://alpine:3.19` |
| Must fail | Reference the parser cannot read | `uses:` with its value on the following line |
| Must fail | Flow-mapping step, unpinned | `- {uses: actions/checkout@v4, with: {x: 1}}` |
| Must fail | Second reference on a flow line | `steps: [{uses: …@<sha>}, {uses: …@v4}]` |
| Must fail | Quoted flow reference, unpinned | `steps: [{uses: "actions/checkout@v4"}]` |
| Must fail | Reference hidden by an apostrophe | `- {msg: don't, uses: …@v4, other: 'x'}` |
| Must fail | Reference hidden by a quoted `#` | `- {args: "a # b", uses: …@v4}` |
| Must fail | Unpinned action after a block scalar ends | a `run: \|` step, then `- uses: actions/checkout@v4` |
| Must fail | Unpinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@v4` |
| Must fail | Write grant carrying a comment | `contents: write # seeded`, with a second grant below |
| Must fail | Quoted write level | `contents: 'write'` |
| Must fail | Blanket write | `permissions: write-all` |
| Must fail | Flow mapping granting write | `permissions: {contents: read, actions: write}` |
| Must fail | Multi-line flow mapping granting write | the same across three lines |
| Must fail | Unreadable line inside the block | a line under `permissions:` that is not a grant |
| Must fail | No top-level block | the workflow declares none |
| Must fail | Block with nothing under it | `permissions:` followed by the next top-level key |
| Must fail | No workflow discovered | a repository with no file under `.github/workflows` |
| Must pass | SHA pin | `uses: actions/checkout@<sha> # v7.0.1` |
| Must pass | Quoted SHA pin | the same with the reference in double quotes |
| Must pass | Digest-pinned container action | `uses: docker://alpine@sha256:<64 hex>` |
| Must pass | Repository-local action | `uses: ./.github/actions/local` |
| Must pass | Flow-mapping step, pinned | `- {uses: …@<sha>, with: {x: 1}} # v7.0.1` |
| Must pass | Apostrophe beside a pinned flow reference | `- {msg: don't, uses: …@<sha>, other: 'x'} # v7.0.1` |
| Must pass | No action at all | a job whose only step is `run:` |
| Must pass | Workflow fixture inside a heredoc | a `run: \|` body containing `- uses: actions/checkout@v4` |
| Must pass | Comment on the block-scalar header | `run: \| # materialise a fixture` above the same body |
| Must pass | Pinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@<sha> # vN` |
| Must pass | `uses:` named in an echoed string | `run: echo "pin it as - uses: owner/action@sha"` |
| Must pass | `uses:` named in a trailing comment | `run: node x.mjs # rewrites each - uses: line` |
| Must pass | `uses:` inside a `with:` value | `command: build - uses: cache` |
| Must pass | `uses:` inside an `env:` value | `NOTE: "a, uses: b"` |
| Must pass | Read-all with a trailing comment | `permissions: read-all # least privilege` |
| Must pass | Empty flow mapping | `permissions: {}` and `permissions: { }` |
| Must pass | Flow mapping, all read | one line and across several |
| Must pass | Quoted scope key | `"contents": read` |
| Must pass | Quoted read levels | `contents: 'read'`, `actions: "none"` |
| Must pass | Comment inside the block | a comment line between `permissions:` and its grants |
| Must pass | Job-level elevation | `pages: write` and `id-token: write` in a job's own block |
| Must pass | Block placed after `jobs:` | the top-level block declared below the jobs it governs |

The last row of each direction is the pair that matters: the check must reject a workflow it cannot
read and must not reject one merely spelled unusually. Four defects were found by the must-pass column
alone — the first three fixes for a fail-open each rejected a legal workflow.

**Known rejections.** Legal YAML this rejects, each failing loudly by file and line, each needing a
spelling this repository does not use. Closing them means another cut at the matcher and every
previous cut introduced a defect.

| Input | What happens |
|---|---|
| `env: {A: 1} # see the uses: rule` | reported as a layout the check cannot read |
| `- {name: "uses: nothing", run: echo hi}` | the same: a flow step is not skipped as free text |
| `env: {NOTE: "a, uses: b"}` | read as a reference, and fails as unpinned |

The third is the flow spelling of a value the table passes in block form; only inside a flow mapping
is the string read as a reference.

## `check-repo-silo.mjs`

Covers all four assertions: the root listing, the shebang-recipe ban, Dependabot manifest resolution,
and the `github-actions` entry.

| Direction | Case | Input |
|---|---|---|
| Must fail | Manifest at the root | `package.json`, `go.mod`, `pyproject.toml` and `requirements.txt`, each at the repository root |
| Must fail | Environment directory at the root | `.venv/` |
| Must fail | Recipe carries a shebang | a `probe-recipe` opening `#!/usr/bin/env bash`, grouped under `docs` and reachable from no gate — the assertion is over every recipe, not the ones `verify` runs |
| Must fail | The dump names no recipe | `just --dump` returning an empty recipe set, so the loop cannot judge anything |
| Must fail | A module hides a script recipe | `mod deploy` beside a `deploy.just` whose `push` recipe opens `#!` — the dump lists it under `modules`, not `recipes` |
| Must fail | Entry names a directory that does not exist | the `pip` entry pointed at `/nope` |
| Must fail | Entry's directory holds no manifest | the `pip` directory emptied of `requirements*.txt` |
| Must fail | Entry points at the root | `directory: "/"` on a non-`github-actions` entry |
| Must fail | Ecosystem with no manifest mapping | `package-ecosystem: cargo` |
| Must fail | Entry declares no directory | the `directory:` key removed |
| Must fail | No `github-actions` entry | the block deleted from `.github/dependabot.yml` |
| Must fail | The parser cannot read the file | `updates:` renamed, so nothing parses |
| Must pass | Manifest below the root | `web/package.json` |
| Must pass | `requirements-dev.txt` satisfies `pip` | the real spelling, which is not `requirements.txt` |
| Must pass | Block-list patterns | a `github-actions` entry whose `patterns:` is a block list rather than inline |

The renamed-`updates:` row is the one that matters. The check's guard counts list items under
`updates:` and compares that against what its entry split produced, deliberately sharing no assumption
with the split: a guard keyed on the same literal goes to zero alongside the thing it guards, and the
two then agree that nothing is wrong.

## `check-verify-ci-parity.mjs`

| Direction | Case | Input |
|---|---|---|
| Must fail | Recipe runs in no workflow step | a `just verify` check whose script no step invokes |
| Must fail | Token names no command its recipe runs | a recipe's command changed, `CHECK_TOKENS` and the workflow left untouched |
| Must fail | Command covered by no token | the `git diff --exit-code` line of `check-arch` with its token removed |
| Must fail | A dependency on the recipe's header line | `check-links: link-lint`, where `link-lint` runs a script no token covers |
| Must fail | Truncated token hiding a dropped argument | CI's staleness command shortened to drop `docs/ARCHITECTURE.md` |
| Must fail | Shebang recipe on the gate path | a `verify` check whose body opens `#!`, which cannot be mapped to CI commands |
| Must fail | A command that does not resolve to text | a body line interpolating a variable, naming no fixed command |
| Must fail | `verify` depends on nothing | the dependency list emptied, so the loops judge an empty set |
| Must fail | A module the dump does not fold in | `mod deploy`, whose recipes sit outside `recipes` |
| Must fail | A dump with no `modules` map | `just` stubbed to drop the key, whose absence would read as "no module declared" |
| Must fail | A dump with no `shebang` field | the same stub per recipe, whose absence would read as "not a script" |
| Must fail | Recipe widened past its token | a third path added to `check-arch`'s diff, the workflow unchanged |
| Must fail | Recipe line prefixed `-` | `-node scripts/check-links.mjs`, discarding the failing status CI's identical command keeps; `@-` and `-@` likewise |
| Must fail | A continuation with no line after it | a recipe body ending on a trailing `\` |
| Must fail | Recipe with no `CHECK_TOKENS` entry | a new name added to the `verify` recipe |
| Must fail | Stale `CHECK_TOKENS` entry | a mapped check removed from the `verify` recipe |
| Must fail | CI step matching nothing | a named step running neither a mapped check nor an allowlisted one |
| Must fail | Token surviving only in a step's `name:` | the command renamed, the old path left in the step title |
| Must fail | Token commented out inside a `run: \|` block | the command replaced by a whole-line comment |
| Must fail | Token surviving only in a trailing comment | the step deleted, its path left after a `#` on another step's line |
| Must fail | The same, on a line holding a quoted value | the path left after a `#` on a `key: "value"` line |
| Must fail | The same, after an unbalanced apostrophe | the path left after a `#` on a line whose value carries `it's` |
| Must fail | A comment covering an unmapped step | a step matching nothing, its body naming a mapped path only in a comment |
| Must pass | The tree as it stands | — |
| Must pass | Commands reordered within a recipe | `check-reqs`'s first two commands swapped |
| Must pass | A command split across a `\` continuation | `check-links` written as `node \` then the script path |
| Must pass | A comment line inside a recipe body | `check-links` with a `#` line above its command |
| Must pass | A recipe line prefixed `@` | and `@ node …` with the whitespace `just` allows — both suppress the echo rather than naming a different command |
| Must pass | `#!` below the first body line | a shell comment, which `just` runs — only the first line opens a script |
| Must pass | A recipe reached through `just <recipe>` | `check-arch`, whose commands come from `arch-export` |
| Must pass | CI spelling a command with an extra argument | `sh scripts/check-branch.sh "$HEAD_REF"`, where the recipe passes none |
| Must pass | A toolchain step | a step named `Install …`, which prepares a check rather than being one |
| Must pass | An unnamed step | `- uses:` infrastructure with no `name:` |
| Must pass | A quoted `#` in a command | `run: … && echo "pin # it"` beside a real token |
| Must pass | An unquoted `#` with no leading space | `run: … --tag=#x`, which YAML does not read as a comment |

The trailing-comment rows need their control to mean anything: a step deleted outright **is** caught,
which is what made the comment cases holes rather than a misreading of the design.

Two simpler spellings each left a hole no row describes. Skipping any line containing a quote leaves
`key: "value" # token` open. Tracking quote state closed that and left an *unbalanced* quote — an
apostrophe in `it's` — opening a phantom scalar that swallowed the rest of the line, while newly
rejecting a legal workflow whose escaped quote closed the tracker early. Both were found by review,
neither by the seeding that prompted the fix. What holds is YAML's own rule: a quote is syntactic only
where a scalar may begin.

## `check-docs-index.mjs`

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

## `check-branch.sh`

Covers the ticket-metadata and epic-membership assertions
([ADR 0013 rev 3](../docs/decisions/0013-work-tracking-invariants.md)) and the branch-shape, exemption
and issue-resolution assertions. Shape and exemption cases reach no network: the branch name is passed
as `$1` and both paths return before the first API call.

| Direction | Input |
|---|---|
| Must fail | `nodashes` — no separator at all |
| Must fail | `task-87-name` — a hyphen where the underscore belongs |
| Must fail | `feature_87-name` — a type outside the permitted set |
| Must fail | `task_0-name` and `task_087-name` — a zero, and a leading zero |
| Must fail | `task_87-Name` — uppercase in the name |
| Must fail | `task_87-name_`, `task_87--name`, `task_87-`, `task_-name` — malformed separators and empty parts |
| Must pass | `main` — the mainline is not a work branch |
| Must pass | `dependabot/npm_and_yarn/foo-1.2.3` — Dependabot names its own branches |
| Must fail | a number naming a pull request rather than an issue |
| Must fail | a number naming nothing in the repository |
| Must fail | a number naming a closed issue |
| Must pass | this branch, against its real open ticket |

The pull-request row is the one that matters: GitHub draws issues and pull requests from one counter,
so a branch named for a merged pull request resolves to a real object of the wrong kind, and the check
must reject it on kind rather than on existence.

**A case here is not a fixture.** This check reads live GitHub state, so a case is a real throwaway
issue mutated between runs, with the branch name passed as `$1` rather than checked out. Read the
mutated field back before each run. The rows below ran against throwaway issue #89, closed afterwards.

| Direction | Input |
|---|---|
| Must fail | an issue with no milestone |
| Must fail | an issue carrying two type labels (`task` and `design`) |
| Must pass | the same issue with the second type label removed |
| Must pass | an issue carrying a non-type companion label (`design` + `documentation`) |

The companion-label row matters most: `documentation` is declared by `design_decision.md` and rides on
every design ticket, so a count reading *all* labels rather than type labels would reject the
repository's own conforming tickets while looking like a working check.

The guards over the check's own inputs were seeded against a copy of the script, both concerning the
script misreading rather than the ticket being wrong:

| Direction | Input |
|---|---|
| Must fail | a `branch-shape.regex` carrying a second pattern line, so the type set no longer has one answer while the branch still matches |
| Must fail | a single-line regex holding a top-level alternation, so one group is extracted, the branch matches through the other alternative, and the extracted set does not hold the branch's type |
| Must pass | the same copy with the real regex restored |
| Must fail | the GraphQL `parent` selection returning `databaseId` instead of `number`, against an issue that **has** a parent, so the response is error-free and every enclosing object present |
| Must pass | the unmodified query against the same issue |

Two guards stand over the regex file rather than one because a top-level alternation satisfies the
group count, and only the membership check rejects it. The `databaseId` row needs a parented issue:
against an unparented one the check correctly passes, so reading that pass as evidence would record
the opposite of what the row claims. The parent number is asserted rather than defaulted because a
`parent` key present and null is how *legitimately no parent* arrives, while anything else means the
query stopped naming what is read — and `// ""` erases that difference, printing a conclusion the run
never read. The assertion reaches the scalar the code consumes: asserting the issue node passes an
aliased `parent`, and asserting `parent` passes a selection returning `databaseId`, a plausible edit
since the sub-issues REST endpoint wants the database id.

The epic-membership assertion needs a pull request, so its cases ran against PR #88 by re-running the
`process` job against mutated live state:

| Direction | Input |
|---|---|
| Must fail | the branch's issue given a parent while its pull request targets the default branch |
| Must pass | the same issue with the parent removed |

Both were observed in CI rather than only locally, which is what shows the step is reached and can
fail the job.

**Two cases are unrun.** A pull request into an integration branch whose issue is not a sub-issue of
the anchor, and one whose issue is. Both need a throwaway integration branch, a child branch and a
pull request between them; the owner declined that on 2026-08-02 as more repository churn than the
case is worth. So the non-default-base path — anchor parsing, shape-conformance failure, membership
comparison — has no live evidence, and the historical instance that motivated it (PR #79 into
`design_18-closing_review`, whose ticket was never a sub-issue of the anchor) cannot serve as one: the
gate exits at the open-issue check before reaching it, that ticket being closed.

## `check-links.mjs`

| Direction | Case | Input |
|---|---|---|
| Must fail | Link to a missing file | an inline link whose destination names no file |
| Must fail | Link escaping the repository | a destination climbing above the root with `../` |
| Must fail | Link leaving through a symlink | a tracked symlink to a file outside the repository, linked normally |
| Must fail | Host not on the allowlist | an inline link to a host absent from `upstream-hosts.txt` |
| Must fail | Bare URL, host not allowed | the same host written as running text |
| Must fail | Allowlist entry naming no service | a line in `upstream-hosts.txt` with no `—` description |
| Must fail | Unterminated code fence | a fence that never closes, which would blank the rest of the file |
| Must fail | HTML anchor to a missing file | a raw HTML anchor whose `href` names no file |
| Must fail | Reference definition to a missing file | a link-reference definition whose destination names no file |
| Must pass | Valid relative link | an inline link resolving to a tracked file |
| Must pass | Link with an anchor | the same destination carrying a heading fragment |
| Must pass | Pure in-page anchor | a destination that is a fragment and nothing else |
| Must pass | Another scheme | a `mailto:` destination |
| Must pass | Allowlisted host, as a link and as bare text | the same host both ways |
| Must pass | Image link | the image form of a resolving destination |
| Must pass | URL containing parentheses | an allowlisted URL whose path carries a bracketed segment |
| Must pass | Link title | a resolving destination followed by a quoted title, with and without a fragment |
| Must pass | Angle-bracketed destination | the same destination wrapped in angle brackets |
| Must pass | Valid HTML anchor and reference definition | the same three syntaxes, resolving |
| Must pass | In-repo symlink | a symlink whose target is inside the repository |
| Must pass | Prose that resembles a definition | a sentence opening with a bracketed label and a colon |

The symlink pair is the one that matters. `resolve()` and `existsSync()` both follow a symlink without
reporting that they did, so a path whose *text* stays inside said nothing about where it landed — the
check's own invariant defeated with no signal either way. The three-syntax rows are the same lesson
from the other side: matching only Markdown's inline form leaves two other ways of writing a relative
path entirely unread.

**This section cannot show its own cases.** Backticks do not exempt a link from the scan, so writing
one out as an example makes it a real link that must resolve; the cases are described rather than
quoted. The first draft quoted them and `just verify` failed on this file.

**Known rejections.**

| Input | What happens |
|---|---|
| a root-relative destination, leading with `/` | reported as escaping the repository, though the target exists |
| a fence opened with a longer marker than the one that closes it | the mismatch is not tracked, so the region is misread |
| a 4-space indented code block | not a fence, so its contents are scanned as live references |
| an inline code span containing link syntax | the same |
| a blockquoted fence | the same |

The root-relative row is accepted rather than fixed: a document that must resolve standalone cannot
use a path rooted at a server, so the rejection is right even though the message names the wrong
reason.

**What it does not catch.** A link inside a fenced block, broken or off-allowlist, passes — a fenced
block is a sample, not a reference, and allowlisting a host to satisfy a code sample would put it in
the register on the strength of an example. The file list comes from `git ls-files`, so an unstaged
document is invisible locally.

## `check-eol.sh`

`git grep -lIP '\r$' -- .`, inverted. `git grep` answers 1 both for *searched, found nothing* and for
*there was nothing to search*, and anything else when the search itself failed — so the three are
separated and the population is established before a clean result means anything.

| Direction | Input |
|---|---|
| Must fail | a tracked file containing CRLF, in `.txt` and in `.md` |
| Must fail | the search failing rather than finding nothing — run outside a repository, where git exits 128 |
| Must fail | a repository with no tracked file, where git exits 1 over an empty pathspec |
| Must pass | an all-LF tree |
| Must pass | a binary file containing CR — excluded by `-I` |
| Must pass | a genuinely untracked CRLF file |
| Must pass | CR appearing mid-line, where the line still ends in LF |

**What it does not catch: a file whose `.gitattributes` sets the `binary` attribute.** That attribute
both exempts the file from CRLF→LF normalisation when it is added *and* makes `-I` skip it during the
grep, so genuinely CRLF-terminated text commits and survives a fresh clone unseen. A plain `-text`
does not do this; only the full `binary` macro. `.gitattributes` declares `binary` on the image, font
and PDF globs — the attribute used as intended — so the reachable case is a *text* glob given it. The
owner ruled on 2026-08-02 not to gate that, so what holds is that **the LF invariant holds for files
git treats as text, and `.gitattributes` decides which those are.**

The check is not made redundant by git's own normalisation: a CRLF blob forced into history via
`hash-object`/`update-index`, bypassing the add-time filter, is still caught after a fresh checkout.

## `check-adr-index.mjs`

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

## `check-adr-revs.py`

Run by seeding the working tree, running the check, and restoring. The seeded state is described
rather than committed, and described without spelling a live ADR number, which this check reads as a
citation like any other.

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

What the cases prove, one line each:

- **The exemption rows.** The *Revisions* exemption was narrowed twice by extent and neither held — a
  citation inside the section, then one on an indented continuation. Narrowing its **effect** did: a
  changelog citation is exempt from being *current* and from nothing else. Question 11, *Narrowed
  guards*, twice over.
- **The two rev-2 rows are a pair**: same tree, differing only in whether one citation moved. Without
  both, *the exemption works* and *the exemption is narrow* are indistinguishable.
- **The title-number rows are the collision rule's other half.** A collision asks which of two files a
  number names; a wrong title asks whether the one file naming it agrees. Both are identity, the
  premise every citation rests on. `check-adr-index.mjs` derives every number from a filename or an
  index row and never opens a body, so it printed agreement over twenty ADRs one of which called
  itself something else.
- **Only the number is compared**, which is why both must-pass rows exist: without the em-dash row the
  rule silently becomes a formatting gate, and without the *Decision*-cell row someone completes it
  into a title comparator, which reds the tree on sight.
- **The swapped pair pins the rule.** Exchanging two title numbers leaves the set contiguous from
  0001, so a rule comparing the two *sets* passes while every citation of either resolves to the wrong
  record. That row's message count is stated because one problem is a rule that stopped after the
  first file and two is a rule that read them independently.
- **The whole-tree title seed is the population guard.** Respelling every title at once reports twenty
  problems where a rule comparing only the titles it could parse would report none. Correcting one
  title and re-running exits 0 — the satisfiability control the old check could not produce, which
  printed a byte-identical success line with the defect present and removed.
- **The bracketed-title row.** Titled-pattern matching missed a link whose title carried a bracketed
  phrase — the pattern cannot cross a closing bracket, so the link was never matched and passed with
  exit 0, the exact defect the link rule was added for, invisible to the empty-population guard
  because other links kept the count non-zero. Anchoring on the target also surfaced two live
  citations in `docs/site/` no reader had ever seen, their titles wrapped across a line break; the
  tree's citation count went 227 → 229 on that fix alone.
- **The unpinned-citation-beside-a-titled-link row.** Deduplicating by text skipped a prose citation
  falling inside a link title so one defect is not reported twice — but the prose form is a substring
  of the link title, so that pairing was silently dropped. The test is now the match's position
  against the title's span.
- **The three drift rows** each seed the pattern a reader depends on, because the guards are per
  reader rather than over the total: one count hid the prose reader going to zero while fifty link
  citations kept it non-zero.
- **This rule lives in `check-adr-revs.py`** because it already opens every ADR body and holds both
  halves in one loop. A head parser in `check-adr-index.mjs` would be a second one beside it, drifting
  (question 13, *Second enforcer*).
- **Fixtures reckon with two file sets.** The ADR walk reads the filesystem, the citation scan reads
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
matters. A colliding number is dropped from the map rather than assigned from one of the two files, so
its citations and its index row go unjudged until the collision is resolved — deferred rather than
bypassed, the run failing on the collision either way.

**Known rejections and gaps.**

- An illustrative example spelling a live ADR number is rejected as a stale citation. That is correct,
  and it cost three fixes: `docs/decisions/README.md`, this check's docstring, and the first draft of
  the tables above each named a real ADR while describing the citation form. A check that exempted
  examples would be exempting the spelling most likely to hide a bypass.
- A file whose bytes do not decode as UTF-8 is not scanned. Every such file is named on stderr, so the
  population stays visible.
- **The rev pins a version, not an identity.** A citation written across a freeing and a re-taking of
  the same number merges green: at merge time the number resolves and the rev matches. Nothing here
  decides it.
- **The claim attached to a pin is decided by nothing here.** A citation pinning the current rev while
  the sentence hanging off it describes what an earlier rev said passes. That is
  [`docs/CI.md`](../docs/CI.md) § *Documentation integrity*'s statement of the gap and the review
  question that answers it.
- **Nothing may live in `docs/decisions/` but ADRs, the index and the template.** Every other entry is
  reported as unreadable-numbered — a subdirectory, a non-Markdown asset, an editor backup, a dotfile.
  That is the rule working, but it narrows what the directory may hold.
- **An H1 indented up to three spaces is legal CommonMark and is rejected**, the opening line being
  matched from its first character. `opening.lstrip()` would close it and would also accept an indented
  code block opening a file as that file's title, which is the worse trade.
- A title number is read as the first whitespace-delimited token after `# `, so a title running the
  number into its text is reported as titling itself that whole token rather than as malformed. The
  verdict is right and the message is not; reading the token rather than a number-shaped pattern is
  what lets *no title line* and *wrong digit count* both be reported instead of skipped.

**The two ADR checks disagree about strays, and the line between them is the `.md` suffix.** Observed,
one stray at a time:

| Stray in `docs/decisions/` | `check-adr-revs.py` | `check-adr-index.mjs` |
|---|---|---|
| `notes.txt` | exit 1 | **exit 0** |
| an editor backup ending `~` | exit 1 | **exit 0** |
| a subdirectory | exit 1 | **exit 0** |
| `draft-supersede-0007.md` | exit 1 | exit 1 |

Directory scope is `current_revs()`'s rather than one rule's: it reads the filesystem deliberately,
since an entry no commit has introduced is exactly what a name check should still see. The consequence
is wider than a stray — **an untracked file reds `just verify` locally while CI stays green**, because
`actions/checkout` gives CI committed state. Measured on one tree, one file at a time:

| Untracked in `docs/decisions/` | Reported locally |
|---|---|
| `notes.txt` | the naming rule — 1 problem |
| an ADR drafted the ordinary way, at rev 1 with its changelog line | **1 problem, from neither** — `check_index()`, finding the number carries no index row |

An archive of the same `HEAD`, which is what CI gets, exits 0 for both. For a stray the fix is to
rename or remove the file, and judging only what is committed would trade a visible local failure for
a silent one. The draft is the case with no stray to remove, and its answer differs: the index row is
genuinely owed, `check-adr-index.mjs` reds on the same file with the same remedy, and nothing here
gates a commit — both hooks in `.githooks/` are advisory and neither runs `verify`. What the local run
buys is notice before the push, not enforcement.

## `check-arch` — `splice-arch-diagrams.mjs`

The recipe runs `likec4 validate`, `likec4 codegen`, this script, and `git diff --exit-code`. The
script fails on marker problems; staleness is caught by the diff.

| Direction | Input |
|---|---|
| Must fail | no `arch-export` markers in `docs/ARCHITECTURE.md` |
| Must fail | an odd number of markers — an unpaired begin or end |
| Must fail | `end` before `begin` |
| Must fail | a pair whose begin and end name different artifacts |
| Must fail | a marker naming an artifact that does not exist |
| Must fail | a marker path escaping `docs/architecture/` textually |
| Must fail | a **symlink** artifact resolving outside `docs/architecture/` |
| Must fail | an artifact containing a fence marker |
| Must pass | a well-formed pair; two distinct pairs; an artifact in a subdirectory |
| Must pass | a second run — idempotent, md5 stable, reporting *already current* |
| Must pass | an artifact containing backticks mid-line, which closes no fence |

Two rows carry the weight. The symlink one: the escape guard tested the marker *text*, so a symlink
under `docs/architecture/` satisfied it and still read from anywhere on the host — observed splicing a
file from outside the repository into the document with exit 0. The fence one: the body is wrapped in
a fenced block, so a fence marker inside it closed that fence early and spliced the remainder into the
document as running Markdown. Confirmed separately, because only a real run shows it: a hand edit
inside a marker region is overwritten and the tree goes clean again, and a change to a generated
artifact reaches the document.

### The three-line gate

| Direction | Input |
|---|---|
| Must fail | a committed artifact no view produces — a view added, exported and its artifact committed, then the view deleted |
| Must fail | a committed view whose artifact was never committed |
| Must fail | a committed artifact hand-edited away from what the model produces |
| Must pass | the unseeded tree — exit 0, leaving **zero** index entries |

`arch-export`'s `rm -rf`, the `git add --intent-to-add`, and the `HEAD` in the diff are three parts of
one mechanism, and the whole grid was run — each line removed against every row, not only the row it
protects. Sixteen cells at `adc1f65`, each its own extraction with `node_modules` **copied** rather
than symlinked, the ablation applied to that fixture's own `justfile` and committed, each seed
asserted present in `HEAD` before the run.

| Seeded state | full | no `rm -rf` | no `--intent-to-add` | no `HEAD` |
|---|---|---|---|---|
| Unchanged tree (must pass) | 0 | 0 | 0 | 0 |
| Committed artifact hand-edited | 1 | 1 | 1 | 1 |
| Committed view, artifact never committed | 1 | 1 | **0** | 1 |
| Committed artifact no view produces | 1 | **0** | 1 | **0** |

**Each line is necessary for exactly one row, and no ablation false-positives on the unchanged tree.**
The three zeroes are the argument, each corroborated by looking at the tree rather than the exit code:
`codegen` never prunes, so the orphan is still on disk byte-identical to what is committed; the
uncommitted artifact *was* generated and `git status` reports it `??`, which `git diff` does not read
as drift; and the `git add` with a pathspec stages the deletion `rm -rf` just made, so an
index-relative diff reads worktree and index as agreeing.

The hand-edited row is caught by every variant because it is the only one of the three that changes a
**tracked** file in place — which is why it is the wrong case to develop this gate against, and why
the two needing machinery are the two that were missed. The unchanged column matters as much as the
zeroes: a gate can be made to catch everything by failing on everything.

**The orphan row's two zeroes are the pair to remember**, because they are the same index read twice.
Adding `--intent-to-add` to catch the uncommitted artifact silently re-opened the orphan, and the
`HEAD` closed it again: the two lines act on one index in opposite directions. It survived a full
local `just verify`, six commits and a green CI run — CI proves nothing here, the repository tree
holding no orphan — and was caught only by re-running the original finding's own reproduction against
the fix.

Two traps in seeding this, both hit: `--intent-to-add` persists in the index after a failing run, so
re-running the pre-fix recipe in that tree also exits 1 and reads as the hole never existing — build
each direction its own fixture. And symlinking `node_modules/` into a fixture reds the gate, the
trailing-slash ignore pattern not matching a symlink, so `git add -N` marks it.

Two live consequences of `git add -N` taking the whole silo rather than `generated/`: any untracked
non-ignored file under `docs/architecture/` fails the gate, and after a failing run `git stash`
refuses with *"Entry … not uptodate"* until `git reset` clears the marker. Staged in-progress work
under `docs/architecture/` also fails the gate.

**What it does not catch: the index.** The comparison is HEAD against the worktree, and `arch-export`
rewrites the worktree before the diff runs, so staged content diverging from the worktree is invisible
— measured at exit 0 for a staged hand-edit of a generated artifact, a staged `git rm --cached` of it,
and a staged tamper of the document. A plain `git commit` lands the *index*, so each commits content
the gate never read. This is the same shape as the defect above, one level out: the earlier recipe
compared worktree to index and was blind to HEAD, this one compares HEAD to the worktree and is blind
to the index, and no form has compared all three. It is a **local false green only** —
`actions/checkout` gives CI a tree whose index equals HEAD — and `git add -A` before `just verify` is
the ordinary sequence that produces it.

**Unprobed, and so unevidenced:** worktrees, submodules, `core.fileMode`, `autocrlf`, sparse checkout,
and git older than 2.53. **`likec4 codegen` has no case here** — a gap, not a reasoned exemption, since
`check-site` seeds Sphinx's own validator below. `likec4 validate` is covered only partly by the
invalid-model row under `check-arch-trace.py`: it was run against the validator directly rather than
through the recipe, so what is evidenced is that the binary exits non-zero on an unparseable model,
not that `check-arch` reaches it.

## `check-arch-trace.py`

Every row re-run at `adc1f65`, script md5 `f3d15a77411d08dc2fc50c04cb798b1a`. The counting rows were
first exercised at `7883e3b`, md5 `012e4cd6425770ec3ce01b5d1b111216`, each run a second time against
the form it replaced — `04cea31`, md5 `62e44de86ab097dfa0ee68084a1fb6f3` — because what those rows
assert is that a number *moves*, and a number that never moved cannot be shown to move by a single
run.

**Pinning the script is not enough here, and that is what this section learned.** Its rows count
elements, relationships and items, so a model or tree that grows re-decides every one of them while
the script's hash sits still. The baseline is the cheaper second check on both:

```
architecture → requirements holds: 52 tag application(s) on 19 of 38 element(s) and relationship(s), naming 37 accepted item(s).
requirements → architecture holds: all 37 accepted, active item(s) in an obliging tier are tagged, of 93 item(s) in the tree — 5 proposed, 1 retired and 50 verification item(s) are outside the population.
```

**Read that pair before trusting a figure below.** If it does not reproduce, the tree has moved and
every count here is suspect. A date, a commit and an md5 cannot say that on their own: this section
carried all three and was false anyway, because what had moved was the model rather than the script.
No row here is worded *the tree's real state* — a row keyed on what the tree happens to hold dates the
moment the tree changes, silently. Each case is its own extraction of the named commit, never `HEAD`;
`node_modules` may be symlinked here, the `check-arch` fixtures needing a copy only because of
`git add --intent-to-add`, which this check never runs.

**There is no all-bound fixture, and the headline must-fail row is a seed.** When the second direction
landed, the tree held accepted items the model bound nowhere; #119 bound the last of them, which
inverted the arrangement. Every must-pass row is now the plain extraction and the defect direction is
seeded.

### Must fail — tags → tree

Each is seeded on the plain extraction, so an unbound report appearing beside the expected diagnostic
would mean the seed had disturbed the second direction as well. None did.

| Case | Input | Reported |
|---|---|---|
| Identifier naming no item | a three-digit `SYS` identifier the tree does not hold, declared and applied to the `Layout assembly` element | `no such item in the requirements tree` |
| Mis-cased identifier | an accepted `SRS` item's own number, lower-cased, declared and applied the same way | `mis-cased — items are upper-case` |
| Declared, applied to nothing | SRS023<!-- The backend establishes no client identity and gates no route on one --> declared with no application anywhere | `declared and applied to nothing` |
| Item not accepted | SRS023<!-- The backend establishes no client identity and gates no route on one -->, which is `proposed`, declared **and** applied | `the item is proposed, not accepted` |
| Item retired | SRS005<!-- One validation implementation -->, `active: false`, declared and applied | `the item is retired` |
| Tag that is not an identifier | `needs-srs`, taken from the model on `origin/main` | `not a requirement identifier` |
| No tag at all | every declaration and application stripped from both model files | the *names no requirement* guard |
| Model that does not parse | a tag where the grammar wants a closing brace | `the model does not validate`, from `likec4 validate` |

**The no-tag seed asserts the count it removes**, which is the cheapest independent check on the
baseline: it fails unless it deletes exactly **89** lines — 37 declarations and 52 applications. Those
are the two numbers the success line reports, arrived at by deleting rather than counting, so they do
not both come from the same reader.

### Must pass — tags → tree

| Case | Input | Reported |
|---|---|---|
| The model as it stands | no seed | the baseline pair, exit 0 |
| An accepted identifier on an **element** | no seed — ten elements carry tags | " |
| An accepted identifier on a **relationship** | no seed — five logical relationships carry tags | " |
| One identifier applied to several subjects | no seed — SYS003<!-- A deployment is parameterised from outside the image --> sits on four. Applications exceed identifiers | " |
| A relationship carrying no tag | no seed — the bundle-serving edge and six others | " |
| **A tag on a deployment element** | no seed — `publishedImage` carries four, `configurationFile` one | " |
| **A tag on a deployment relationship** | no seed — both mount edges carry SYS003<!-- A deployment is parameterised from outside the image --> | " |
| An item bound on two subjects losing one | SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->'s application on `frontend` deleted, its `layout` application and declaration left | **51** applications on 19 of 38, 37 items, exit 0 — one fewer, still bound |
| Every tag on elements, none on any relationship | all **16** relationship applications removed, the **13** distinct identifiers among them placed on the system element | **49** applications on **13** of 38, 37 items, exit 0, and the export confirms zero relationship subjects carry a tag |

**Seven of those rows need no seed, which is exactly what makes them weak** — an arm never read and an
arm that reads and approves are the same exit code. The two deployment rows are the arms `c8f1511`
added, so each has a control moving the item out of the logical model entirely:

| Control | Reported |
|---|---|
| SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->'s only application moved onto the `secretFiles` **deployment element** | passes — 52 applications on **20** of 38, all 37 bound |
| The same application moved onto the `publishedImage -> runningContainer` **deployment relationship** | passes — 52 applications on **20** of 38, all 37 bound |

Were either group unread, that item would be reported *declared and applied to nothing* and *tagged
nowhere*, which is what it does report when the tag goes onto a **view** instead. The relationship
row's seed selects bodies by which brace a relationship line opened, not by indentation, and is
confirmed by reading the export for surviving relationship tags rather than by an exit status that is
0 either way.

**A premise this check rests on and does not test:** in the deployment-elements section it reads, an
`instanceOf` entry carries no tags — it does not inherit its logical target's. A LikeC4 version
propagating them there would leave every run green while the completeness rule went hollow for every
item bound to an instantiated container. Re-run that row when the pin moves, and read the right
section: the instances are the `.deployments.elements` entries carrying an `element` key, and neither
of the two carries a `tags` key. **The view section shows the opposite and is not what the check
reads** — `.views.<name>.nodes[]` entries of `kind: instance` do carry the instantiated container's
tags, so a selector written on that reads inheritance the checked section does not have and reports
the premise broken when it holds.

### Must fail — tree → tags

| Case | Input | Reported |
|---|---|---|
| **An accepted, active item bound nowhere** | SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->'s declaration **and** its only application removed | `1 of 37 accepted, active item(s) are tagged nowhere`, naming it |
| The tree loads no item | the three tier directories removed | `the requirements tree loaded no item` |
| No document carries an obliging tier | the two obliging tiers removed, the verification tier left with its `parent:` line dropped so the build still resolves | `no document carries an obliging tier` |
| The population is empty | every `status: accepted` in the two obliging tiers flipped to `proposed` — **38** items, 0 left | `no item is accepted and active` |
| A tier the rule has no answer for | a fourth document, prefix `OPS`, parented to `SYS`, holding one accepted item | `1 item(s) this rule cannot place, leaving 37 in the population it judged` |
| A status outside the vocabulary | one accepted item's `status` mis-spelled | both arms — an unresolved tag **and** `leaving 36 in the population it judged` |

The first row is a seed because the alternative dated. It removes an item bound on exactly one
subject; an item bound on two is the must-pass row above, and the pair separates *unbound* from *bound
less often*. **It was read in CI as well as locally** — on PR #134 the `architecture` job's last step
fails while the `check-arch` step above it passes, so the step is wired, reached and able to fail its
job.

**The last two rows are question 10, *Unjudged input*, from both sides.** The mis-spelled status is
the sharp one: comparing against `accepted` alone reads it as *not accepted* and drops the item,
indistinguishable from the item being correctly out of scope. That count belongs in the unplaceable
message and not only in the success line, because the success line is absent from a failing run and
the unbound message is absent when nothing is unbound — with an untagged item's status mis-spelled,
both are, and the shrinkage would be real and invisible.

### Must pass — tree → tags, and the controls that show each exclusion works

An exclusion that passes proves nothing on its own: an item skipped for the right reason and an item
skipped because the arm is dead read identically. Each row is a pair.

| Excluded input | Passes | Control: the property removed | Fails, reporting |
|---|---|---|---|
| A retired accepted item bound nowhere | SRS005<!-- One validation implementation -->, in the tree | `active: true` | 1 of **38** — the population grew by the item |
| A `proposed` item bound nowhere | four `SRS` and one `SYS`, in the tree | `status: accepted` on SRS023<!-- The backend establishes no client identity and gates no route on one --> | 1 of **38**, naming that item |
| A verification-tier item bound nowhere | the whole tier, **50** items | one made `accepted` **and** `active`, still untagged | **nothing** — exit 0. It stays out, so the exclusion is by tier |

**The verification tier needed its control most**, because every item in it is `active: false` *and*
`status: proposed`, so exclusion by tier and exclusion falling through the `status` and `active` gates
are indistinguishable on the tree as it stands. Its second control is on the code: deleting the
verification arm from the fixture's script, against that same seed, reports all **50** as unplaceable
and fails.

### What the success line counts

Two lines, one per direction. A failing run prints neither, which shaped the last two rows.

| Case | Input | Reported |
|---|---|---|
| Baseline | no seed | 52 applications on 19 of 38 subjects, 37 items; all 37 of 93 tree items bound, 5 proposed / 1 retired / 50 verification outside |
| One of several applications of the same identifier removed | SYS003<!-- A deployment is parameterised from outside the image --> dropped from one edge, which keeps SRS007<!-- Configuration schema offers no secret-bearing key --> so the subject survives | **51** applications on **19** of 38, **37 items** — applications move alone |
| A subject loses every tag, the applications surviving elsewhere | `pageShell`'s only tag, SRS004<!-- Page renders a legible error state for every configuration failure class -->, moved onto `layout` | **52** applications on **18** of 38, **37 items** — subjects move alone |

**Each of the last two rows moves exactly one of the three numbers**, which makes them evidence that
the three are independent rather than one number spelled three ways. The middle row carries the
argument: the `04cea31` form reported a set union, so an identifier applied twice counted once and
deleting one of its applications left that line **byte-identical** before and after the seed. A count
that cannot move is not evidence. The third row moves the applications rather than stripping them,
because stripping leaves those items unbound, the run fails, and a failing run prints no success line
at all. Nothing gates any of this — a wrong success line fails no build, which is why it went
unnoticed until a model carried both a duplicated identifier and a deliberately untagged relationship
at once.

### Guards, and what they hide

- Both directions report in full rather than the first exiting. **The guards are the exception: each
  exits on the spot**, so the stripped-tag model reports *the model names no requirement* rather than
  37 unbound items. The guard is right; the reader has been told the run stopped, not that the rest is
  clean.
- **Each guard reads something the thing it guards does not** — the obliging-tier guard is keyed on
  the document set, the population guard on `status` and `active`, and the unbound set is a subset of
  the population.
- **The unparseable-model row is the one that matters.** `likec4 export json` behaves like `codegen`
  and **succeeds on a broken model**, emitting a degraded document whose tags have gone missing, so a
  check reading the export without validating first finds no unresolved identifier and prints success.
  Found by a malformed seed, not by design: had the degradation dropped the declarations too, the run
  would have been green.
- **Every degenerate input fails closed** — emptied model directory, removed model directory, removed
  requirements tree, unparseable model. The removed-directory case is the sharp one: `likec4 validate`
  exits **0** on a directory holding no model, so the element guard is the only thing catching it.
- **One export group is guarded and three are not.** Of `elements`, `relations`,
  `deployments.elements` and `deployments.relations`, only the first is asserted non-empty. The other
  three fail closed today because each holds the sole application of some identifier — a property of
  where the tags sit rather than of the check: with `.deployments.relations` dropped the run exits
  **0**, subjects falling 38 → 35 while all 37 items still report bound. A shape change in
  `likec4 export json` is the only input reaching this, so it is recorded rather than fixed. Asserting
  all four keys are **present** — not non-empty, which would red a project with no deployment block —
  is what would make it a property of the check.

**What it does not catch: a tag on a view.** The export carries tags in a fifth place and the scan does
not read it. That is deliberate — a view is a projection of the model rather than a subject in it, and
ADR 0019 rev 5 binds an item to an element or a relationship.

| Seed | Result |
|---|---|
| An item declared and applied **only** on a view | fails — *declared and applied to nothing*, and the item reported unbound |
| A view tag naming an item already applied to an element | passes, exit 0, the counts unmoved — the view tag is invisible in both directions |

The verdict is right in both and the message is not. This is also the control for the deployment rows
above: the same move into a group the scan **does** read passes. `globals`, `imports` and
`manualLayouts` carry no tag-bearing subject; `imports` is empty in a single-project setup and is the
next place to look if a second LikeC4 project is added.

**`check-arch` is unaffected, asserted rather than assumed** — `git status --porcelain` taken before
and after a run in a git fixture is unchanged, with zero index entries.

## `check-site`

The recipe runs `doorstop_to_needs.py` and then `sphinx-build -W`, so any warning fails the gate.

| Direction | Input |
|---|---|
| Must fail | a toctree naming a document that does not exist |
| Must fail | an unknown directive |
| Must fail | a duplicate explicit label |
| Must fail | an item whose link names a parent the tree does not hold — the generator emits a warning |
| Must fail | malformed item YAML — the generator raises rather than warns |
| Must pass | the tree as it stands |
| Must pass | a `.yaml`-suffixed item — it reaches the generated pages rather than being dropped |

The `.yaml` row closes the third of three raw item loaders. Two are in `scripts/`; this one is the
generator, and leaving it would have meant the tree gates judging an item the published site silently
omits, with warnings-as-errors unable to report a page nobody asked for.

**What it does not catch**, both run and observed. A broken MyST cross-reference does not fail the
build: `conf.py` sets `suppress_warnings = ["myst.xref_missing"]`, so the MyST forms are silently
dropped, while Sphinx's own `{ref}` role is not covered by that suppression and still fails under
`-W`. A new top-level document does not orphan-warn, because `docs/site/index.md` carries `:glob:`
toctrees that adopt it. Both are configuration choices, but they mean this gate asserts *the site
builds*, not *the site is internally consistent*.

## The requirements-tree checks

All seven run against a copy of the tree. Each passes on an unseeded copy, which is the must-pass row
every table below shares and none repeats.

### `check-unreviewed.py`

| Direction | Input |
|---|---|
| Must fail | an item with its `reviewed:` line deleted |
| Must fail | `reviewed: true` — Doorstop's declared-review placeholder, which YAML makes a bool |
| Must fail | `reviewed:` present but empty |
| Must fail | a `.yaml`-suffixed item with no fingerprint |
| Must fail | an item with no `reviewed:` whose link carries the parent's real stamp, copied by hand |
| Must fail | one silo removed; one renamed; one emptied; all three removed |
| Must fail | a document with no items — a fourth tier, or one nested below a silo |
| Must fail | a nested document holding an item with no `reviewed:` |
| Must fail | two nested documents sharing a directory name, one of them empty |
| Must pass | a fourth tier, and a nested document, each holding one reviewed item |
| Must pass | a `.doorstop.yml` under `.venv/`, a tool's directory rather than a tier |

The pasted-stamp row fails on the value of the item's own `reviewed:`, not on the paste — a copied
stamp is byte-identical to an earned one. Reading the pairing as forgery was tried and is wrong:
`doorstop clear` on an item with no `reviewed:` stamps the link and leaves `reviewed: null`, so the
rule would accuse a contributor halfway through the clear-then-review order. Dot-directories are
skipped on Doorstop's own convention
([ADR 0002 rev 1](../docs/decisions/0002-requirements-management-doorstop.md)). The `.yaml` row
matters because the loader is a hand-rolled glob, unlike its siblings which go through
`doorstop.build()`, and Doorstop indexes a `.yaml` item a `*.yml` glob never sees.

**Known gaps.** A quoted, non-empty `reviewed:` string spelling falsehood passes, the check testing
only that the value is a non-empty string; closing it means pinning Doorstop's internal encoding into
our gate for a defect reachable only by deliberate hand-forgery, whose item fails the next real
validation on content mismatch anyway — the owner ruled on 2026-08-02 to record rather than close it.
Any non-empty `reviewed:` switches the pasted-stamp rule off; Doorstop's own validation catches that
state later in `check-reqs`, and a pasted stamp on a genuinely reviewed item is invisible everywhere,
both digests being correct for their content. Malformed item YAML raises a traceback rather than the
tool's diagnostic; it still exits non-zero, so it fails closed.

### `check-suspect-links.py`

| Direction | Input |
|---|---|
| Must fail | the parent of an inactive item mutated, so the child's stamp goes stale |
| Must fail | an inactive item linking a parent UID the tree does not hold |
| Must pass | a **`SYS`** item mutated — its `SRS` children are active, so nothing inactive went stale |

The `SYS` row is the easy case to record wrongly. This check covers only inactive items; every `TST`
item is inactive and no other item is, so mutating a `SYS` parent proves nothing about it. A first
pass seeded exactly that and read the pass as evidence the check was broken.

**Documented gap, not to be closed.** A `TST` item's *own* fingerprint is checked for presence, never
correctness: inactive items are invisible to `doorstop --error-all`, and this check scopes itself to
link staleness, so a stale stamp on a `TST` item's own text or attributes passes all three tree
checks. This is #80's pending-population gap, and the owner ruled on 2026-07-30 not to gate it — a
re-stamp on every placeholder edit is the most common act in a tree pass, and the CLI cannot reach an
inactive item.

### `validate-tree.sh`

| Direction | Input |
|---|---|
| Must fail | a link naming a parent UID the tree does not hold, on an **active** item |
| Must fail | a `TST` item activated — the pending-tier exception reports itself dead |
| Must fail | the venv's `doorstop` absent — named as missing, not diagnosed as a live tier |
| Must pass | the tree as it stands |

The activation row is the wrapper's self-retirement: with an active `TST` item the exception is no
longer needed, and rather than passing quietly it says so and tells the reader to delete the wrapper,
restore the bare command and close #78. A guard that cannot notice it has become unnecessary is how a
dead exception survives as a passing gate. An adversarial pass tried to make the exception mask a real
defect and could not: the *no items* message does collide between *all items inactive* and *no items
exist*, but in this tree's topology it never occurs without a distinct second error line from the
active tiers.

The interpreter row is the one the wrapper could not answer for itself. Every branch reads Doorstop's
output; with no interpreter there is none, and the last branch printed the activation diagnostic over
that silence — a specific claim about a tier from a run that read no tree.

### `check-method-consistency.py`

| Direction | Input |
|---|---|
| Must fail | a blanked `verification-justification` |
| Must fail | a parent at `inspection` above children at `test` — overstating |
| Must fail | a capitalised `Test` on a parent |
| Must fail | a typo such as `tset` |
| Must fail | the `verification-method` key deleted |
| Must pass | a `normative: false` item carrying an empty method and no justification |

The last three are one defect and it is the worst kind. An unrecognised value ranked as nothing and
the rule then *skipped* the item rather than judging it, so a single mis-typed character exempted an
item from the check meant to judge it while the run still reported the methods consistent. The same
shape came back in the fix: the success line kept counting every item loaded while the rules had
narrowed to the items that oblige something, so a blanked justification on a non-normative item
printed a clean sentence over a population the run had not judged. A review caught it; the seeding did
not.

### `check-text-citations.py`

| Direction | Input |
|---|---|
| Must fail | an identifier in an item's `text` |
| Must fail | a **lowercase** identifier in an item's `text` |
| Must pass | an identifier in `rationale` |

Lowercase was invisible rather than wrong until the regex was made case-insensitive. A mis-cased
identifier defeats this rule exactly as an uppercase one does: the reader still needs a lookup, and a
renumber still leaves the sentence pointing at whatever now occupies the number.

### `check-headers.py`

| Direction | Input |
|---|---|
| Must fail | an emptied header — which also trips the prefix-free rule, an empty string prefixing every other header |
| Must fail | a header containing `/`, outside the permitted set |
| Must fail | a header containing an en dash |
| Must fail | a header containing a **non-breaking space**, leading or mid-string |
| Must pass | a header folded across two lines in the YAML block scalar |

The non-breaking space is the row that matters, and the script's own docstring predicted it: the
permitted set is an allowlist because a list of characters to reject fails open on the one nobody
enumerated. The allowlist was right; the normalisation in front of it was not. `str.split()` and
`str.strip()` are both unicode-aware and folded U+00A0 into ordinary whitespace before the allowlist
saw it — retiring exactly the character it existed to catch. The first fix replaced the split and left
the strip, so a mid-string space was caught while a leading one still passed; both had to go. A
zero-width space, not being whitespace to Python, was caught throughout. A *trailing* non-breaking
space is unreachable rather than accepted: Doorstop strips it from the block scalar before the check
reads the header, confirmed by reading `item.header` directly.

### `check-citations.py`

| Direction | Input |
|---|---|
| Must fail | a citation naming no item |
| Must fail | a citation carrying the wrong header for a real item |
| Must fail | an `ADR` number naming no file |
| Must fail | a **lowercase** identifier, cited or not |
| Must fail | a mixed-case identifier |
| Must pass | an identifier or ADR number inside a fenced code block |
| Must pass | a word merely containing an identifier |
| Must pass | a correct uppercase citation with its verbatim header |

Case is the row that matters. A lowercase citation with a fabricated header on a *real* item passed
clean — the exact failure the check exists to catch, invisible rather than reported. The owner ruled
on 2026-08-02 that a mis-cased identifier is malformed, and
[`../docs/CI.md`](../docs/CI.md) § *Documentation integrity* records the rule. That rule cannot state
its own counter-example: an identifier written there in any case is read as a citation, so the
malformed spellings are described rather than shown — the check caught the documentation of itself on
the first run.

**Two wrapping rules, and they differ.** The `ADR` pattern admits exactly one line break between the
word and its number; the header normaliser admits any number, including a blank-line paragraph break.
Neither is a false-resolve — CommonMark reads the comment as one either way — and the difference is
between two readers rather than between a document and its code. An earlier wording in `docs/CI.md`
described the header with the pattern's limit.

## `check-commit-msg.sh`

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

## `adr-rev-reach.py`

Not a check — it reports and exits zero, and sits outside `just verify`
([ADR 0022 rev 1](../docs/decisions/0022-rev-reach-enumerated-not-gated.md)). Its cases are still
recorded here, because what it must and must not list is the same kind of claim every row above makes.
Exercised against the sweep that motivated it, `52bb933` on the branch squashed as `197d075`.

| Direction | Case | Input | Reported |
|---|---|---|---|
| Must list | The sweep that hid two false claims | `52bb933^ 52bb933` — three ADRs revved, the tree re-pinned | 55 citations, including both lines whose claim the same commit falsified |
| Must not list | A sentence the author rewrote | `52bb933^ 8f43ccb` — the same sweep with the two fixes folded in | neither line; an edited line falls out of the pairing rather than being tested and passed |
| Must not list | An administrative rev | an ADR revved with a changelog line and nothing else | classified *body unchanged*; none of its citations appear |
| Must not list | A rev the sweep merely passed through | an ADR whose only body edit is re-pinning its own citations of the revved record | classified *body unchanged*, so the sweep does not cascade into the records it crosses |
| Must not list | No rev in range | `8f43ccb 62c0a48` | `no ADR revved between these trees; nothing to re-read`, exit 0 |

The two *body unchanged* rows are the pair that matters, and they are why substance is compared with
the head rev line dropped, the *Revisions* section dropped, and every rev token in the remainder
masked. Without the masking, every record a sweep crosses differs textually while asserting what it
asserted before, and its own citations join the list — the report grows with the sweep rather than
with the work. The two rows were seeded together over a clean `main` and re-run: 30 citations
reported, none of them from either seeded ADR.

**The list shrinks only on an edit.** A reviewer who reads a sentence and finds it still true leaves
it untouched, so it is listed again next run. That is not a defect to close: reaching zero would
reward editing a sentence cosmetically to clear it.

**Its population is complete only while `check-adr-revs` is green** — a citation a sweep missed fails
that gate and never reaches this tool.

## Confirming a gate in CI rather than locally

Local runs prove the script; they do not prove the step is wired, reached, and able to fail the job.
For that, push a branch that adds its own name to `checks.yml`'s `push:` trigger — no pull request is
needed, and the `process` job skips itself on a push event — seed the defect, read the run, then push
the same branch with the seed removed and confirm it goes green.

Two things only a real run shows. A step that exits non-zero fails its job and the steps after it do
not run, so seeding two defects into one job shows the first gate to fail and hides the second — two
seeds want two pushes. And a seed placed in `pages.yml` is read by the checks without that workflow
ever executing, which is how a write grant can be tested without any run ever holding it.
