# What each check has been exercised against

The inputs each check in this directory has been run against, in both directions: the defect it must
catch, and the legal input spelled differently that it must not reject. What each check *asserts* is
[`docs/CI.md`](../docs/CI.md)'s; this is the record of what was actually tried against it.

**Why the record is kept at all.** A check that reads nothing finds no violations and prints success,
and a check that rejects a legal spelling looks identical to one catching a real defect. Neither shows
up in a green run, so the only evidence that a check works is the list of inputs somebody put through
it. That list is expensive to rebuild and worthless to guess at.

**A check with no section here has no record.** That is a gap in this file, not a claim that the check
is unverified — and not a claim that it is verified either.

**A check's success line says how much it checked, not how much exists.** Those are different numbers,
and only the first is evidence. `check-arch-trace.py` used to print:

```
17 tag(s) over 5 element(s) and 6 relationship(s) resolve to accepted items.
```

The `5` and the `6` are just the size of the model. They read the same whether every element carries a
requirement link or none of them does, so they say nothing about what was verified — and they would
not move if the link broke. It prints this instead:

```
18 tag application(s) on 7 of 11 element(s) and relationship(s), naming 17 accepted item(s).
```

`7 of 11` is what was checked against what exists, so removing a link moves it. The rule is worth
stating because nothing enforces it: a success line fails no build, so a wrong one survives every
green run until somebody reads it.

**This is a snapshot, and nothing fails when it goes stale.** Every check `just verify` runs has a
section below. `just verify` grows — #67 adds signing, SBOM and scanning gates, #54 the container
build, #59 the comment-discipline gate — and each new one arrives with no record and nothing to say
so. **Nothing gates this file at all** — #77 gate CI.md against the workflow covers `CI.md`'s sections
against the workflow's jobs, not this record against the checks, and it is itself unbuildable
([`../docs/CI.md`](../docs/CI.md) § *What is not gated here* says why). So a complete-looking file is
not a standing guarantee; it is a record of what somebody ran, on the day they ran it.

## Running a case

Each case is a throwaway repository holding a single workflow file, so a case cannot pollute the tree it
is testing and a seeded credential-shaped string never reaches a remote. Run it from the repository
root, which is where the `cp` reads from; a case for another check writes that check's input in place of
the workflow.

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

**Confirm the seed applied before reading the result.** A seed that silently fails to land looks exactly
like a working check. When seeding into the tree rather than a fixture, `git diff --quiet <path>` before
running, and treat a clean diff as the case failing rather than passing.

**Give the scratch repository a `git init`, and run the script from inside it.** Every `.mjs` check
resolves its root with `git rev-parse --show-toplevel`, and `check-links.mjs`, `check-docs-index.mjs`
and `check-workflow-hardening.mjs` build their file list with `git ls-files`. In a bare directory
`rev-parse` climbs out to whatever repository encloses it — or fails — and `ls-files` returns nothing,
so the check reads no files and prints success. That is the fail-open this file exists to catch,
wearing the costume of a passing case. **Copy the script under test into the scratch tree**, not the
other way round: the Python checks derive the tree they read from their own `__file__`.

**Doorstop cases run against a copy of the tree, never the tree.** `sh scripts/validate-tree.sh` runs
`doorstop --error-all`, which stamps a review fingerprint into any unstamped item — a mutation
[`../CONTRIBUTING.md`](../CONTRIBUTING.md) says must never be cleared by re-running. A faithful copy is
`git archive HEAD | tar -x -C <dir>` plus a symlink at `docs/requirements/.venv`; all seven tree checks
pass on one unseeded, which is what makes it a fixture rather than an approximation. Afterwards,
`git status --short docs/requirements/` on the real repository is the proof no case escaped.

**Copy the script under test in fresh each time.** A fixture built from `git archive` carries the
scripts as they were at `HEAD`, so a case run inside it exercises the *old* script and a fix appears
to do nothing. This produced three false "unfixed" results before it was noticed.

## `check-workflow-hardening.mjs`

### Must fail

| Case | Input |
|---|---|
| Unpinned action | `uses: actions/checkout@v7` |
| Expression as the reference | `uses: ${{ env.ACTION }}` |
| Pinned, no version comment | a 40-hex SHA with the trailing `# vN` removed |
| Container action on a tag | `uses: docker://alpine:3.19` |
| Reference the parser cannot read | `uses:` with its value on the following line |
| Flow-mapping step, unpinned | `- {uses: actions/checkout@v4, with: {x: 1}}` |
| Second reference on a flow line | `steps: [{uses: …@<sha>}, {uses: …@v4}]` |
| Quoted flow reference, unpinned | `steps: [{uses: "actions/checkout@v4"}]` |
| Reference hidden by an apostrophe | `- {msg: don't, uses: …@v4, other: 'x'}` |
| Reference hidden by a quoted `#` | `- {args: "a # b", uses: …@v4}` |
| Unpinned action after a block scalar ends | a `run: \|` step, then `- uses: actions/checkout@v4` |
| Unpinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@v4` |
| Write grant carrying a comment | `contents: write # seeded`, with a second grant below it |
| Quoted write level | `contents: 'write'` |
| Blanket write | `permissions: write-all` |
| Flow mapping granting write | `permissions: {contents: read, actions: write}` |
| Multi-line flow mapping granting write | the same across three lines |
| Unreadable line inside the block | a line under `permissions:` that is not a grant |
| No top-level block | the workflow declares none |
| Block with nothing under it | `permissions:` followed by the next top-level key |
| No workflow discovered | a repository with no file under `.github/workflows` |

### Must pass

| Case | Input |
|---|---|
| SHA pin | `uses: actions/checkout@<sha> # v7.0.1` |
| Quoted SHA pin | the same with the reference in double quotes |
| Digest-pinned container action | `uses: docker://alpine@sha256:<64 hex>` |
| Repository-local action | `uses: ./.github/actions/local` |
| Flow-mapping step, pinned | `- {uses: …@<sha>, with: {x: 1}} # v7.0.1` |
| Apostrophe beside a pinned flow reference | `- {msg: don't, uses: …@<sha>, other: 'x'} # v7.0.1` |
| No action at all | a job whose only step is `run:` |
| Workflow fixture inside a heredoc | a `run: \|` body containing `- uses: actions/checkout@v4` |
| Comment on the block-scalar header | `run: \| # materialise a fixture` above the same body |
| Pinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@<sha> # vN` |
| `uses:` named in an echoed string | `run: echo "pin it as - uses: owner/action@sha"` |
| `uses:` named in a trailing comment | `run: node x.mjs # rewrites each - uses: line` |
| `uses:` inside a `with:` value | `command: build - uses: cache` |
| `uses:` inside an `env:` value | `NOTE: "a, uses: b"` |
| Read-all with a trailing comment | `permissions: read-all # least privilege` |
| Empty flow mapping | `permissions: {}` and `permissions: { }` |
| Flow mapping, all read | one line and across several |
| Quoted scope key | `"contents": read` |
| Quoted read levels | `contents: 'read'`, `actions: "none"` |
| Comment inside the block | a comment line between `permissions:` and its grants |
| Job-level elevation | `pages: write` and `id-token: write` in a job's own block |
| Block placed after `jobs:` | the top-level block declared below the jobs it governs |

