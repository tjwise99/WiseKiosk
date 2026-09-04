# `check-branch.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s. The rows
were recorded against the sh form this check converts from (#109 check-branch conversion) and re-run
against the Python form with the sh form beside it on identical inputs, stdout, stderr and exit
status compared byte-for-byte — every row except the two recorded as unrun for both forms. The
trailing-blank rows are the one deliberate deviation: `grep -Ef` reads a blank pattern line as
matching everything, and the Python form drops it instead of failing open.

Covers the ticket-metadata and epic-membership assertions
([ADR 0013 rev 4](../../docs/decisions/0013-work-tracking-invariants.md)) and the branch-shape, exemption
and issue-resolution assertions. Shape and exemption cases reach no network: the branch name is passed
as the sole argument and both paths return before the first API call.

| Direction | Input |
|---|---|
| Must fail | `nodashes` — no separator at all |
| Must fail | `task-87-name` — a hyphen where the underscore belongs |
| Must fail | `feature_87-name` — a type outside the permitted set |
| Must fail | `task_0-name` and `task_087-name` — a zero, and a leading zero |
| Must fail | `task_87-Name` — uppercase in the name |
| Must fail | `task_87-name_`, `task_87--name`, `task_87-`, `task_-name` — malformed separators and empty parts |
| Must fail | `dependabot/npm_and_yarn/foo-1.2.3` — the old exemption is gone |
| Must pass | `main` — the mainline is not a work branch |
| Must pass | `renovate/npm_and_yarn/foo-1.2.3` — Renovate names its own branches |
| Must fail | a number naming a pull request rather than an issue |
| Must fail | a number naming nothing in the repository |
| Must fail | a number naming a closed issue |
| Must pass | this branch, against its real open ticket |

The pull-request row is the one that matters: GitHub draws issues and pull requests from one counter,
so a branch named for a merged pull request resolves to a real object of the wrong kind, and the check
must reject it on kind rather than on existence.

**A case here is not a fixture.** This check reads live GitHub state, so a case is a real throwaway
issue mutated between runs, with the branch name passed as the argument rather than checked out. Read
the mutated field back before each run. The rows below ran against throwaway issue #89 for the sh
form and throwaway issue #165 for the Python form, each closed afterwards.

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
| Must fail | a `branch-shape.regex` carrying a trailing blank line, against a branch matching nothing — a blank line is dropped, not read as an empty pattern matching every name |
| Must pass | a conforming branch against the same trailing-blank copy |
| Must fail | the GraphQL `parent` selection returning `databaseId` instead of `number`, against an issue that **has** a parent, so the response is error-free and every enclosing object present |
| Must pass | the unmodified query against the same issue |

The trailing-blank must-fail row is a fail-open the one-answer guard cannot see: a blank line yields
no type group, so the count stays at one while an empty pattern would admit every name. Two guards
stand over the regex file rather than one because a top-level alternation satisfies the
group count, and only the membership check rejects it. The `databaseId` row needs a parented issue:
against an unparented one the check correctly passes, so reading that pass as evidence would record
the opposite of what the row claims. Without the parent-key assertion, the no-parent default would
erase the difference between *no parent* and *a stopped query*, printing a conclusion the run never
read — the assertion reaches the scalar the code consumes: an aliased `parent` on the issue node,
then a selection returning `databaseId`, a plausible edit since the sub-issues REST endpoint wants
the database id.

The epic-membership assertion needs a pull request, so its cases ran against PR #88 for the sh form
and PR #166 for the Python form, by re-running the `process` job against mutated live state:

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
