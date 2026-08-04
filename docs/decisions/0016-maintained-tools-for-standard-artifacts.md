# 0016 — Maintained tools for standard artifacts; authored checks only for this repository's inventions

**Status:** accepted
**Decided:** 2026-08-03 (#103 authored-vs-adopted check trade, measured against the cases recorded in
[`../../scripts/README.md`](../../scripts/README.md))

## Context

Thirteen checks gate this repository and every one of them was written here. That was never a decision.
The gate records argue at length about *which hand-rolled form* a check should take —
[0005](0005-traceability-gating.md) on where evidence lives, [0006](0006-process-gates.md) on what the
gate reads, [0014](0014-documentation-index-claims-documents.md) on whether a list may be
hand-maintained — and never about whether to author one at all. 0006's rejection of GitHub-native
rulesets as Enterprise-only is the sole neighbouring instance, and it concerns a platform feature
rather than a tool.

A default nobody chose is a decision nobody reviewed, and in one place it had gone visibly wrong:
`check-workflow-hardening.mjs` scanned workflow YAML as plain text with no parser to check action
pinning and top-level write permissions — a hand-rolled subset of an audit that maintained tools
perform against a parse tree.

The question is which checks that reasoning reaches, and what decides it for the next check written.

## Decision

**A check is authored only where what it reads is this repository's own invention.** Where the artifact
under check has a public specification that other projects share — workflow files, Markdown links,
commit messages, file hygiene — a maintained tool exists, is better tested than anything authored here,
and covers more; it is adopted.

Four adoptions follow, and each replaces its authored check outright:

| Adopted | Replaces | Lines removed |
|---|---|---|
| `zizmor` at the `pedantic` persona, with `actionlint` alongside | `check-workflow-hardening.mjs` | 177 |
| `lychee` | `check-links.mjs`, `upstream-hosts.txt` | 123 |
| `commitlint` at both the commit-message and pull-request-title stages | `check-commit-msg.sh`, `conventional-commit.regex` | 40 |
| `pre-commit` as the local hook layer | `.githooks/`, `check-eol.sh` | 33 |

The nine remaining checks stay authored, because nothing else could perform them: the documentation-index
claim check, verify/CI parity, the ADR index, the repository silo check, the four requirements-tree
checks, and the architecture-diagram splice.

**Three repository conventions do not survive the trade**, and are retired rather than reimplemented:

- **The `# vN` version comment beside a pinned action** stays a convention — Dependabot writes and
  updates it — but stops being gated. The gate enforced presence, not truth: a comment stale against a
  hand-edited SHA passed clean, and enforcing correctness needs a network call that would end offline
  checking.
- **The host allowlist** carried one entry, `github.com`, so its live effect was to block citing the
  tools this repository runs. Documentation may link outward.
- **The repository-escape check** guarded a case that has never occurred and that CI could not catch
  regardless: the escaping path resolves on a runner exactly as it does locally.

## Alternatives considered

- **Author everything — the status quo.** Its real argument is that [`../CI.md`](../CI.md) states, per
  gate, *what it is allowed to let through*, and no adopted tool ships that sentence. Rejected because
  the sentence survives adoption — what `zizmor --persona=pedantic` lets through is as statable as what
  a script lets through — while the measurements went the other way on substance. Against the live
  workflows `zizmor` reported **seven medium findings the authored check could not see** (`artipacked`,
  credential persistence on every checkout), and against seeded defects it caught the unpinned reference
  at High severity and both write-permission spellings.
- **Adopt only where the tool is a strict superset, keeping a residue check for the remainder.** The
  shape this ADR was expected to take. Rejected on evidence: in all four cases the residue was defensive
  convention that did not survive being named, listed above. Running two gates for an obligation that
  weak costs more than the obligation is worth.
- **`zizmor` at the default persona.** Rejected: it does not report top-level write grants at all, which
  would have preserved most of `check-workflow-hardening.mjs` for a narrower reason than it was written
  for. `pedantic` was measured against the live workflows and produced **zero excessive-permissions
  findings and zero false positives** — including no complaint about `pages.yml`'s job-level `pages:
  write` and `id-token: write` elevation.
- **Suppressing `pedantic`'s one known false positive rather than adopting it plainly.** `permissions:
  read-all` is flagged, and [`../../scripts/README.md`](../../scripts/README.md) lists that spelling as a
  case the authored check must pass. Rejected as unnecessary: neither workflow uses it — both declare
  explicit `permissions: contents: read` — so the case is hypothetical, and writing a suppression against
  a hypothetical is where a bypass gets spelled ([`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) review
  checklist item 11).
- **`conventional-pre-commit` for commit messages instead of `commitlint`.** Rejected: CI gates the
  pull-request title rather than the commits, so an authored check would still be needed there and the
  pattern would live in two places — the defect the shared regex files exist to prevent. `commitlint`
  covers both stages from one configuration.
- **Preserving the authored `--pr-title` mode**, which allowed `fixup!` and `squash!` locally while
  refusing them in a pull-request title. Dropped rather than reproduced: the repository squash-merges,
  so those messages never reach `main`, and `commitlint`'s own ignore defaults handle them.

## Consequences

- **373 lines of authored check are deleted**, along with `upstream-hosts.txt` and
  `conventional-commit.regex`. Four maintained tools enter CI, each pinned like every other action.
- **The corollary is the finding worth carrying:** when a maintained tool covers most of a check, the
  residue usually should not survive either. An authored check accretes obligations nobody would choose
  deliberately, and adopting a tool is what forces each one to be named and defended.
- **Seven `artipacked` findings become actionable** — every `actions/checkout` needs
  `persist-credentials: false`. The authored check never reported them.
- **Practice adapts to the tool, not the reverse.** Two commit titles on `main` exceed `commitlint`'s
  default `header-max-length` of 100, the longest at 122. The default stands and titles get shorter;
  configuring the tool around existing practice would forfeit the reason for adopting it.
- **`docs/CI.md` is rewritten** where it describes the replaced gates — §§ *Action pins and workflow
  privilege*, *Documentation integrity*, *Repository shape* — and
  [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s hook-installation instruction changes with
  `.githooks/`. Those edits land with the implementations, not here.
- **[`../../scripts/README.md`](../../scripts/README.md) loses the sections for the deleted checks**, and
  earns its keep for the ones remaining: its recorded cases, in both directions, were the conformance
  suite this decision was measured against. Seeding the legal variant is what found `pedantic`'s
  `read-all` behaviour.
- **#60 authored-language set was right to block on this.** Its planning had consigned these same 373
  lines to a Python conversion; every one of them would have been rewritten and then deleted.
- Adoption is not performed here. One implementation ticket per adopted tool, each sized to be read in
  one sitting.

**Premise that would reopen this:** an adopted tool is abandoned, or changes its defaults so that it no
longer covers the obligation it was adopted for; or a repository convention appears that the tool cannot
express and that survives the scrutiny the three retired ones did not. Absent either, do not relitigate —
and note that the first is a per-tool reopening, not a reason to return to authoring generally.