The last row of each table is the pair that matters most: the check must reject a workflow it cannot
read, and must not reject a workflow that is merely spelled unusually. Four defects were found by the
second column alone — the first three fixes for a fail-open each rejected a legal workflow, and the
fourth hid a step behind its own `if:` condition.

### Known rejections

Legal YAML this check rejects. Each fails loudly, naming its file and line, and each needs a spelling
this repository does not use; closing them means another cut at the matcher, and every previous cut
introduced a defect. They are accepted rather than undiscovered.

| Input | What happens |
|---|---|
| `env: {A: 1} # see the uses: rule` | reported as a layout the check cannot read |
| `- {name: "uses: nothing", run: echo hi}` | the same: a flow step is not skipped as free text |
| `env: {NOTE: "a, uses: b"}` | read as a reference, and fails as unpinned |

The third is the flow spelling of a value the table above lists as passing. The block spelling still
passes; only inside a flow mapping is the string read as a reference.

## `check-repo-silo.mjs`

Covers all four assertions: the root listing, the shebang-recipe ban, the Dependabot manifest
resolution, and the `github-actions` entry.

### Must fail

| Case | Input |
|---|---|
| Manifest at the root | `package.json`, `go.mod`, `pyproject.toml` and `requirements.txt`, each at the repository root |
| Environment directory at the root | `.venv/` |
| Recipe carries a shebang | a `probe-recipe` whose body opens `#!/usr/bin/env bash`, grouped under `docs` and reachable from no gate — the assertion is over every recipe, not the ones `verify` runs |
| The dump names no recipe | `just --dump` returning an empty recipe set, so the loop cannot judge anything |
| A module hides a script recipe | `mod deploy` beside a `deploy.just` whose `push` recipe opens `#!` — the dump lists it under `modules`, not `recipes`, so the loop over recipes never sees it |
| Entry names a directory that does not exist | the `pip` entry pointed at `/nope` |
| Entry's directory holds no manifest | the `pip` directory emptied of `requirements*.txt` |
| Entry points at the root | `directory: "/"` on a non-`github-actions` entry |
| Ecosystem with no manifest mapping | `package-ecosystem: cargo` |
| Entry declares no directory | the `directory:` key removed |
| No `github-actions` entry | the block deleted from `.github/dependabot.yml` |
| The parser cannot read the file | `updates:` renamed, so nothing parses |

### Must pass

| Case | Input |
|---|---|
| Manifest below the root | `web/package.json` |
| `requirements-dev.txt` satisfies `pip` | the real spelling, which is not `requirements.txt` |
| Block-list patterns | a `github-actions` entry whose `patterns:` is a block list rather than inline |

The renamed-`updates:` row is the one that matters. The check's own guard counts list items under
`updates:` and compares that against what its entry split produced — deliberately sharing no
assumption with the split, because a guard keyed on the same literal goes to zero alongside the thing
it guards, and the two then agree that nothing is wrong. Renaming the key is what proves the guard
fires rather than joining the silence.

## `check-verify-ci-parity.mjs`

### Must fail

| Case | Input |
|---|---|
| Recipe runs in no workflow step | a `just verify` check whose script no step invokes |
| Token names no command its recipe runs | a recipe's command changed, `CHECK_TOKENS` and the workflow left untouched |
| Command covered by no token | the `git diff --exit-code` line of `check-arch` with its token removed |
| A dependency on the recipe's header line | `check-links: link-lint`, where `link-lint` runs a script no token covers |
| Truncated token hiding a dropped argument | CI's staleness command shortened to `git diff --exit-code docs/architecture/`, dropping `docs/ARCHITECTURE.md` |
| Shebang recipe on the gate path | a `verify` check whose body opens `#!`, which cannot be mapped to CI commands |
| A command that does not resolve to text | a body line interpolating a variable, which names no fixed command |
| `verify` depends on nothing | the dependency list emptied, so the loops below judge an empty set |
| A module the dump does not fold in | `mod deploy`, whose recipes sit outside `recipes` and are read by nothing here |
| A dump with no `modules` map | `just` stubbed to drop the key, where its absence would otherwise read as "no module declared" |
| A dump with no `shebang` field | the same stub dropping it per recipe, where its absence would otherwise read as "not a script" |
| Recipe widened past its token | `git diff --exit-code docs/architecture/ docs/ARCHITECTURE.md docs/CI.md` in the recipe, the workflow unchanged |
| Recipe line prefixed `-` | `-node scripts/check-links.mjs`, which discards the command's failing status so the recipe passes where CI's identical command fails; `@-` and `-@` likewise |
| A continuation with no line after it | a recipe body ending on a trailing `\` |
| Recipe with no `CHECK_TOKENS` entry | a new name added to the `verify` recipe |
| Stale `CHECK_TOKENS` entry | a mapped check removed from the `verify` recipe |
| CI step matching nothing | a named step running neither a mapped check nor an allowlisted one |
| Token surviving only in a step's `name:` | the command renamed, the old path left in the step title |
| Token commented out inside a `run: \|` block | the command replaced by a whole-line comment |
| Token surviving only in a **trailing** comment | the step deleted, its path left after a `#` on another step's line |
| The same, on a line holding a quoted value | the path left after a `#` on a `key: "value"` line |
| The same, after an unbalanced apostrophe | the path left after a `#` on a line whose value carries `it's` |
| A comment covering an unmapped step | a step matching nothing, its body naming a mapped path only in a comment |

### Must pass

| Case | Input |
|---|---|
| The tree as it stands | — |
| Commands reordered within a recipe | `check-reqs`'s first two commands swapped |
| A command split across a `\` continuation | `check-links` written as `node \` then `scripts/check-links.mjs` |
| A comment line inside a recipe body | `check-links` with a `#` line above its command |
| A recipe line prefixed `@` | `@node scripts/check-links.mjs`, and `@ node …` with the whitespace `just` allows after the prefix — both suppress the echo rather than naming a different command |
| `#!` below the first body line | a shell comment, which `just` runs rather than treating as a script body — only the first line opens one |
| A recipe reached through `just <recipe>` | `check-arch`, whose commands come from `arch-export` |
| CI spelling a command with an extra argument | `sh scripts/check-branch.sh "$HEAD_REF"`, where the recipe passes none |
| A toolchain step | a step named `Install …`, which prepares a check rather than being one |
| An unnamed step | `- uses:` infrastructure with no `name:` |
| A quoted `#` in a command | `run: … && echo "pin # it"` beside a real token |
| An unquoted `#` with no leading space | `run: … --tag=#x`, which YAML does not read as a comment |

