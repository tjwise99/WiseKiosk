# 0006 — Gate branch shape, ticket linkage, and PR titles in CI

**Status:** accepted
**Decided:** 2026-07-22 (process-gates design discussion, ticket #27)

## Context

Nothing tied a pull request to a ticket or constrained branch and commit naming: a branch with any
name, referencing no issue, under any title could merge. GitHub's native enforcement for exactly
this — ruleset metadata restrictions on branch-name and commit-message patterns — is
Enterprise-only, so on this repo it is a control that does not function where deployed, the class
FOUNDATIONS §5 forbids. Whatever enforces these conventions has to live in the repo and run where
the repo runs.

## Decision

Four gates, enforced by a `process` CI job on `pull_request` (to become a required check) and
mirrored locally by `just check-branch` and the advisory hooks `just install-hooks` installs. The
entire gate path is plain sh + curl + jq — no toolchain:

1. **Branch shape.** Branches are named `type_number-snake_name` — `type` one of `task`, `bug`,
   `design`, `module`; `number` a GitHub issue number; `snake_name` lowercase snake_case. The full
   pattern is `^(task|bug|design|module)_[1-9][0-9]*-[a-z0-9]+(_[a-z0-9]+)*$`. `main` and
   `dependabot/**` are exempt and pass with the reason stated.
2. **Ticket link.** The `number` must resolve via the GitHub API to a real issue (not a pull
   request), currently open, whose labels include the branch `type`. A shape-valid branch naming a
   dead or mislabeled ticket fails.
3. **Conventional-Commit PR title.** The PR title matches
   `type(scope)?!?: subject` with `type` one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
   `test`, `build`, `ci`, `chore`, `revert`. The repo squash-merges, so the title is the commit
   that reaches `main`.
4. **Recorded PR↔ticket linkage.** Every open PR's Development field (`closingIssuesReferences`)
   must link the branch's issue, whatever the PR's base — so the ticket closes when the PR merges
   into the default branch.

- **The branch types are exactly the issue-template set**, so branch type and ticket template
  cannot drift: a `bug_…` branch links a bug-report ticket, a `design_…` branch a design-decision
  ticket, and a new template implies a new branch type in the same change.
- **CI gates only what survives the squash.** Branch commit messages are discarded at merge; an
  advisory `commit-msg` hook (plain sh + grep) applies the same pattern locally, additionally
  passing `fixup!`/`squash!`-prefixed and merge messages, which never reach `main`. Each pattern
  is defined once (`scripts/*.regex`, POSIX ERE) and read by the hooks and the sh gate scripts
  alike — never declared twice.
- **Gate 4 constrains GitHub's recorded state, not prose.** The record is the PR's Development
  field (`closingIssuesReferences`): link the issue there, or let a body keyword (`Closes #N`)
  write the same record — the gate checks the record pre-merge as a required-check constraint, on
  every base. Body keywords observably record nothing against a non-default base, so a PR based
  elsewhere needs the manual Development link; if the platform records nothing even then, that PR
  cannot pass until it targets the default branch — accepted, since the mainline is where work
  merges.
- **This is a process/scheduling control, explicitly not a traceability channel.** Requirements
  trace stays diff-derived per [ADR 0005](0005-traceability-gating.md); the branch↔issue link
  schedules work, it never evidences it.

## Alternatives considered

- **GitHub-native rulesets** (metadata restrictions on branch and commit patterns). Rejected:
  Enterprise-only, so on this repo the control is inert where deployed — plausible, documented, and
  doing nothing.
- **Gating every branch commit's message in CI.** Rejected: those messages are discarded at squash,
  so CI would block work over text that never reaches `main`. CI gates the surviving title; local
  hooks advise on the rest.
- **Decoupling branch types from issue templates** (the Conventional-Commit vocabulary as branch
  types). Rejected: it loses the branch↔ticket-template correspondence — the property that a
  branch's type names the template its ticket was opened from.
- **Shape-only check without resolving the issue.** Rejected: a typo'd number passes, and the link
  the gate exists to prove goes unchecked.
- **Regex over the PR body for a closing keyword.** Rejected: prose can claim a link the platform
  never recorded — observed live on a stacked PR carrying the keyword with an empty
  `closingIssuesReferences`. The gate reads the recorded state, not the text.
- **CI creating the linkage itself via a write-scoped token.** Rejected: gates verify, they do not
  mutate, and CI stays read-only.

## Consequences

- All five CI checks, `process` included, are required on `main` (strict, admins bound): PRs from
  nonconforming branches cannot merge.
- The in-flight legacy branch (`feat/21-docs-site`) is blocked until renamed and its ticket
  labeled.
- Dependabot is exempt from branch shape; its PR titles already conform (`build(deps): …`).
