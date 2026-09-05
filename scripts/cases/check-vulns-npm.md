# `check-vulns-npm` (`scripts/vulns/check_vulns.py --scope npm`)

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Dependency vulnerabilities*'s and § *The exception register*'s;
how to run a case is [`../README.md`](../README.md)'s.

**No fixture is committed** — [ADR 0010 rev 2](../../docs/decisions/0010-runtime-materialised-gate-fixtures.md)
forbids a resolvable vulnerable artifact in the tracked tree. Every row below is a throwaway directory
built at record time, run through the production script (`python3 scripts/vulns/check_vulns.py --scope
npm --npm-dir <dir> --register <register>`) with `--npm-dir` pointed at it. npm 11.16.0, Node 24.18.0.
The main fixture:

```sh
d=$(mktemp -d)
cat > "$d/package.json" <<'EOF'
{
  "name": "seed",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "minimist": "1.2.5"
  }
}
EOF
( cd "$d" && npm install --package-lock-only --ignore-scripts )   # network required
```

`minimist@1.2.5` carries [GHSA-xvch-5gv4-984h](https://github.com/advisories/GHSA-xvch-5gv4-984h),
Prototype Pollution, `critical`, fixed at `1.2.8`. The bumped and first-party variants below are the
same fixture with one field of `package.json` changed, each independently re-installed
(`--package-lock-only --ignore-scripts`).

| Direction | Case | Input |
|---|---|---|
| Must fail | The fixture, unregistered | the fixture above, empty register (`[]`) — exits 1: `GHSA-xvch-5gv4-984h (minimist) is unregistered — npm audit reports it` |
| Must fail | An expired register entry | `{"advisory": "GHSA-xvch-5gv4-984h", "scope": "npm", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "2020-01-01"}` — exits 1: `register entry ('GHSA-xvch-5gv4-984h'): review_by 2020-01-01 has passed (today is 2026-09-05)`, and the finding itself still fails, unregistered |
| Must fail | A `review_by` more than 90 days out | the same entry with `review_by` 200 days out — exits 1: `register entry ('GHSA-xvch-5gv4-984h'): review_by 2027-03-24 is more than 90 days out (limit 2026-12-04)` |
| Must fail | An orphan entry | `{"advisory": "GHSA-0000-0000-0000", "scope": "npm", ...}`, an id no scan reports — exits 1: `register entry ('GHSA-0000-0000-0000') is an orphan — no npm finding this run reports matches it`, and the real advisory still fails unregistered |
| Must fail | An entry missing a field | the same entry with `no_alternative_because` dropped — exits 1: `register entry #0 is missing field(s): no_alternative_because` |
| Must fail | An entry naming a first-party finding | `package.json`'s own `name` set to `minimist` (matching the dependency it also requires) — `npm audit` then reports the advisory under the key `minimist`, equal to the scanned project's own declared name; registering `GHSA-xvch-5gv4-984h` still fails: `register entry ('GHSA-xvch-5gv4-984h') matches a finding with no exception path (GHSA-xvch-5gv4-984h, package minimist) — first-party — no entry may cover it`, and the finding itself still fails unregistered too (`register=first-party — no entry may cover it — no exception path`) |
| Must pass | The fixture bumped past the advisory | `package.json`'s `minimist` pinned at `1.2.8` — exits 0; `npm audit` reports 0 vulnerabilities, nothing to fail on |
| Must pass | The fixture, registered | `{"advisory": "GHSA-xvch-5gv4-984h", "scope": "npm", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "<today+30d>"}` — exits 0; `register=registered (GHSA-xvch-5gv4-984h)` |
| Must pass | The tree as it stands | this repository's `frontend/`, empty register — exits 0; `npm audit --json` reports 0 vulnerabilities (1 production dependency, 355 dev, per the ticket's own premise) |
| Must pass | A malformed entry belonging to the *other* scope | the pinned fixture, register `[{"advisory": "GHSA-xxxx-xxxx-xxxx", "scope": "go", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "not-a-date"}]` — exits 1 on the fixture's own unregistered advisory as usual, but the malformed `review_by` is never reported: `check-vulns-npm` never examines an entry whose `scope` reads `"go"`. The same register run through `check-vulns-go` (any `--go-dir`) does report it: `register entry #0 ('GHSA-xxxx-xxxx-xxxx'): 'review_by' ('not-a-date') is not an ISO 8601 date` |
| Must fail | An entry with no `scope` field at all, run under **both** scopes | `[{"advisory": "GHSA-xxxx-xxxx-xxxx", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "<today+30d>"}]` — exits 1 under `check-vulns-npm`: `register entry #0 is missing field(s): scope`, plus this fixture's own unregistered advisory; the identical register run through `check-vulns-go` (any `--go-dir`) reports the missing-field problem too |
| Must fail | An entry whose `scope` is a string but neither `go` nor `npm`, run under **both** scopes | `[{"advisory": "GHSA-xxxx-xxxx-xxxx", "scope": "gp", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "<today+30d>"}]` — exits 1 under `check-vulns-npm`: `register entry #0 ('GHSA-xxxx-xxxx-xxxx'): 'scope' must be one of ('go', 'npm'), got 'gp'`; the identical register run through `check-vulns-go` reports the same problem too |

**Known gaps.**

- **A `via[]` entry npm audit reports without a GHSA id in its advisory `url`** — this script dies
  loudly rather than silently skipping it (`npm audit finding for '<pkg>' carries no GHSA id in its
  advisory url`), so a change to npm's advisory URL format would surface as a hard failure here
  rather than a silently shrunk population; not measured as a row because every advisory `npm audit`
  has reported in practice carries a `github.com/advisories/GHSA-…` url.

The two scope-isolation rows above prove [`../../docs/CI.md`](../../docs/CI.md) § *The exception
register*'s scope-routing rule, from the npm side; not a gap.
