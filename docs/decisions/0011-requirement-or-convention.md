# 0011 — A requirement obliges the software; a repository convention is a check or a review habit

**Status:** accepted
**Decided:** 2026-07-26 (`SRS` pass of the tree rebuild #69)

## Context

The requirements tree accumulated obligations about the repository rather than about WiseKiosk.
Branch naming, line endings, where dependency manifests sit, whether a comment carries rationale,
whether documentation cites rather than restates, whether a link resolves. Each was defensible when
written. Together they were a third of the specification, and the need tier had grown two needs —
one about CI, one about documentation — whose subject was the project's own housekeeping.

They could not be dismissed as noise, because most of them are real and several are gated today.
What they lacked was a rule deciding where such an obligation belongs, so each round re-argued it and
reached a different answer. The `SYS` pass removed sixteen repository-facing needs and left two; the
`SRS` pass then found the same question one tier down, in items no rule reached.

A second gap made the first worse. A requirement that survives carries its reasoning in its own
`rationale`, permanently, fenced by the review fingerprint. A requirement that is **deleted** leaves
nothing. Every deletion decision lived only in a ticket comment, so the reasoning behind an absence
was unavailable to the next reader by construction.

## Decision

**A requirement states an obligation on the running software.** Everything else has one of two other
homes, decided by whether a machine can settle it.

| | Home |
|---|---|
| An obligation on the running software | The requirements tree |
| A repository convention a machine decides, or material CI itself produces | [`CI.md`](../CI.md) — a **check** the workflow invokes, or an output it publishes; outside the tree either way |
| An obligation on an author that leaves no artifact | The **review checklist** ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)) |

What follows from the table is the operative part.

**A convention that demotes to a check loses nothing.** The check still runs and still blocks. What
is given up is the specification *stating* that the convention exists, so adding or retiring one
becomes a check edit rather than a specification change. That is the right amount of ceremony for a
line-ending rule or a branch-name pattern.

**The check therefore leaves the tree entirely** — not to the verification tier. That tier is inside
the tree, where a `TST` item carries a status, a review fingerprint and `check-reqs` enforcement, so
adding a lint would stay a specification change and the specification would still state that the
convention existed, one tier down. Only a destination outside the tree delivers the check edit. The
need that would otherwise carry them goes too: it obliged the repository rather than the software, and
it would be a hat over its own thirteen children — the enumerates-its-own-children tell that
[ADR 0012](0012-module-requirements-in-tree.md) names.

**A judgement obligation moved to the checklist gains an activation path.** This is not a soft
deletion. An `inspection` item nobody is prompted to perform is a dead letter — that absence is what
justifies deleting one. A question a review flow walks on every change is not — the checklist is
reached from the pull-request template, and a merge-readiness flow that reads it walks it against the
actual diff.

**The obligation goes in the requirement, the mechanism in the check.** A requirement fixing a
duration, a sampling interval, a tolerance, or a build mode has swallowed its own verification, and a
threshold then cannot be tuned without a specification change. Where an item's text begins
*"Verification shall…"*, it is announcing this.

**This narrows [ADR 0005](0005-traceability-gating.md).** Its traceability claim is over **the
product**. *No work exists without a requirement authorizing it* is true of work on WiseKiosk; it is
not true of the repository's own housekeeping, and arguably never was. Three consequences for 0005's
four gates:

- **Gate 4 is retired.** It required every tracked file in a non-code silo to be claimed by an
  Inspection-method item. The tree carries no Inspection-method item and cannot acquire one under this
  ADR, which routes every judgement obligation to the review checklist. A gate with no possible
  subject is retired rather than left standing as an unimplemented intention. The same arithmetic
  empties `analysis` and `demonstration` — every item in the tree is `test` — so 0005's
  closure-through-referenced-artifacts rule stands with no current subject.