The trailing-comment rows are the ones that matter, and they need their control to mean anything: a
step deleted outright **is** caught, which is what made the comment cases holes rather than a
misreading of the design.

Two simpler spellings each leave a hole no row describes. Skipping any line
that contains a quote closes the quote-free spelling and leaves `key: "value" # token` open. Tracking
quote state closed that and left an *unbalanced* quote — an apostrophe in `it's` — opening a phantom
scalar that swallowed the rest of the line, while newly rejecting a legal workflow whose escaped quote
closed the tracker early. Both were found by review, neither by the seeding that prompted the fix.

What holds is YAML's own rule rather than a heuristic about quotes: **a quote is syntactic only where
a scalar may begin** — after the indent, an optional `- `, and an optional `key:`. Anywhere else it is
an ordinary character, so an apostrophe in prose opens nothing, and a `#` inside a genuinely quoted
scalar stays content.

## `check-docs-index.mjs`

Covers every assertion the check makes. A case here is a throwaway repository holding a **minimal
fixture index** — a three-row table over `README.md`, `decisions/` and `architecture/` — rather than a
copy of the real documentation set, so a case states its own premise and the tree cannot drift out
from under it.

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
| Must pass | a new ADR under `docs/decisions/`, claimed by the `decisions/` subtree row without a row of its own |
| Must pass | a second tracked `.md` added under `docs/architecture/` |
| Must pass | an `.md` nested two levels under a subtree row (`docs/decisions/sub/X.md`) |
| Must pass | an `.md` added under a dot-directory (`.github/`) |
| Must pass | a **new** top-level dot-directory (`.notes/NOTES.md`) — the accepted trade, see below |
| Must pass | a row whose rendered text and link target differ (`decisions/` → `decisions/README.md`) |

The rows exercise several distinct reporting paths, not one: an unclaimed document, a row link that
resolves to no tracked file, a rendered path naming nothing, a duplicate row, an empty cell, and an
index whose table shape has gone. A check reporting through a single path would pass most of these
while asserting nothing else, so the spread is the point rather than the count.

### Known rejections

Legal Markdown the check refuses. Each was run against a frozen extraction and observed; all fail
closed, so none can let a defect through, and each is a constraint on how `docs/README.md` may be
written rather than a defect in the document.

| Input | Reported as |
|---|---|
| GFM alignment delimiters in the separator row (`\|:---\|:---:\|---:\|`) | the delimiter read as a *Document* cell, which is not a backticked-path link |
| a second Markdown table anywhere in the file | `a row has 2 cells, expected Document, Guarantees, Excludes` |
| a fenced table example — a code fence is not skipped | `a row has 2 cells, …` |
| the table indented one to three spaces, which still renders | `no index row parsed — the table's shape has moved` |
| a *Document* cell whose link text carries no backticks | the cell read as not a backticked-path link |
| an escaped pipe inside any cell | `a row has 4 cells, …` |

The consequential one is the second: every `|`-leading line in `docs/README.md` is read as an index
row, so the file may hold exactly one table and no fenced example containing one. `docs/CI.md` and
ADR 0014 rev 1 both say a *Document* cell *renders* as a path, where the check requires a Markdown link
whose text is a backticked path — the prose is looser than the code.

**What it does not catch.** Two things, both run and observed rather than reasoned about.

**A new top-level dot-directory is excluded the moment it exists**, with no edit anywhere: adding
`.notes/NOTES.md` alone gives exit 0. This is the accepted trade recorded in ADR 0014 rev 1 — it is what
buys the absence of an exclusions list, since anything that is *not* a dot-directory cannot be
excluded without changing this check. The check names the machinery directories it skipped on every
run, so a new one is on screen rather than inferred from a count. An earlier revision of this PR
carried an exclusions list instead; two one-line edits to it turned out to hide a document, one of
them needing no other change at all.

The population comes from `git ls-files`, so a document that exists but has not been staged is
invisible. CI checks out committed state and is unaffected; a local run before `git add` is not. This
matches `check-links.mjs`, which draws its file list the same way.

## `check-branch.sh`

Covers the ticket-metadata and epic-membership assertions
([ADR 0013 rev 3](../docs/decisions/0013-work-tracking-invariants.md)), and the branch-shape, exemption and
issue-resolution assertions below.

The shape and exemption cases reach no network: the branch name is passed as `$1`, and both paths
return before the first API call.

| Direction | Input |
|---|---|
| Must fail | `nodashes` — no separator at all |
| Must fail | `task-87-name` — a hyphen where the underscore belongs |
| Must fail | `feature_87-name` — a type outside `task\|bug\|design\|module` |
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
has to reject it on kind rather than on existence.

**A case here is not a fixture.** This check reads live GitHub state, so a case is a real throwaway
issue mutated between runs, and the branch name is passed as `$1` rather than checked out. Read the
mutated field back before each run — a seed that silently failed to apply looks exactly like a
passing check. The cases below ran against throwaway issue #89, closed afterwards.

| Direction | Input |
|---|---|
| Must fail | an issue with no milestone |
| Must fail | an issue carrying two type labels (`task` and `design`) |
| Must pass | the same issue with the second type label removed |
| Must pass | an issue carrying a non-type companion label (`design` + `documentation`) |

The companion-label row is the one that matters most: `documentation` is declared by
`design_decision.md` and rides on every design ticket, so a count that read *all* labels rather than
type labels would reject the repository's own conforming tickets and look like a working check while
doing it.

The guards over the check's own inputs were seeded against a copy of the script, since both concern
the script misreading rather than the ticket being wrong — one reading a doctored
`branch-shape.regex` placed beside the copy, the other a doctored GraphQL query:

| Direction | Input |
|---|---|
| Must fail | a `branch-shape.regex` carrying a second pattern line, so the type set no longer has one answer while the branch still matches |
| Must fail | a single-line regex holding a top-level alternation (`^(foo\|bar)_baz$\|^(task\|…)_…`), so one group is extracted, the branch matches through the other alternative, and the extracted set does not hold the branch's type |
| Must pass | the same copy with the real regex restored |
| Must fail | the GraphQL `parent` selection returning `databaseId` instead of `number`, against an issue that has a parent, so the response is error-free and every enclosing object is present |
| Must pass | the unmodified query against the same issue |

The second failing row is why two guards stand over the regex file rather than one: a top-level
alternation satisfies the group count, and only the membership check — the branch matched that
pattern, so its type must be in the extracted set — rejects it.

The `databaseId` row needs an issue that **has** a parent. Against an unparented one the check
correctly passes, because a `parent` of null is legitimate however the selection below it is spelled;
running it on an unparented issue and reading the pass as evidence would record the opposite of what
the row claims.

