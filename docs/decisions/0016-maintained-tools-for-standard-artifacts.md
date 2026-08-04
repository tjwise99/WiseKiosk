# 0016 — Maintained tools for public conventions; authored checks for this repository's own rules

**Status:** accepted
**Decided:** 2026-08-03 (#103 authored-vs-adopted check trade, measured against the cases recorded in
[`../../scripts/README.md`](../../scripts/README.md))

## Context

Fourteen gates guard this repository — the twelve `check-*` recipes [`just verify`](../../justfile)
runs, plus two that exist only in CI: the pull-request-title check and the `secret-scan` job. Nearly
every obligation they assert was authored here, and that was never a decision. The gate records argue
at length about *which hand-rolled form* a check should take — [0005](0005-traceability-gating.md) on
where evidence lives, [0006](0006-process-gates.md) on what the gate reads,
[0014](0014-documentation-index-claims-documents.md) on whether a list may be hand-maintained — and
never about whether to author one at all.

The exceptions show the question has an answer whenever it is actually asked, and there are four of
them. `check-site` is a Sphinx build with warnings-as-errors, adopted by
[0004](0004-docs-site-sphinx-needs.md). `check-arch` validates the model with `likec4 validate`,
adopted by [0003](0003-architecture-as-code-likec4.md). `check-reqs` delegates tree integrity to
`doorstop --error-all`, adopted by [0002](0002-requirements-management-doorstop.md) — and
[`../CI.md`](../CI.md) says so in as many words: *"The requirements tier is covered by `doorstop
--error-all` and is deliberately not re-encoded here."* `secret-scan` is `gitleaks`. So the precedent
exists and is four times recorded; it had simply never been generalised, and in its absence every new
obligation defaulted to being authored.

In one place that default had gone visibly wrong: `check-workflow-hardening.mjs` scans workflow YAML
as plain text with no parser to check action pinning and top-level write permissions — a hand-rolled
subset of an audit that maintained tools perform against a parse tree.

## Decision

**A check is authored where the obligation it asserts is this repository's own rule. Where the
obligation is a public convention, it is delegated to a maintained tool.** The discriminator is what
a check *asserts*, not what it reads: `check-workflow-hardening.mjs` and `check-verify-ci-parity.mjs`
both read `.github/workflows/`, and only the first asserts something every project shares.

**"Maintained" means a real maintenance base, not merely something published.** A widely-used project
with many contributors and a release history is a different object from a single-maintainer action
wrapping twenty lines of API calls. Adopting the latter replaces a reviewable in-repo script with
unreviewed third-party code running against repository credentials, which *adds* supply-chain surface
— the opposite of the reasoning that justifies adoption. Where only such a wrapper exists, the check
stays authored.

Four adoptions follow, each replacing its authored check outright:

| Adopted | Replaces | Lines it retires |
|---|---|---|
| `zizmor` at the `pedantic` persona, with `actionlint` alongside | `check-workflow-hardening.mjs` | 177 |
| `lychee` | `check-links.mjs`, `upstream-hosts.txt` | 123 |
| `commitlint` at both the commit-message and pull-request-title stages | `check-commit-msg.sh`, `conventional-commit.regex` | 40 |
| `pre-commit` as the local hook layer | `.githooks/`, `check-eol.sh` | 33 |

**`commitlint` must preserve the two-stage distinction the authored check carries.** `fixup!` and
`squash!` are permitted at the commit-message stage because the squash discards them, and refused on
the pull-request title because the squash makes that title the commit on `main`
([0006](0006-process-gates.md)). `commitlint`'s `defaultIgnores` *pass* such subjects, so the
pull-request-title invocation runs with them disabled. The pattern keeps the single definition
`conventional-commit.regex` holds today; whether one configuration can serve both stages, or one must
`extends` the other, is left to the implementation.

**The unit this rule sorts is an obligation, not a `just` recipe.** A recipe may run several commands
asserting different things, and three of them carry both kinds: `check-reqs` delegates tree integrity
to Doorstop while five of its six commands assert rules of this repository's own; `check-arch`
delegates model validation to `likec4` while `splice-arch-diagrams.mjs` asserts this repository's
`arch-export` marker format, with eight recorded must-fail rows of its own; and `check-links` is split
by this very decision — its link resolution delegated, its two other obligations retired. Sorting by
recipe would misfile all three, and a census taken that way has already been wrong twice in the
drafting of this record.

The obligations that stay authored are those asserting rules this repository invented: everything in
`check-branch`, `check-citations`, `check-adr-index`, `check-docs-index`, `check-repo-silo` and
`check-verify-ci-parity`, the five repository-specific commands in `check-reqs`, and the marker
checking in `splice-arch-diagrams.mjs`.

**Three obligations are retired outright rather than reimplemented.** Each is dropped as an
obligation, not demoted to an ungated convention: after this, nothing in the repository requires them
and no document asks for them. What each retirement costs is stated here rather than discovered
later.

- **The `# vN` version comment beside a pinned action.** The gate decides presence, not truth: a
  comment left stale against a hand-edited SHA passes clean, so it never secured the property it
  appears to. Dependabot writes and updates the comment on the bumps it performs, which is nearly all
  of them, and that continues — as a tool's behaviour, not as an obligation on anyone.
  **Cost:** a hand-added pin may carry no version comment, and nothing will say so.