- **Gates 2 and 3 are scoped to product source.** First-party scripts implementing repository checks
  have no `TST` to attribute to, and giving them one would reintroduce the items this decision
  removes. They are exercised by their own fixtures and described in `CI.md`. The closure chain —
  source → test → `TST` → `SRS` → `SYS` — is unchanged inside the scope.
- **What this gives up, stated rather than implied.** Doorstop validates `references`, so an active
  `TST` naming a deleted script used to fail the tree gate independently of the workflow. Repository
  checks no longer have that: deleting a check's script and its workflow step in one change is
  invisible to every gate. The remedy, if one is wanted, is to make `CI.md` an input to
  `scripts/check-verify-ci-parity.mjs`, not to put the items back.

**A rule the pass establishes is recorded here, not in the ticket.** The thread holds the trail — one
comment per ruling, at the moment it is taken. Anything that will govern the next pass is an ADR, or
it is re-derived from a closed issue nobody reads. This ADR is the first instance of its own rule.

## Alternatives considered

**Keep repository obligations as requirements, and accept the tier's size.** Rejected: the need tier
is the validation anchor a person checks the product against, and a third of it was about the
project rather than the product. Six of the sixteen repository-facing needs enumerated their own
children, which is what a tier looks like once nobody can hold it.

**Delete them outright rather than demoting.** Rejected on evidence. Four of the demoted checks are
**active** with real references — `check-links.mjs`, `likec4 validate`, the diagram splice, the
docs-site build. Deleting the requirement to delete the check would have removed live verification to
make a count smaller, which is vandalism with good manners.

**Route the judgement obligations to `CLAUDE.md`.** Rejected: that file holds working rules for an
agent, and these bind any author. The taxonomy in [`../README.md`](../README.md) assigns
`CONTRIBUTING.md` *"how a change gets made and merged"*, which is exactly what they are — and its
`Excludes` column bars *"what the system must do"*, which under this decision they no longer are.

**Draw the line at "mechanically verifiable" alone**, deleting everything a machine cannot settle.
Rejected: it deletes real obligations for want of a tool, and it was applied inconsistently in
practice — one item deleted as *"judgment residue, no mechanical proxy"* while another survived at
`inspection` with the identical predicate, one ruling apart. Two independent reviewers found the
inconsistency. The checklist is what makes the rule applicable in one direction.

## Consequences

**The tree shrinks and the checks do not.** Thirteen `SRS` items demoted to checks; every check still
runs and still blocks. Their verification items leave the tree with them rather than being re-parented,
and `CI.md` becomes the record of what each check asserts. One active check was lost — an inspection
recording
that a single past pull request made its edits correctly, which could never run again and named four
requirements since deleted.

**A need dissolved.** The documentation need's checkable content was *documentation checks run in CI
and block*, which the CI need's first sentence already stated. Its unfalsifiable content was a
working practice. The need tier went from eleven to ten.

**Nothing repository-facing hangs from the tree.** It hangs from `CI.md` and the workflow that invokes
each check. The alternative — one requirement obliging mechanical checks to run, carrying every
convention beneath it — would have been a hat over its own children, and a single point whose deletion
took all of them at once.

**What CI produces is described where CI is described.** A release's signature, SBOM and
build-provenance attestation are material the pipeline produces, not obligations on the software, so
they sit in `CI.md` alongside the gates. The image properties the product does owe — no configuration
baked in, no secret material, a non-root user — stay requirements: they constrain the artifact a
deployment runs, not the pipeline that built it.

**The checklist becomes load-bearing, and nothing gates it.** It carries obligations that were
requirements. Its input — the documentation taxonomy table — is gated, deliberately, so a reviewer
asking *"is this fact stated in exactly one place?"* has something real to read from. The checklist
itself is not a check and gates nothing, which is the point: `CI.md` obliges every check the
repository carries to run and block, and a checklist is not a check.

**Reopen premise.** Revisit if the checklist stops being walked — if the pre-merge routine drops it, or reviews
routinely skip it, the activation path this decision rests on is gone, and the obligations it holds
are back to being dead letters that were at least visible in the tree.