The parent number is asserted rather than defaulted because a `parent` key that is present and null is
how *legitimately no parent* arrives, while anything else means the query stopped naming what is read
— and `// ""` erases that difference, printing `Issue #64 has no parent, and PR #88 targets the
default branch` for a fact the run never read. The assertion reaches the scalar the code consumes,
not a container holding it: asserting the issue node passes an aliased `parent`, and asserting
`parent` passes a selection returning `databaseId` — a plausible edit here, since the sub-issues REST
endpoint this repository calls wants the database id and not the number.

The epic-membership assertion needs a pull request, so its cases ran against PR #88 itself rather
than a throwaway, by re-running the `process` job against mutated live state:

| Direction | Input |
|---|---|
| Must fail | the branch's issue given a parent while its pull request targets the default branch |
| Must pass | the same issue with the parent removed |

Both were observed in CI rather than only locally, which is what shows the step is reached and can
fail the job. **Two cases are unrun**: a pull request into an integration branch whose issue is not a
sub-issue of the anchor, and one whose issue is. Both need a throwaway integration branch, a child
branch and a pull request between them; the owner declined that on 2026-08-02 as more repository
churn than the case is worth. So the non-default-base path — anchor parsing, the
shape-conformance failure, and the membership comparison — has no live evidence, and the historical
instance that motivated it (PR #79 into `design_18-closing_review`, whose ticket was never a
sub-issue of the anchor) cannot serve as one: the gate exits at the open-issue check before reaching
it, because that ticket is closed.

## `check-links.mjs`

### Must fail

| Case | Input |
|---|---|
| Link to a missing file | an inline link whose destination names no file |
| Link escaping the repository | a destination climbing above the repository root with `../` |
| Link leaving through a symlink | a tracked symlink to a file outside the repository, linked normally |
| Host not on the allowlist | an inline link to a host absent from `upstream-hosts.txt` |
| Bare URL, host not allowed | the same host written as running text |
| Allowlist entry naming no service | a line in `upstream-hosts.txt` with no `—` description |
| Unterminated code fence | a fence that never closes, which would blank the rest of the file |
| HTML anchor to a missing file | a raw HTML anchor whose `href` names no file |
| Reference definition to a missing file | a link-reference definition whose destination names no file |

### Must pass

| Case | Input |
|---|---|
| Valid relative link | an inline link resolving to a tracked file |
| Link with an anchor | the same destination carrying a heading fragment |
| Pure in-page anchor | a destination that is a fragment and nothing else |
| Another scheme | a `mailto:` destination |
| Allowlisted host, as a link and as bare text | `https://github.com/o/r` both ways |
| Image link | the image form of a resolving destination |
| URL containing parentheses | an allowlisted URL whose path carries a bracketed segment |
| Link title | a resolving destination followed by a quoted title, with and without a fragment |
| Angle-bracketed destination | the same destination wrapped in angle brackets |
| Valid HTML anchor and reference definition | the same three syntaxes, resolving |
| In-repo symlink | a symlink whose target is inside the repository |
| Prose that resembles a definition | a sentence opening with a bracketed label and a colon |

The symlink pair is the one that matters. `resolve()` and `existsSync()` both follow a symlink without
reporting that they did, so a path whose *text* stays inside the repository said nothing about where it
landed — the check's own invariant, defeated with no signal in either direction. The three-syntax rows
are the same lesson from the other side: matching only Markdown's inline form leaves two other ways of
writing a relative path entirely unread.

### Known rejections

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

The inline-code-span row has a consequence for this file. **This section cannot show its own cases**:
backticks do not exempt a link from the scan, so writing one out as an example makes it a real link
that must resolve. The cases above are therefore described rather than quoted. The first draft quoted
them, and `just verify` failed on this file — the same way the uppercase-identifier rule in
[`../docs/CI.md`](../docs/CI.md) could not spell its own counter-example.

### What it does not catch

**A link inside a fenced block, broken or off-allowlist, passes.** That is deliberate — a fenced block
is a sample, not a reference, and allowlisting a host to satisfy a code sample would put it in the
register on the strength of an example. **The file list comes from `git ls-files`**, so a document that
exists but has not been staged is invisible locally; CI checks out committed state and is unaffected.

## `check-eol.sh`

`git grep -lIP '\r$' -- .`, inverted: the check fails if that finds anything. `git grep` answers 1
both for *searched, found nothing* and for *there was nothing to search*, and anything else when the
search itself failed — so the three are separated, and the population is established before a clean
result means anything.

| Direction | Input |
|---|---|
| Must fail | a tracked file containing CRLF, in `.txt` and in `.md` |
| Must fail | the search failing rather than finding nothing — run outside a repository, where git exits 128 |
| Must fail | a repository with no tracked file, where git exits 1 over an empty pathspec |
| Must pass | an all-LF tree |
| Must pass | a binary file containing CR — excluded by `-I` |
| Must pass | a genuinely untracked CRLF file |
| Must pass | CR appearing mid-line, where the line still ends in LF |

### What it does not catch

**A file whose `.gitattributes` sets the `binary` attribute.** That attribute both exempts the file
from CRLF→LF normalisation when it is added *and* makes `-I` skip it during the grep, so genuinely
CRLF-terminated text commits and survives a fresh clone unseen. A plain `-text` does **not** do this;
only the full `binary` macro. `.gitattributes` declares `binary` on the image, font and PDF globs —
files that are not text, which is the attribute used as intended — so the reachable case is a *text*
glob given the attribute. The owner ruled on 2026-08-02 not to gate that, so the honest statement of
what holds is that **the LF invariant holds for files git treats as text, and `.gitattributes` decides
which those are.**

Worth keeping beside that: the check is not made redundant by git's own normalisation. A CRLF blob
forced into history via `hash-object`/`update-index`, bypassing the add-time filter, is still caught
after a fresh checkout.

## `check-adr-index.mjs`

### Must fail

| Case | Input |
|---|---|
| ADR file with no row | a new `0003-gamma.md` |
| Row naming no file | a row for `0003` with no such ADR |
| Row linking the wrong filename | the row's target renamed |
| Two files carrying one number | `0002-beta.md` beside `0002-dup.md` |
| Two rows for one number | the row duplicated |
| Numbering not contiguous from 0001 | a gap, and an ADR numbered `0000` |
| File not named `NNNN-<slug>.md` | `notes.md`, and a five-digit `00010-x.md` |
| A directory named like an ADR | `0002-notreal.md/` holding a file |
| A dangling symlink named like an ADR | a link to a nonexistent target |

### Must pass

| Case | Input |
|---|---|
| The index as it stands | — |
| A new ADR plus its row | both added together |
| `TEMPLATE.md` and `README.md` | skipped by name |
| A non-`.md` file, and a subdirectory | `notes.txt`, `assets/` |
| A row target carrying a title, angle brackets, `./` or an `#anchor` | four spellings of the same filename |
| A 4-space indented example row | not a table row, because it does not start with `\|` |
| A row in a Markdown file outside `docs/decisions/` | only the index is read |

