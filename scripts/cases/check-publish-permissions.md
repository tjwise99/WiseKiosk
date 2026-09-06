# `check-publish-permissions` (`scripts/publish/verify_permissions.py`)

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s § *Publishing and provenance*; how to run a case is
[`../README.md`](../README.md)'s.

**Tool:** stdlib Python only, plain text scanning (no YAML parser), matching
`scripts/check-restart-policy.py`'s idiom. Script md5 `1c2d03b7334231c1971331469e2d3d1c` at
`5fc9f90 feat(publish): verify each release with no write scope`; each row below is a scratch
`.github/workflows/publish.yml` fixture carrying that script, run from a copy of the repository
tree so `Path(__file__).resolve().parent.parent.parent` still resolves to a repository root.

| Direction | Case | Input |
|---|---|---|
| Must fail | The `verify` job is absent | the real workflow before this ticket's `verify` job landed — `no 'verify' job was found under 'jobs:'` |
| Must fail | The `verify` job is renamed | `verify:` renamed to `check:`, everything else unchanged — `no 'verify' job was found under 'jobs:'` |
| Must fail | An extra write grant | `permissions: {contents: read, packages: write}` under `verify` — `'verify' permissions are {'contents': 'read', 'packages': 'write'}, expected exactly {'contents': 'read'}` |
| Must fail | No `permissions:` block at all under `verify` | the key deleted — `'verify' declares no 'permissions:' block` |
| Must fail | A `secrets.` reference under `verify` | `run: echo "${{ secrets.GITHUB_TOKEN }}"` as a step body under `verify` — names the exact line, `'verify' references 'secrets.', the one credential it may read is 'github.token'` |
| Must fail | No top-level `jobs:` key | the key removed entirely — `declares no top-level 'jobs:' key, or this cannot read this layout` |
| Must fail | The workflow file is absent | no `.github/workflows/publish.yml` in the fixture tree — `is absent, so this read no workflow` |
| Must pass | The workflow this PR commits | the real `.github/workflows/publish.yml` — `'verify' job permissions are exactly {'contents': 'read'}, no 'secrets.' reference found` |
| Must pass | The permissions value quoted | `contents: 'read'`, the same scalar spelled differently |
| Must pass | A `secrets.` reference in a *different* job | the same string under `publish` or `bring-up`, `verify` unchanged — the scan is job-scoped, bounded by the next sibling job's own line, not the whole file |
| Must pass | The `verify` job listed first, a `secrets.` reference in a later job | `verify` moved above `publish` in `jobs:`, the secrets reference left in `publish` below it — proves the job's own block boundary is found by the *next* key at or above its indent, not by end-of-file |
| Must pass | `github.token`, the one credential the rule allows | `env: { GH_TOKEN: ${{ github.token }} }` under `verify` — contains no `secrets.` substring |

**A real bug this found, before any case above was run against the fixed version.** The first
implementation computed a job's line range from the *last mapping key* inside it
(`scripts/check-restart-policy.py`'s own `block()` helper, reused verbatim) — but a step's body is
YAML list items (`- run: ...`), not `key:` lines, so nothing after a job's last recognised key
(typically `steps:` itself) was ever scanned. A `secrets.` reference inside a step's `run:` block
passed uncaught. Fixed by anchoring the end of a job's block on the *next* key at or above its own
indent (or end of file), which is what the "listed first" row above proves holds in both directions.

**Legal input this rejects.** None found — the two-key permissions grammar (`contents`, `packages`,
`id-token`, `attestations` and no others in this file) and the single job name `verify` leave no
alternate legal spelling the line-scan idiom is known to miss, unlike `check-restart-policy.py`'s
flow-mapping and alias cases (this file's `permissions:` blocks are never written as one-line flow
mappings).

**Known gaps.**

- **No YAML parser.** As with `check-restart-policy.py`, a flow-style `permissions: {contents: read}`
  mapping would read as "declares no 'permissions:' block" (no nested key a line scan can see) rather
  than being parsed correctly — fail-closed, not fail-open, but untested here since the committed
  file never writes permissions that way.
- **Textual, not semantic, `secrets.` matching.** A mention inside a comment or a string literal
  fails the same as a live reference, matching `scripts/check-secret-unwrap.py`'s own textual
  convention; no case here exercises a comment specifically; a live reference already covers the
  matching mechanism.
