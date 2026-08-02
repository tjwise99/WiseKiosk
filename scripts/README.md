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

Covers only the `github-actions` entry assertion; the rest of the check predates this record.

| Direction | Input |
|---|---|
| Must fail | the `github-actions` block deleted from `.github/dependabot.yml` |
| Must pass | a `github-actions` entry whose `patterns:` is a block list rather than inline |

## `check-verify-ci-parity.mjs`

| Direction | Input |
|---|---|
| Must fail | a recipe in `just verify` whose script runs in no workflow step |
| Must pass | the tree as it stands |

## `check-branch.sh`

Covers the ticket-metadata and epic-membership assertions
([ADR 0013](../docs/decisions/0013-work-tracking-invariants.md)); the branch shape, issue resolution
and recorded-linkage assertions predate this record.

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

## Confirming a gate in CI rather than locally

Local runs prove the script; they do not prove the step is wired, reached, and able to fail the job.
For that, push a branch that adds its own name to `checks.yml`'s `push:` trigger — no pull request is
needed, and the `process` job skips itself on a push event — seed the defect, read the run, then push
the same branch with the seed removed and confirm it goes green.

Two things that only a real run shows. A step that exits non-zero fails its job, and the steps after it
do not run — so seeding two defects into one job shows the first gate to fail and hides the second, and
two seeds want two pushes. And a seed placed in `pages.yml` is read by the checks without that workflow
ever executing, which is how a `contents: write` grant can be tested without any run ever holding it.
