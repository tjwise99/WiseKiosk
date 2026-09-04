# `check-repo-silo.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

Covers three assertions: the root listing, the shebang-recipe ban, and the root `renovate.json`
resolving to the pinned `tjwise99/wise-renovate` preset.

Re-exercised under #54 container image and publish, script md5
`71b6118115840c94d5d4aa3a5ce1c850`, when the `docker` ecosystem gained a manifest mapping and the
one exception to the non-root rule — [ADR 0021 rev 3](../../docs/decisions/0021-repository-layout.md)
puts the `Dockerfile` at the repository root. Every must-fail row below was re-run against the
changed check; the root row was run once per language ecosystem, so the exception is shown not to
reach them, and the two `docker` rows were added there. A passing run over this branch's head reports
`renovate.json` resolving the pinned `tjwise99/wise-renovate` preset.

| Direction | Case | Input |
|---|---|---|
| Must fail | Manifest at the root | `package.json`, `go.mod`, `pyproject.toml` and `requirements.txt`, each at the repository root |
| Must fail | Environment directory at the root | `.venv/` |
| Must fail | Recipe carries a shebang | a `probe-recipe` opening `#!/usr/bin/env bash`, grouped under `docs` and reachable from no gate — the assertion is over every recipe, not the ones `verify` runs |
| Must fail | The dump names no recipe | `just --dump` returning an empty recipe set, so the loop cannot judge anything |
| Must fail | A module hides a script recipe | `mod deploy` beside a `deploy.just` whose `push` recipe opens `#!` — the dump lists it under `modules`, not `recipes` |
| Must fail | renovate.json missing | `renovate.json` deleted from the repository root |
| Must fail | extends lacks the runner preset | `extends` holds entries, none starting `github>tjwise99/wise-renovate` |
| Must fail | extends preset unpinned (no `#`) | `extends: ["github>tjwise99/wise-renovate"]`, no `#tag` |
| Must fail | extends a same-prefix repo, not the preset | `extends: ["github>tjwise99/wise-renovate-fork#v1"]` — shares the prefix but names a different repository |
| Must fail | file is not JSON | `renovate.json` edited to invalid JSON |
| Must pass | The real `renovate.json` | the tree as it stands, `extends: ["github>tjwise99/wise-renovate#v1.0.0"]` |
| Must pass | Manifest below the root | `web/package.json` |
