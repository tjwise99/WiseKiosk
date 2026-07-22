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

Current gates (they grow as code lands):

- `just check-links` — every relative link in every tracked Markdown file resolves inside the repo.
- `just check-eol`   — no tracked text file has CRLF line endings.
- `just check-reqs`  — the Doorstop requirements tree validates: refs resolve, no
  suspect/unreviewed/orphan items.
- `just check-arch`  — the LikeC4 architecture model validates and its generated artifacts are not
  stale.
- `just check-site`  — the documentation site builds clean with warnings-as-errors.

## Getting a change merged

- Size a change by what can be **read in one sitting**. A slice that cannot be reviewed has not been
  reviewed, whatever its size.
- Keep the diff scoped to intended files only.
- Sweep the docs for any claim the change invalidated — there is no automated accuracy checker.
- Verify via CI, not by trusting a local run.
