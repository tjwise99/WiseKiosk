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
| A repository convention a machine decides | The **verification tier**, as a check under the requirement obliging checks to run |
| An obligation on an author that leaves no artifact | The **review checklist** ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)) |

Three consequences follow, and they are the operative part.

**A convention that demotes to a check loses nothing.** The check still runs and still blocks. What
is given up is the specification *stating* that the convention exists, so adding or retiring one
becomes a check edit rather than a specification change. That is the right amount of ceremony for a
line-ending rule or a branch-name pattern.

**A judgement obligation moved to the checklist gains an activation path.** This is not a soft
deletion. An `inspection` item nobody is prompted to perform is a dead letter — that absence is what
justifies deleting one. A question a review flow walks on every change is not — the checklist is
reached from the pull-request template, and a merge-readiness flow that reads it walks it against the
actual diff.

**The obligation goes in the requirement, the mechanism in the check.** A requirement fixing a
duration, a sampling interval, a tolerance, or a build mode has swallowed its own verification, and a
threshold then cannot be tuned without a specification change. Where an item's text begins
*"Verification shall…"*, it is announcing this.

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

**The tree shrinks and the checks do not.** Thirteen `SRS` items demoted to checks; every one of
their verification items survives, re-parented. One active check was lost — an inspection recording
that a single past pull request made its edits correctly, which could never run again and named four
requirements since deleted.

**A need dissolved.** The documentation need's checkable content was *documentation checks run in CI
and block*, which the CI need's first sentence already stated. Its unfalsifiable content was a
working practice. The need tier went from eleven to ten.

**One requirement becomes a large bucket.** The requirement obliging mechanical checks to run and
block now has eighteen verification children. That is the honest shape — one obligation, many
checks — and it is the single point everything repository-facing hangs from. If it is ever deleted or
weakened, all of it goes at once.

**The checklist becomes load-bearing, and nothing gates it.** It carries obligations that were
requirements. Its input — the documentation taxonomy table — is gated, deliberately, so a reviewer
asking *"is this fact stated in exactly one place?"* has something real to read from. The checklist
itself is not a check and gates nothing, which is the point: the CI need says every check the
repository carries runs and blocks, and a checklist is not a check.

**Reopen premise.** Revisit if the checklist stops being walked — if `/pr-ready` drops it, or reviews
routinely skip it, the activation path this decision rests on is gone, and the obligations it holds
are back to being dead letters that were at least visible in the tree.