The directory row is the one that matters: `readdirSync` reports *names*, so an entry counted as an ADR
on the strength of its name alone needed only a matching row to be reported as fully agreeing. A
`statSync().isFile()` closes it.

### Known rejections

A row inside a fenced code block is read as a real index row — there is no fence blanking — so
`docs/decisions/README.md` may not carry a fenced example table. `name.endsWith(".md")` is
case-sensitive, so an ADR named with an uppercase extension is invisible rather than rejected; no such
file exists, and the naming rule the check enforces would reject one on sight if it were spelled
`NNNN-<slug>.MD`.

## `check-adr-revs.py`

Every case below was run on 2026-08-05 by seeding the working tree, running `python3
scripts/check-adr-revs.py`, and restoring. The seeded state is described rather than committed — and
described without spelling a live ADR number, which this check reads as a citation like any other.

### Must fail

| Case | Input |
|---|---|
| Prose citation with no rev | a pinned citation in `CONTRIBUTING.md` cut back to the bare form |
| Prose citation pinning a stale rev | the same citation moved to a rev its ADR does not carry |
| Link titled with a bare number | a titled link in `docs/CI.md` retitled to the number alone |
| Link title naming a different ADR than it targets | the title's number changed, the target left |
| **Ordinary prose inside a *Revisions* section** | a sentence carrying an unpinned citation and a bare-titled link, one line below a legal changelog line |
| **The same, indented so it continues the changelog line** | the exemption drops staleness, not form |
| **A changelog continuation naming a number no ADR carries** | a rev that has moved is exempt; an ADR that does not exist is not |
| **An unpinned citation beside a correctly titled link** | both on one line, naming the same ADR |
| **A stale citation in an index row's *Decision* cell** | a supersession note written into the free-prose column |
| Index rev column disagreeing with the ADR's head | one row's rev raised, its head left |
| An ADR head with no `**Rev:** N` | the line deleted from one ADR |
| **An ADR revved with no changelog line for the new rev** | head and index row to rev 2, every citation moved, *Revisions* untouched |
| Citation of a number no ADR carries | the same citation renumbered past the highest ADR |
| **A plural, a hyphen, or the wrong case** | `ADRs NNNN and NNNN`, `ADR-NNNN`, and the lowercase spelling |
| **An underscore, a hash, a doubled space, too few digits** | four more separators and widths on one line |
| **A reference-style link or a raw `<a href>` to an ADR** | each appended to `docs/TESTING.md` |
| **A link to an ADR whose title carries brackets** | a bracketed phrase inside the title, over an ADR target |
| **A link to an ADR wrapped across two lines** | the opening bracket on the line above |
| The head format changed everywhere, so nothing parses | `**Rev:**` renamed in all twenty ADRs |
| **The prose citation spelling drifted, so none is recognised** | `CITATION` altered not to match |
| **The link spelling drifted, so none is recognised** | `TARGET` altered not to match |
| An ADR revved with one citation left behind | one ADR to rev 2, every citation but one moved |

### Must pass

| Case | Input |
|---|---|
| The tree as it stands | — |
| An ADR revved with everything moved with it | one ADR to rev 2: head, index row, a new changelog line, and all its citations |
| A changelog line pinning a rev that is not current | a supersession line on that same rev-2 ADR |
| An indented continuation of one, pinning a stale rev | the wrapped form of the same line |
| An index row's leading self-link | every row in the index table |

**The exemption was narrowed twice, and the second time is the instructive one.** It began as the
whole *Revisions* section: an ordinary citation placed inside it passed with exit 0 while the
identical text one line outside failed. Narrowing it to the changelog line's *shape* moved the hole
rather than closing it — a citation on an indented continuation was still exempt, and a continuation
is ordinary prose. What closed it was narrowing the exemption's **effect** instead of its extent: a
changelog citation is exempt from being *current* and from nothing else, so it must still name a real
ADR and still carry a rev. Two narrowings of extent, one of effect; only the last one held. This is
CONTRIBUTING question 11, *Narrowed guards*, twice over — the exemption was written to stop a false positive and was
twice the place a bypass could be spelled.

The same narrowing applies to the index row, which drops only the leading self-link.

**The two rev-2 cases are the pair that matters**: same tree, differing only in whether one citation
moved, one passing and one failing. Without both, "the exemption works" and "the exemption is narrow"
are indistinguishable.

**The link reader is anchored on the target, not the title.** Titled-pattern matching missed a link
whose title carried a bracketed phrase: the title pattern cannot cross a closing bracket, so the link
was never matched at all and passed with exit 0 — precisely the defect the link rule was added for, and the empty-population guard could not see it
because the other links kept the count non-zero. Walking back from the closing bracket to its match
also surfaced **two live citations in `docs/site/` that no reader had ever seen**: their titles were
wrapped across a line break, so the prose reader saw no number beside `ADR` and the title reader saw
no opening bracket. Both were unpinned and both were counted by nothing. The tree's citation count
went from 227 to 229 on this fix alone.

**The legal input this rejects:** a link to an ADR wrapped across two lines, and a link whose title
carries an escaped closing bracket. Both are valid Markdown and both now fail, because a title the
reader cannot resolve must not be passed over. The two wrapped instances in `docs/site/` were
rewrapped; no escaped-bracket title exists. The cost is an authoring constraint, and it buys a reader
with no shape a citation can be spelled around.

**The matcher is wider than the accepted form on purpose.** Its first version recognised exactly the
spellings it accepted plus three near-misses, so `ADR_NNNN`, `ADR #NNNN`, a doubled space and a
two-digit number all passed silently — and the hash form is what muscle memory produces in a
repository where every other reference is a ticket number. Recognising a spelling is what lets the
check *reject* it; a spelling it does not match leaves the population instead. What stays outside is
prose naming an ADR without its number, which nothing here decides.

**Deduplicating by text suppressed a real defect.** A prose citation falling inside a link title is
skipped so one defect is not reported twice — but `ADR NNNN` is a substring of the title
`ADR NNNN rev M`, so an unpinned citation beside a correctly titled link was silently dropped. The
test is now the match's position against the title's span. A cosmetic fix produced a fail-open, which
is why the must-fail table carries a row for it.

**The empty-population guards are per reader, not over the total.** A single count of everything
judged hid the prose reader going to zero, because fifty link citations kept the total non-zero and
the run green. Three guards now: no ADR resolved, no prose citation judged, no link citation judged.
Each was seeded by altering the pattern it depends on; each fails.

### Known rejections

An illustrative example spelling a live ADR number is rejected as a stale citation. That is correct,
and it cost three fixes here: `docs/decisions/README.md`, this check's own docstring, and the first
draft of the case tables above each named a real ADR while describing the citation form. Nothing
distinguishes an example from a citation, and a check that tried would be exempting the spelling most
likely to hide a bypass — the counter-example rule in [`../docs/CI.md`](../docs/CI.md) §
*Documentation integrity* already binds this, one document up.

