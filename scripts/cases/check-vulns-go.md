# `check-vulns-go` (`scripts/vulns/check_vulns.py --scope go`)

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Dependency vulnerabilities*'s and § *The exception register*'s;
how to run a case is [`../README.md`](../README.md)'s.

**No fixture is committed** — [ADR 0010 rev 1](../../docs/decisions/0010-runtime-materialised-gate-fixtures.md)
forbids a resolvable vulnerable artifact in the tracked tree. Every row below is a throwaway directory
built at record time, run through the production script (`python3 scripts/vulns/check_vulns.py --scope
go --go-dir <dir> --register <register>`) with `--go-dir` pointed at it. govulncheck v1.7.0 (the
version `backend/go.mod`'s `tool` directive pins), Go 1.26.5. The main fixture:

```sh
d=$(mktemp -d)
cat > "$d/go.mod" <<'EOF'
module fixture

go 1.26
EOF
cat > "$d/main.go" <<'EOF'
package main

import (
	"fmt"

	"golang.org/x/text/language"
)

func main() {
	tag, err := language.Parse("en-US")
	fmt.Println(tag, err)
}
EOF
( cd "$d" && go mod edit -require=golang.org/x/text@v0.3.0 )
( cd "$d" && go get -tool golang.org/x/vuln/cmd/govulncheck@v1.7.0 )
( cd "$d" && go mod tidy )   # network required
```

`golang.org/x/text@v0.3.0` carries [GO-2021-0113](https://pkg.go.dev/vuln/GO-2021-0113) (aliases
`CVE-2021-38561`, `GHSA-ppp9-7jff-5vj2`), fixed at `v0.3.7`, an out-of-bounds read in
`language.Parse` — the symbol the fixture calls directly. The bumped and uncalled variants below are
the same fixture with one line of `main.go` or `go.mod` changed, each independently re-tidied.

| Direction | Case | Input |
|---|---|---|
| Must fail | The fixture, calling the vulnerable symbol, unregistered | the fixture above, empty register (`[]`) — exits 1: `GO-2021-0113 (golang.org/x/text) is unregistered — its trace reaches a called symbol`; 8 other findings from the fixture's own transitive tree print as informational and do not fail |
| Must fail | An expired register entry | `{"advisory": "GO-2021-0113", "scope": "go", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "2020-01-01"}` — exits 1: `register entry ('GO-2021-0113'): review_by 2020-01-01 has passed (today is 2026-09-05)`, and the finding itself still fails, unregistered |
| Must fail | A `review_by` more than 90 days out | the same entry with `review_by` 200 days out — exits 1: `register entry ('GO-2021-0113'): review_by 2027-03-24 is more than 90 days out (limit 2026-12-04)` |
| Must fail | An orphan entry | `{"advisory": "GO-9999-9999", "scope": "go", ...}`, an id no scan reports — exits 1: `register entry ('GO-9999-9999') is an orphan — no go finding this run reports matches it`, and `GO-2021-0113` still fails unregistered |
| Must fail | An entry missing a field | the same entry with `no_alternative_because` dropped — exits 1: `register entry #0 is missing field(s): no_alternative_because` |
| Must pass | The fixture bumped past the advisory | `go.mod` edited to `golang.org/x/text@v0.3.8` (govulncheck reports `Fixed in: golang.org/x/text@v0.3.7`) — exits 0; `GO-2021-0113` no longer appears at all |
| Must pass | The fixture, importing but never calling the symbol | `main.go`'s call replaced by a blank import (`_ "golang.org/x/text/language"`), pinned at the vulnerable `v0.3.0` — exits 0; `GO-2021-0113` still prints, `reachability=informational (not called)`, and does not fail |
| Must pass | The fixture, registered by its primary id | `{"advisory": "GO-2021-0113", "scope": "go", "no_fix_because": "upstream patch not yet vendored", "no_alternative_because": "no alternative BCP47 parser vetted", "review_by": "<today+30d>"}` — exits 0; `register=registered (GO-2021-0113)` |
| Must pass | The same fixture, registered a second time by its GHSA alias instead | the same entry with `advisory` set to `GHSA-ppp9-7jff-5vj2` — exits 0; `register=registered (GHSA-ppp9-7jff-5vj2)` |

**Baseline measurement, this repository's own backend, empty register:** govulncheck v1.7.0 against
Go 1.26.5 reports 8 findings, all in the Go standard library, all fixed at `go1.26.6` — 5 reachable
(`GO-2026-5026`, `GO-2026-5972`, `GO-2026-6089`, `GO-2026-6090`, `GO-2026-6218`) and 3 informational
(`GO-2026-5942`, `GO-2026-6088`, `GO-2026-6091`). This is not a case row: it is the live tree, moving
with the standard library's own advisory feed rather than fixed at a commit, and it is what decides
this gate's reporting-vs-blocking wiring (§ *Dependency vulnerabilities*) against CI's own toolchain
(`setup-go` `"1.27"`), which has not yet been measured.

**Known gaps.**

- **A finding whose scanner-reported package name genuinely names a first-party path passes uncaught
  if the register also names it — this cannot be seeded against a live run.**
  [ADR 0016 rev 8](../../docs/decisions/0016-maintained-tools-for-standard-artifacts.md)'s obligation
  ("no entry matches a first-party finding") is implemented (`check_vulns.py`'s `first_party` field, compared
  against `--go-dir`'s own `go.mod` module line), but govulncheck cannot be made to report a finding
  against the module being scanned: Go refuses a module that requires itself (the self-import a seed
  would need is a compile error, not a runnable fixture), and govulncheck's own JSON confirms the
  scanned main module carries no version in its SBOM (`{"path": "…/backend"}` beside stdlib's
  `{"path": "stdlib", "version": "v1.26.5"}`) — an OSV finding matches by comparing a module's
  version against an affected range, so a module with no version can never match one. The logic is
  therefore verified by inspection rather than by a seed, unlike every other row here.
- **A register entry with no valid `scope` (missing, or neither `go` nor `npm`) fails completeness on
  every run, but is never checked as an orphan, an expiry, or a first-party match by either scope**,
  because both recipes filter to entries whose `scope` matches their own before applying those three
  assertions. The malformed-entry row above is not scope-conditioned (an unknown `scope` value fails
  the same "missing/invalid field" check regardless of which recipe runs), so this gap is narrower
  than it first looks, but it is real: an entry that is otherwise well-formed except for naming the
  wrong scope's advisory under the right scope's value is not caught by anything here.