- **The host allowlist.** It carries one entry, `github.com`, so its live effect is to refuse
  citations of the tools this repository runs. Documentation may link outward.
  **Cost:** absolute links are no longer constrained to a reviewed set of hosts.
- **The repository-escape check.** **Cost, stated precisely because the retirement is deliberate:**
  [`../../scripts/README.md`](../../scripts/README.md) records two must-fail rows here, not one — a
  destination climbing above the repository root, and a tracked symlink pointing outside it. The
  symlink variant is not hypothetical; it is a defect this check *had* and was fixed for, because
  `resolve()` and `existsSync()` both follow a symlink without reporting that they did. `lychee`
  resolves through such a symlink, finds a file, and passes. Both rows are given up knowingly.

## Alternatives considered

- **Author everything — the status quo.** Its real argument is that [`../CI.md`](../CI.md) states,
  per gate, *what it is allowed to let through*, and no adopted tool ships that sentence. Rejected
  because the sentence survives adoption — what `zizmor --persona=pedantic` lets through is as
  statable as what a script lets through — while the measurements went the other way on substance.
  Against the live workflows `zizmor` reported **seven medium findings the authored check cannot see**
  (`artipacked`, credential persistence on every checkout), and against seeded defects it caught the
  unpinned reference at High severity and both write-permission spellings.
- **Adopt only where the tool is a strict superset, keeping a residue check for the remainder.** The
  shape this decision was expected to take. Rejected, but not uniformly: the version comment and the
  host allowlist did not survive being named, while the repository-escape check did — its symlink row
  records a real defect, and it is given up as a deliberate cost rather than because the obligation
  was found empty. What decides the alternative is that a second gate carrying one residual obligation
  costs more than any of the three is worth, not that all three were weak.
- **`zizmor` at the default persona.** Rejected: it does not report top-level write grants at all,
  which would preserve most of `check-workflow-hardening.mjs` for a narrower reason than it was
  written for. `pedantic` was measured against the live workflows and produced **zero
  excessive-permissions findings** — including no complaint about `pages.yml`'s job-level `pages:
  write` and `id-token: write` elevation.
- **Suppressing `pedantic`'s disagreement over `permissions: read-all` rather than adopting it
  plainly.** `zizmor` reports `read-all`; `check-workflow-hardening.mjs` explicitly permits it and its
  own failure message recommends it. That is a genuine least-privilege disagreement, not a tool error.
  Rejected as unnecessary: neither workflow uses `read-all` — both declare explicit `permissions:
  contents: read` — so the case is hypothetical, and a suppression written against a hypothetical is
  where a bypass gets spelled ([`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) review checklist item
  11).