A file whose bytes do not decode as UTF-8 is not scanned; it cannot carry a citation in the form the
rule defines. Every such file is named on stderr rather than silently dropped, so the population the
check reports over stays visible.

The rev pins a version, not an identity. A citation written on a branch across a freeing and a
re-taking of the same number merges green, because at merge time the number resolves and the rev
matches. Nothing here decides it; `../docs/CI.md` § *Documentation integrity* names it.

## `check-arch` — `splice-arch-diagrams.mjs`

The recipe runs `likec4 validate`, `likec4 codegen`, this script, and then `git diff --exit-code`. The
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
| Must fail | an artifact containing a ``` fence marker |
| Must pass | a well-formed pair; two distinct pairs; an artifact in a subdirectory |
| Must pass | a second run — idempotent, md5 stable, reporting *already current* |
| Must pass | an artifact containing backticks mid-line, which closes no fence |

Two rows carry the weight. The symlink one: the escape guard tested the marker *text*, so a symlink
under `docs/architecture/` satisfied it and still read from anywhere on the host — observed splicing a
file from outside the repository into `ARCHITECTURE.md` with exit 0. The fence one: the body is wrapped
in a ```` ```mermaid ```` fence, so a fence marker inside it closed that fence early and spliced the
remainder into the document as running Markdown.

Confirmed separately, because only a real run shows it: a hand edit inside a marker region is
overwritten and the tree goes clean again, and a change to a generated artifact reaches the document,
so `git diff --exit-code` is what catches staleness.

### The three-line gate

| Direction | Input |
|---|---|
| Must fail | a committed artifact no view produces — a view added, exported and its artifact committed, then the view deleted |
| Must fail | a committed view whose artifact was never committed — `view containers of wisekiosk` committed, `generated/containers.mmd` left untracked |
| Must fail | a committed artifact hand-edited away from what the model produces |
| Must pass | the unseeded tree — exit 0, leaving **zero** index entries |

`arch-export`'s `rm -rf`, the `git add --intent-to-add`, and the `HEAD` in the diff are three parts of
one mechanism. **Each was proven necessary by removing it and re-running the row it protects**, on
fixtures built identically and differing only in the recipe. The other cross-cells — each line
removed against each row it does not protect — are sampled rather than confirmed: one was run and
behaved, the rest were not:

| Line removed | Row that then passes wrongly |
|---|---|
| `rm -rf docs/architecture/generated` | artifact with no view — codegen never prunes, so the orphan stays byte-identical to what is committed |
| `git add --intent-to-add` | view with no artifact — a regenerated artifact nobody committed is untracked, and `git diff` reads tracked paths only |
| `HEAD` in the diff | artifact with no view, **again** — `git add` with a pathspec stages the deletion `rm -rf` just made, and an index-relative diff reads worktree and index as agreeing |

The third row is the one to remember. Adding `--intent-to-add` to close the second row silently
re-opened the first, because the two lines act on the same index in opposite directions: one exists to
create evidence of a deletion, the other erases it. It survived a full local `just verify`, six
commits, and a green CI run — CI proves nothing here, because the repository tree holds no orphan, so
the gate has nothing to miss. It was caught only by re-running the *original* finding's own
reproduction against the fix, which is the practice this whole file exists to make routine.

Two traps in seeding this, both hit:

- **`--intent-to-add` persists in the index after a failing run.** Re-running the pre-fix recipe in
  that same tree also exits 1, which reads as the hole never existing. Build each direction its own
  fixture.
- **Symlinking `node_modules/` into a fixture reds the gate**, because the trailing-slash ignore
  pattern does not match a symlink, so `git add -N` marks it. Copy the directory, or assert
  `git check-ignore` before trusting a result.

Two live consequences of `git add -N` taking the whole silo rather than `generated/`: any untracked
non-ignored file under `docs/architecture/` — a scratch note — fails the gate; and after a failing run
`git stash` refuses with *"Entry … not uptodate"* until `git reset` clears the marker. Staged
in-progress work under `docs/architecture/` also fails the gate, where an earlier form of the recipe
passed it.

#### What it does not catch: the index

**The comparison is HEAD against the worktree, so the index is never a party to it**, and
`arch-export` rewrites the worktree before the diff runs. Staged content that diverges from the
worktree is therefore invisible — measured at exit 0 for a staged hand-edit of `generated/index.mmd`,
a staged `git rm --cached` of it, and a staged tamper of `../docs/ARCHITECTURE.md`. A plain
`git commit` lands the *index*, so each of those commits content the gate never read; the staged
deletion produces a commit with no `generated/` at all.

This is the same shape as the defect above, one level out: the earlier recipe compared worktree to
index and was blind to HEAD, this one compares HEAD to the worktree and is blind to the index, and no
form of it has compared all three. It is **a local false green only** — `actions/checkout` gives CI a
tree whose index equals HEAD, so the divergent state cannot arise there, and all three instances fail
on the next run against the committed tree. `git add -A` before `just verify` is the ordinary
sequence that produces it.

**Unprobed, and so unevidenced**: worktrees, submodules, `core.fileMode`, `autocrlf`, sparse
checkout, and git older than 2.53.

**`likec4 codegen` has no case here.** That is a gap, not a reasoned exemption: `check-site` seeds
Sphinx's validator in the section below, so "it is a vendored toolchain's own validator" would not
distinguish them.

`likec4 validate` is covered by the invalid-model row under `check-arch-trace.py` below, but only
partly: it was run against the validator directly rather than through the recipe, so what is
evidenced is that the binary exits non-zero on an unparseable model, not that `check-arch` reaches
it.

## `check-arch-trace.py`

Exercised at `5c48ed8`, against `check-arch-trace.py` md5 `62e44de86ab097dfa0ee68084a1fb6f3` —
recorded because a fixture built with `git archive` carries the script as it was at `HEAD`, so a case
can silently exercise the old one. Asserting the md5 of the copy under test before running is what
separates *the fix does not work* from *the fix was not in the tree you ran*.

The counting rows below were exercised against the script at `7883e3b`, md5
`012e4cd6425770ec3ce01b5d1b111216`, and each was run a second time against the one it replaced —
`04cea31`, md5 `62e44de86ab097dfa0ee68084a1fb6f3` — because what those rows assert is that a number
moves, and a number that never moved cannot be shown to move by a single run. Both halves are pinned
to a commit that contains them: a hash paired with a commit whose tree holds a different script tells
a reader nothing about which half is wrong.

### Must fail

| Case | Input |
|---|---|
| Identifier naming no item | a three-digit `SYS` identifier the tree does not hold, declared and applied |
| Mis-cased identifier | the same identifier in lower case |
| Declared, applied to nothing | a declaration with no `#` application anywhere |
| Item not accepted | a tag on an item whose `status` is `proposed` |
| Item retired | a tag on an item with `active: false` |
| Tag that is not an identifier | `needs-srs`, taken from the model on `origin/main` |
| No tag at all | every declaration and application stripped from the model |
| Model that does not parse | a `#tag` where the grammar wants `}` |

