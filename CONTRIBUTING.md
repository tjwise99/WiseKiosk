# Contributing to WiseKiosk

The human contributor entry point: how to run the checks and how a change gets merged. For **what
WiseKiosk is**, start at the [README](README.md); for **what it must do**, the specification is the
requirements tree, [`docs/requirements/`](docs/requirements/README.md). The index at
[`docs/README.md`](docs/README.md) names every document and the kind of fact each one guarantees.
Working rules for an AI agent are layered on top in [`CLAUDE.md`](CLAUDE.md).

## Before you build anything

This project is **design-first**: nothing is implemented that has not been written down first.

- A change with a real rejected alternative gets an [ADR](docs/decisions/README.md).
- Anything observable the tree does not already state — an interface name, a payload shape, a config
  key, a failure behaviour, a threshold — is written down as a requirement before it is built.
- A new module follows [`docs/contracts/module-contract.md`](docs/contracts/module-contract.md),
  which is the contract itself, and the test obligations in [`docs/TESTING.md`](docs/TESTING.md).
- Do not build generality against a case that does not exist — no plugin system, no abstraction
  without a second consumer, no transport chosen before the access pattern, no comment-enforced
  invariants, no denylist secret handling, no non-tunable config keys, no controls that do not
  function where deployed.

## Running the checks

Everything CI runs is available locally through [`just`](https://github.com/casey/just):

```sh
just              # list recipes
just verify       # run every check the PR gate runs
```

Once per clone, `just install-hooks` points git at the repo's hooks (`.githooks/`, plain sh +
grep — no toolchain needed): an advisory
`commit-msg` check and a `pre-push` branch check, so the process gates fire before CI does.

`just --list` is the gate roster: every check, with what it asserts beside the recipe that runs it.
What each gate is allowed to let through, and why, is [`docs/CI.md`](docs/CI.md); the review
fingerprint `check-reqs` can stamp is
[`docs/requirements/README.md`](docs/requirements/README.md).

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
  keyword writes the same record on default-base PRs; on integration/epic bases link manually).
  The CI gate checks GitHub's recorded linkage on every open PR; the linked ticket closes when
  the work merges into `main`.

## Getting a change merged

- Size a change by what can be **read in one sitting**. A slice that cannot be reviewed has not been
  reviewed, whatever its size.
- Keep the diff scoped to intended files only.
- Verify via CI, not by trusting a local run.
- Walk the review checklist below against the diff.

## Review checklist

Each question below is an obligation on the author that leaves no artifact, so no check decides it —
the reviewer is the mechanism ([ADR 0011](docs/decisions/0011-requirement-or-convention.md)). The
[pull-request template](.github/pull_request_template.md) points here; it does not repeat the
questions.

**Documentation**

1. **Formalised prose.** Where the change turns a prose obligation into a requirement, does the prose
   cite that requirement instead of stating the obligation as independent normative text?
2. **Described code.** Where the change touches code or configuration that a canonical document
   describes, does it update that document, or declare in the change that no update is needed? The
   [documentation index](docs/README.md) says which document describes what.
3. **Temporal phrasing.** Does the prose state the timeless fact rather than a change — no *now*, *no
   longer*, *as of*? A sentence about what the repository used to do is stale as written.
4. **Architecture links.** Where an architecture element gains an implementation, does its model
   `link` point at the source that implements it?

**Comments**

5. **Mechanism, not reason.** Does each comment the change adds or edits state what the code or
   configuration does, or how it does it? Reason, history and evaluative judgement are authored in a
   documentation home and cited from the comment.
6. **Citation, not restatement.** Where a comment reaches rationale, strip the cited identifier out
   of it. If any assertion still stands on its own, the comment restates rather than cites.

**Code**

7. **Dependencies.** Does a new dependency do work the standard library cannot reasonably do — and
   what does it pull in with it: a native toolchain, a transitive tree, a runtime?
8. **Generality.** Does the change introduce an interface or extension point with a single
   implementation and no second consumer?
9. **Secrets.** Does any output path the change adds — a response body, a response header, a log
   line — carry a secret's value rather than its name?
10. **Unjudged input.** Where the change adds or edits a check, what does it do with input outside
    the set it recognises — a value absent from its lookup, a directory entry it never stats, a file
    extension it does not glob? Skipping is the language's default and it is always wrong for a gate:
    the check shrinks its own population and then reports success over what is left.
11. **Narrowed guards.** Where the change narrows a check so it stops rejecting legal input, is the
    narrowing itself reachable by the defect the check exists to catch? An exemption written to
    prevent a false positive is the first place a bypass gets spelled, and the reasoning that
    produces one reads as caution.

**Requirements**

12. **Module universals.** Where the change adds or edits a module's requirements, does any of them
    state something already obliged of every module — failure rendering, secret delivery, caching,
    request rejection? A module's requirements carry what is true of that module and nothing else
    ([ADR 0012](docs/decisions/0012-module-requirements-in-tree.md)).
