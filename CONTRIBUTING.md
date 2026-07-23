# Contributing to WiseKiosk

The human contributor entry point: how to run the checks and how a change gets merged. The **project
facts** live in [`docs/`](docs/FOUNDATIONS.md) — start with
[`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md), which is standalone and everything else hangs off it.
Working rules for an AI agent are layered on top in [`CLAUDE.md`](CLAUDE.md).

## Before you build anything

This project is **design-first**: nothing is implemented that has not been written down first.

- A change with a real rejected alternative gets an [ADR](docs/decisions/README.md).
- A new module follows the five-part contract in [`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md) §6 and
  the test obligations in [`docs/TESTING.md`](docs/TESTING.md).
- Do not build anything on the "what must not be built" list (FOUNDATIONS §5).

## Running the checks

Everything CI runs is available locally through [`just`](https://github.com/casey/just):

```sh
just              # list recipes
just verify       # run every check the PR gate runs
```

Once per clone, `just install-hooks` points git at the repo's hooks (`.githooks/`, plain sh +
grep — no toolchain needed): an advisory
`commit-msg` check and a `pre-push` branch check, so the process gates fire before CI does.

Current gates (they grow as code lands):

- `just check-links` — every relative link in every tracked Markdown file resolves inside the repo.
- `just check-eol`   — no tracked text file has CRLF line endings.
- `just check-branch` — the branch is named `type_number-snake_name`, links an open issue labeled
  with its type, and its default-base PR records the ticket linkage (plain sh + curl + jq, like
  the hooks — no toolchain).

## Tickets, branches, and titles

Enforced by the `process` CI check ([ADR 0006](docs/decisions/0006-process-gates.md)):

- **Ticket first.** Open an issue from one of the templates before branching; the branch embeds
  its number.
- **Branch names** follow `type_number-snake_name`, e.g. `task_27-process_gates` — `type` is the
  issue-template set (`task`, `bug`, `design`, `module`), `number` the issue's number, the name
  lowercase snake_case. `main` and Dependabot branches are exempt.
- **PR titles are Conventional Commits** (`feat: …`, `fix(scope): …`) — the repo squash-merges, so
  the title becomes the commit on `main`. Branch commit messages are advised on locally by the
  `commit-msg` hook but not gated in CI.
- **The PR's Development field must link its ticket** — link the issue there (a `Closes #N` body
  keyword writes the same record on default-base PRs); the CI gate checks GitHub's recorded
  linkage on every open PR, and the linked ticket closes when the PR merges.

## Getting a change merged

- Size a change by what can be **read in one sitting**. A slice that cannot be reviewed has not been
  reviewed, whatever its size.
- Keep the diff scoped to intended files only.
- Sweep the docs for any claim the change invalidated — there is no automated accuracy checker.
- Verify via CI, not by trusting a local run.