### Must pass

| Case | Input |
|---|---|
| The model as it stands | — |
| An accepted `SRS` identifier on an **element** rather than a relationship | the other half of the code path |
| Every tag on elements, none on any relationship | a Container-level model of the shape #97 C4 phase 2 will produce |
| One identifier applied to two subjects | SYS003<!-- A deployment is parameterised from outside the image --> tagging both operator relationships — applications exceed identifiers |
| A relationship carrying no tag | the bundle-serving edge, which no accepted item obliges |

### What the success line counts

| Case | Input | Reported |
|---|---|---|
| Baseline | the model as it stands | 18 applications on 7 of 11 subjects, 17 items |
| One of two applications of the same identifier removed | one SYS003<!-- A deployment is parameterised from outside the image --> application deleted, the identifier still applied once | 17 applications, **17 items** — the counts separate |
| A subject loses every tag **and** their declarations | both tags stripped from the `Frontend` element | 16 applications on **6** of 11 subjects |

The middle row is why the counts are separate rather than one number, and it is the row that carries
the argument. The `04cea31` form reported `len(set(declared) | set(applied))`, so an identifier
applied twice counted once: deleting one of the two applications left its line **byte-identical**
before and after the seed. **A count that cannot move is not evidence.**

The third row is narrower than the second, and the `04cea31` form is not blind to it — that line's
leading count moves too, 17 to 15. What it cannot say is that a **subject** stopped carrying links,
because the only subject figures it reported were `len(elements)` and `len(relations)`, which are
properties of the model rather than results of the check and read `5` and `6` either way. Stripping a
tag *without* its declaration is not this case at all: it fails on the declared-and-applied-to-nothing
arm, on both scripts. The fail-open shape is the one where the declaration goes too, and there the
check is right to pass, because nothing it asserts is violated.

Nothing gates any of this — the success line is read by a person, and a wrong one fails no build,
which is why it went unnoticed until a model carried both a duplicated identifier and a deliberately
untagged relationship at the same time.

**The unparseable-model row is the one that matters.** `likec4 export json` behaves like `codegen`
and **succeeds on a broken model**, emitting a degraded document whose tags have gone missing — so a
check reading the export without validating first sees a model that tags nothing, finds no unresolved
identifier, and prints success. It was found by a malformed seed, not by design: the seed produced
`declared and applied to nothing` for three tags that were, in the real model, applied. Had the
degradation dropped the declarations too, the run would have been green.

**The no-tag row is a guard rather than an arm.** A model carrying no tag resolves every tag it
carries, so an absent architecture → requirements link and a sound one read identically. It is the
third of that shape in this check, beside the guards over the export and over the tree.

**Every degenerate input fails closed**: an emptied model directory, a removed model directory, a
removed requirements tree, and an unparseable model. The removed-directory case is the sharp one —
`likec4 validate` exits **0** on a directory holding no model, so the element guard is the only thing
that catches it, and a check trusting the validator's exit status alone would pass.

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

### What it does not catch

Two things, both run and observed rather than reasoned about. **A broken MyST cross-reference does not
fail the build**: `conf.py` sets `suppress_warnings = ["myst.xref_missing"]`, so the MyST forms — a
bare anchor link, a reference-style link, a `<project:#target>` — are silently dropped. Sphinx's own
`{ref}` role is *not* covered by that suppression and still fails under `-W`. **A new top-level
document does not orphan-warn**, because `docs/site/index.md` carries `:glob:` toctrees that adopt it.
Both are configuration choices rather than defects, but they mean this gate asserts *the site builds*,
not *the site is internally consistent* — the link half of that belongs to `check-links.mjs`.


## The requirements-tree checks

All seven run against a copy of the tree, for the reason in § *Running a case*. Each passes on an
unseeded copy, which is the must-pass row every table below shares and none repeats.

### `check-unreviewed.py`

| Direction | Input |
|---|---|
| Must fail | an item with its `reviewed:` line deleted |
| Must fail | `reviewed: true` — Doorstop's declared-review placeholder, which YAML makes a bool |
| Must fail | `reviewed:` present but empty |
| Must fail | a `.yaml`-suffixed item with no fingerprint |
| Must fail | an item with no `reviewed:` whose link carries the parent's real stamp, copied by hand |
| Must fail | every silo directory removed |
| Must fail | the silos present but holding no item |

The pasted-stamp row is a **report** case, not a verdict case, and the distinction is the point. A
stamp is a digest of the parent's content, so a copy is byte-identical to one `doorstop clear` earned
and nothing reading the tree can tell them apart. Such an item still fails, on the rule about its own
missing fingerprint — what it defeated was the count. Three items authored that way on PR #133 left
the gate reporting seven unreviewed links where the tree held ten, and the three it dropped were
exactly the pasted ones. Re-run against that reproduction, the current check names all three and the
pre-change one names none; both exit 1.

So a link is counted unreviewed when its own stamp is absent, and also when the item holding it is —
nobody has reviewed an item carrying no review, so nobody has reviewed its links either, whatever
they carry. An earlier attempt read the same pairing as evidence of forgery and accused the author of
writing the stamp by hand. That premise is false: `doorstop clear` on an item with no `reviewed:`
stamps the link and leaves `reviewed: null`, which is the first half of the clear-then-review order
[`../docs/requirements/README.md`](../docs/requirements/README.md) documents as the remedy. The check
would have accused a contributor halfway through following it.


The two degenerate rows are the fail-open this file's own preamble names: a loader that reads nothing
finds no violations and prints success, and nothing about that run looks different from a clean tree.
The guard asserts the loader read *something*, not a count — a count would have to be kept in step
with the tree by hand, and a guard keyed on the same number as the thing it guards goes to zero
alongside it and agrees that nothing is wrong.

**Known gap, second.** Any non-empty `reviewed:` string switches this rule off, so a pasted link stamp
on an item carrying `reviewed: notadigest` reports nothing here. That state fails Doorstop's own
validation as `unreviewed changes` further down `check-reqs`, so it is covered — by a different gate,
three commands later, not by this one. And a pasted stamp on a genuinely reviewed item is invisible
everywhere: both digests are then correct for their content, and the tree holds no evidence that the
link's review never happened.

The `.yaml` row is the one that matters: the loader is a hand-rolled glob, unlike its siblings which go
through `doorstop.build()`, and Doorstop indexes a `.yaml` item that a `*.yml` glob never sees. An item
this loader cannot read is exempt from the rule rather than judged by it.

