# `check-repo-silo.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

Covers all four assertions: the root listing, the shebang-recipe ban, Dependabot manifest resolution,
and the `github-actions` entry.

Re-exercised under #54 container image and publish, script md5
`71b6118115840c94d5d4aa3a5ce1c850`, when the `docker` ecosystem gained a manifest mapping and the
one exception to the non-root rule — [ADR 0021 rev 1](../../docs/decisions/0021-repository-layout.md)
puts the `Dockerfile` at the repository root. Every must-fail row below was re-run against the
changed check; the root row was run once per language ecosystem, so the exception is shown not to
reach them, and the two `docker` rows were added there. A passing run over this branch's head reports
**7 Dependabot entries** resolving to their manifests.

| Direction | Case | Input |
|---|---|---|
| Must fail | Manifest at the root | `package.json`, `go.mod`, `pyproject.toml` and `requirements.txt`, each at the repository root |
| Must fail | Environment directory at the root | `.venv/` |
| Must fail | Recipe carries a shebang | a `probe-recipe` opening `#!/usr/bin/env bash`, grouped under `docs` and reachable from no gate — the assertion is over every recipe, not the ones `verify` runs |
| Must fail | The dump names no recipe | `just --dump` returning an empty recipe set, so the loop cannot judge anything |
| Must fail | A module hides a script recipe | `mod deploy` beside a `deploy.just` whose `push` recipe opens `#!` — the dump lists it under `modules`, not `recipes` |
| Must fail | Entry names a directory that does not exist | the `pip` entry pointed at `/nope` |
| Must fail | Entry's directory holds no manifest | the `pip` directory emptied of `requirements*.txt` |
| Must fail | Entry points at the root | `directory: "/"` on the `pip`, `npm` and `gomod` entries in turn |
| Must fail | A `docker` entry at the root the `Dockerfile` has left | the root `Dockerfile` deleted, the entry still at `/` |
| Must fail | A `docker` entry whose directory holds no `Dockerfile` | the `docker` entry pointed at `/deploy` |
| Must fail | Ecosystem with no manifest mapping | `package-ecosystem: cargo` |
| Must fail | Entry declares no directory | the `directory:` key removed |
| Must fail | No `github-actions` entry | the block deleted from `.github/dependabot.yml` |
| Must fail | The parser cannot read the file | `updates:` renamed, so nothing parses |
| Must pass | A `docker` entry at the root, which holds the `Dockerfile` | the tree as it stands |
| Must pass | Manifest below the root | `web/package.json` |
| Must pass | `requirements-dev.txt` satisfies `pip` | the real spelling, which is not `requirements.txt` |
| Must pass | Block-list patterns | a `github-actions` entry whose `patterns:` is a block list rather than inline |

The three root rows and the two `docker` rows are one claim from both directions: the root is
admitted for the ecosystem whose manifest ADR 0021 rev 1 puts there, and for that ecosystem the
manifest is still resolved — a `docker` entry naming a directory without a `Dockerfile` fails like
any other.

The renamed-`updates:` row is the one that matters. The check's guard counts list items under
`updates:` and compares that against what its entry split produced, deliberately sharing no assumption
with the split: a guard keyed on the same literal goes to zero alongside the thing it guards, and the
two then agree that nothing is wrong.