- **A third-party action for the ticket-linkage obligations in `check-branch`.** Rejected under the
  maintenance test above. GitHub offers no native rule: the `pull_request` ruleset rule takes
  `allowed_merge_methods`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`,
  `require_last_push_approval`, `required_approving_review_count`,
  `required_review_thread_resolution` and `required_reviewers`, and nothing for a linked issue.
  Branch-name enforcement remains a ruleset metadata restriction, which [0006](0006-process-gates.md)
  already rejected as Enterprise-only. What remains are single-maintainer marketplace actions, which
  the maintenance test excludes.
- **`conventional-pre-commit` for commit messages instead of `commitlint`.** Rejected: CI gates the
  pull-request title rather than the commits, so an authored check would still be needed there and the
  pattern would live in two places — the defect the shared regex files exist to prevent.

## Consequences

- **373 lines of authored check are retired**, along with `upstream-hosts.txt` and
  `conventional-commit.regex`, when the implementation tickets land. Four maintained tools enter CI.
- **The corollary is the finding worth carrying:** when a maintained tool covers most of a check, the
  residue usually should not survive either. An authored check accretes obligations nobody would
  choose deliberately, and adopting a tool is what forces each one to be named and defended.
- **Seven `artipacked` findings become actionable** — every `actions/checkout` needs
  `persist-credentials: false`. The authored check never reports them.
- **Practice adapts to the tool, not the reverse.** Two commit titles on `main` exceed `commitlint`'s
  default `header-max-length` of 100, the longest at 122. The default stands and titles get shorter;
  configuring the tool around existing practice would forfeit the reason for adopting it.
- **[0006](0006-process-gates.md) is amended, not superseded.** Its decision states the gate path is
  *plain sh + curl + jq — no toolchain*; `commitlint` and `pre-commit` reverse that property while
  leaving its four gates standing. The amendment block is added in the same change as this record,
  because an ADR cannot be rewritten by a later implementation ticket.
- **Four surfaces are rewritten when each implementation lands**, not here: [`../CI.md`](../CI.md)
  §§ *Action pins and workflow privilege*, *Documentation integrity* and *Repository shape*;
  [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s hook-installation instruction; the `justfile`
  roster, whose `verify` and `install-hooks` doc strings both name mechanisms this retires; and
  `check-verify-ci-parity`, since [`../CI.md`](../CI.md) requires every CI step to be a `just verify`
  check or a named exception — so each adopted tool needs a recipe or an exception.
- **[`../../scripts/README.md`](../../scripts/README.md) loses the sections for the retired checks**,
  and earns its keep for those remaining: its recorded cases, in both directions, were the conformance
  suite this decision was measured against. Seeding the legal variant is what surfaced `pedantic`'s
  `read-all` behaviour.
- **#60 authored-language set was right to block on this.** Its planning had consigned these same 373
  lines to a Python conversion; every one of them would have been rewritten and then retired.
- Adoption is not performed here. One implementation ticket per adopted tool, each sized to be read in
  one sitting.

**Left open, to be carried by the implementation tickets:**

- Whether `lychee` runs online or `--offline`. Online checks absolute links for reachability and costs
  network flakiness; `--offline` skips them entirely, which with the host allowlist retired means
  absolute links get no check at all.
- How `commitlint` and `pre-commit` are pinned. Neither is an action, so neither is covered by
  [`../CI.md`](../CI.md) § *Action pins*; `zizmor`, `actionlint` and `lychee` have official container
  images and are pinned as their digests.
- Whether any adopted tool's fixtures conflict with [0010](0010-runtime-materialised-gate-fixtures.md),
  which forbids committing a vulnerable artifact in resolvable form.
- Sequencing against #101 CI-invoking-just-recipes, which touches the same gate-wiring surface.

**Premise that would reopen this:** an adopted tool is abandoned, or changes its defaults so that it
no longer covers the obligation it was adopted for; or a repository convention appears that the tool
cannot express and that survives the scrutiny the three retired ones did not. Absent either, do not
relitigate — and note that the first is a per-tool reopening, not a reason to return to authoring
generally.