**Known gap.** `reviewed: "false"` — a quoted, non-empty string — passes, because the check tests only
that the value is a non-empty string. Closing it means asserting what a stamp looks like, which pins
Doorstop's internal encoding into our gate for a defect reachable only by deliberate hand-forgery, and
whose item fails the next real validation on content mismatch anyway. Owner ruled 2026-08-02 to record
rather than close it. Malformed item YAML raises a traceback rather than the tool's own diagnostic; it
still exits non-zero, so it fails closed.

### `check-suspect-links.py`

| Direction | Input |
|---|---|
| Must fail | the parent of an inactive item mutated, so the child's stamp goes stale |
| Must fail | an inactive item linking a parent UID the tree does not hold |
| Must pass | a **`SYS`** item mutated — its `SRS` children are active, so nothing inactive went stale |

The `SYS` row is the one that matters, and it is the easy case to record wrongly. This check covers
only inactive items; every `TST` item is inactive and no other item is. Mutating a `SYS` parent
therefore proves nothing about it — an active item's suspect links belong to `doorstop --error-all`.
A first pass seeded exactly that and read the pass as evidence the check was broken.

**Documented gap, not to be closed.** A `TST` item's *own* fingerprint is checked for presence, never
correctness: inactive items are invisible to `doorstop --error-all`, and this check scopes itself to
link staleness. So a stale stamp on a `TST` item's own text or attributes passes all three tree checks.
This is #80's pending-population gap, and the owner ruled on 2026-07-30 not to gate it — a re-stamp on
every placeholder edit is the most common act in a tree pass, and the CLI cannot reach an inactive item.

### `validate-tree.sh`

| Direction | Input |
|---|---|
| Must fail | a link naming a parent UID the tree does not hold, on an **active** item |
| Must fail | a `TST` item activated — the pending-tier exception reports itself dead |
| Must pass | the tree as it stands |

The activation row is the wrapper's self-retirement: with an active `TST` item the exception is no
longer needed, and rather than passing quietly it says so and tells the reader to delete the wrapper,
restore the bare command and close #78. A guard that cannot notice it has become unnecessary is how a
dead exception survives as a passing gate.

An adversarial pass tried to make the exception mask a real defect and could not: the message
`ERROR: TST: no items` does collide between *all items inactive* and *no items exist*, but in this
tree's topology it never occurs without a distinct second `ERROR:` line from the active tiers.

### `check-method-consistency.py`

| Direction | Input |
|---|---|
| Must fail | a blanked `verification-justification` |
| Must fail | a parent at `inspection` above children at `test` — overstating |
| Must fail | a capitalised `Test` on a parent |
| Must fail | a typo such as `tset` |
| Must fail | the `verification-method` key deleted |
| Must pass | a `normative: false` item carrying an empty method and no justification |

The last three are one defect and it is the worst kind. An unrecognised value ranked as nothing, and
the rule then *skipped* the item rather than judging it — so a single mis-typed character exempted an
item from the check meant to judge it, while the run still reported the methods consistent across every
parent. A check that silently declines to judge what it cannot parse reports the same success as one
that judged everything.

The same shape came back in the fix. The success line kept counting every item loaded while the rules
had narrowed to the items that oblige something, so a blanked justification on a non-normative item
printed a clean sentence over a population the run had not judged. The count now names the judged set.
A review caught it; the seeding did not.

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
| Must fail | an emptied header — which also trips the prefix-free rule, since an empty string prefixes every other header |
| Must fail | a header containing `/`, outside the permitted set |
| Must fail | a header containing an en dash |
| Must fail | a header containing a **non-breaking space**, leading or mid-string |
| Must pass | a header folded across two lines in the YAML block scalar |

The non-breaking space is the row that matters, and the script's own docstring predicted it: *the
permitted set is an allowlist, because a list of characters to reject fails open on the one nobody
enumerated.* The allowlist was right; the normalisation in front of it was not. `str.split()` and
`str.strip()` are both unicode-aware and folded U+00A0 into ordinary whitespace before the allowlist
ever saw it — retiring exactly the character the allowlist existed to catch. The first fix replaced
the split and left the strip, so a mid-string space was caught while a leading one still passed; both
had to go. A zero-width space, not being whitespace to Python, was caught throughout.

A *trailing* non-breaking space is unreachable rather than accepted: Doorstop strips it from the block
scalar before the check reads the header. Confirmed by reading `item.header` directly, not inferred
from the check passing.

### `check-citations.py`

| Direction | Input |
|---|---|
| Must fail | a citation naming no item |
| Must fail | a citation carrying the wrong header for a real item |
| Must fail | an `ADR` number naming no file |
| Must fail | a **lowercase** identifier, cited or not |
| Must fail | a mixed-case identifier |
| Must pass | an identifier or ADR number inside a fenced code block |
| Must pass | a word merely containing an identifier, such as `xsrs029y` |
| Must pass | a correct uppercase citation with its verbatim header |

Case is the row that matters. A lowercase citation with a fabricated header on a *real* item passed
clean — the exact failure the check exists to catch, invisible rather than reported. The owner ruled on
2026-08-02 that a mis-cased identifier is malformed, and
[`../docs/CI.md`](../docs/CI.md) § *Documentation integrity* records the rule. That rule cannot state
its own counter-example: an identifier written there in any case is read as a citation, so the
malformed spellings are described rather than shown — the check caught the documentation of itself on
the first run.

**Documented divergence.** `CI.md` and the docstring both say a citation may wrap over *one* line
break; the normaliser accepts any number, including a blank-line paragraph break inside the comment.
Not a false-resolve — CommonMark reads it as one comment either way — but the documented limit and the
implemented one disagree.

## `check-commit-msg.sh`

CI-only: the PR-title form has no local equivalent, since no PR title exists locally. Both modes take a
message file, so both are exercised without any credential.

| Direction | Input |
|---|---|
| Must fail | plain prose; a capitalised type; no colon; an empty scope; an uppercase scope; an empty subject; an unknown type |
| Must pass | `fix: a thing`; `feat(ci): a thing`; `feat(ci)!: a thing` |
| Must pass | `fixup! …` and `Merge branch 'x'` in default mode |
| Must fail | those same two under `--pr-title` |

The last pair is the one that matters: the allowances exist because a fixup or merge commit never
survives the squash, but a PR title *becomes* the commit on `main`, so the same string must be accepted
in one mode and rejected in the other.

## Confirming a gate in CI rather than locally

Local runs prove the script; they do not prove the step is wired, reached, and able to fail the job.
For that, push a branch that adds its own name to `checks.yml`'s `push:` trigger — no pull request is
needed, and the `process` job skips itself on a push event — seed the defect, read the run, then push
the same branch with the seed removed and confirm it goes green.

Two things that only a real run shows. A step that exits non-zero fails its job, and the steps after it
do not run — so seeding two defects into one job shows the first gate to fail and hides the second, and
two seeds want two pushes. And a seed placed in `pages.yml` is read by the checks without that workflow
ever executing, which is how a `contents: write` grant can be tested without any run ever holding it.
