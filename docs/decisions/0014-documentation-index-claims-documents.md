# 0014 — The documentation index claims every tracked document, derived from the repository

**Status:** accepted
**Decided:** 2026-08-02 (#90 documentation-index claim check)
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-12 — deletes the exclusions list from the Decision. The section two paragraphs
  below already said there is none and the Alternatives record why — it was built, two one-line edits
  to it hid a document, and it was removed rather than patched — so the Decision was advertising the
  mechanism this record exists to have deleted. What claims a document is unchanged (#5 repo layout).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

[`../README.md`](../README.md) states that *"every fact about WiseKiosk has exactly one canonical
home"* and calls its own table *"that referenceable definition"*. Nothing enforced it. A document
could be added to `docs/` and indexed nowhere, or retired while its row stood, and every check passed.

[`../CI.md`](../CI.md) § *Documentation integrity* meanwhile described the enforcement as live: *"The
documentation index's row set equals the committed canonical-document list in both directions; every
named path resolves to a tracked file; no Guarantees or Excludes cell is empty."* No such check
existed — `check-adr-index.mjs` covered `decisions/` alone, no script read the index, no
canonical-document list was tracked, and neither `just verify` nor any workflow ran one. The sentence
entered in `17565a1` with the tree rebuild: an intention written down and never built. A document
that publishes claims [`../../SECURITY.md`](../../SECURITY.md) rests on carried a section standing for
machinery nobody had written.

This is unrelated to [ADR 0005 rev 1](0005-traceability-gating.md)'s retired gate 4, which
[ADR 0011 rev 1](0011-requirement-or-convention.md) closed on 2026-07-26 for having no possible subject.
That gate asked an Inspection-method item to claim files; this decision does not reopen it, does not
supersede anything, and puts no obligation back in the tree. Which document holds which fact is
repository-facing under ADR 0011 rev 1's test — no behaviour of the running kiosk can violate it — so it is
a check, and this ADR records how that check decides.

## Decision

**A row in the documentation index claims a document.** A tracked Markdown file is claimed by a row in
[`../README.md`](../README.md)'s table, or it is machinery under a top-level dot-directory, which the
section below derives. Nothing else claims a document.

**The claimable set is derived from the repository.** `git ls-files '*.md'` is the population, so a
document added without a row fails. No inventory of documents is maintained by hand.

**A row's own cell says what it claims**, so the check reads a signal the table already carries rather
than adding syntax: a *Document* cell rendering as a path (`ARCHITECTURE.md`) claims that one file,
and one rendering with a trailing slash (`decisions/`) claims every tracked Markdown file beneath it.

**Scope is tracked Markdown.** The tree's `.yml` items are claimed by the tree and gated by
`check-reqs`; scripts and the LikeC4 model are code, which the index explicitly declines to index —
*"How a particular piece of code works is a fact about that code, not about the product."*

**What is not a document is derived too.** A tracked Markdown file under a **top-level
dot-directory** is machinery — an agent's working material, GitHub's own forms — and is claimed by
nothing. There is no exclusions list, so excluding anything else takes an edit to the check, reviewed
as code and needing a successor to this ADR, rather than a line anyone can append to a list.

Deriving both sides is the point. An inventory of documents and an inventory of exclusions are the
same artifact facing opposite directions, and a decision that rejects one while shipping the other
has only moved where the drift lives.

**The index's rows are unique and real.** One rendered path carries one row — two rows for a document
is two canonical homes, which is the property the index exists to state — and a row names a tracked
document, or a directory holding one.

The check also asserts that it parsed the table at all. A regex that silently stops matching would
otherwise leave every document unclaimed, and a later refactor could collapse both sides together; the
two inputs stay independently sourced, `git ls-files` against the file.

## Alternatives considered

**A committed canonical-document list**, compared against the index table in both directions — what
`../CI.md` described. Rejected: it is a third artifact beside the table and the repository and drifts
from both, so adding a document while updating neither the list nor the table still passes, which is
the failure the check exists to catch. `../CI.md`'s own note in that section already rules out the
shape — *"a gate satisfied by declaring is a checkbox"* — and a hand-maintained inventory is a
declaration. The sentence is amended to describe what was built; it was never load-bearing, having
described a check nobody ran.

**A committed exclusions list** naming the silos nothing indexes, one `entry — what it serves` per
line in the [`../../scripts/upstream-hosts.txt`](../../scripts/upstream-hosts.txt) form. This was
built and carried through review before being removed, so the reasons are measured rather than
predicted. Two entries — `.claude/` and `.github/` — were ever needed. Two one-line edits to that
file hid a document: appending a silo over a directory whose row had just gone, and appending one
over a directory nobody had indexed yet, which needed no row touched at all. Rules were added against
the first; the second was found, documented, and closed only by deleting the mechanism. The derived
rule refuses both and takes four rules and a file with it, and the list's supposed advantage — adding
a silo without touching code — is precisely the property that made it an opt-out.

**Excluding `architecture/` as a tooling silo**, on the index's own argument that a document
explaining how code works belongs beside that code. Rejected: the LikeC4 model is the source the
architecture diagrams are generated from, a reader looking for it should find it in the table, and a
silo exclusion would hide it. It gets a row.

## Consequences

Adding a document to `docs/` fails until it is indexed; retiring one fails until its row goes. That is
the obligation the index has always stated and never enforced.

The soft spot moves rather than vanishing, and it is narrower and differently shaped. **A new
top-level dot-directory is excluded the moment it exists, with no edit anywhere** — measured:
`.notes/NOTES.md` alone gives exit 0. The list would have demanded a visible line for that, so this
is the one respect in which the derived rule is weaker. Closing it would mean asserting which
dot-directories may exist, which is the inventory this decision exists to avoid.

What makes it reviewable is not the directory being noticeable — a dot-directory is by definition
hidden from `ls` and from most file browsers, so it is conspicuous in the pull request that adds it
and nowhere afterwards. It is that the check **names** the machinery directories it skipped on every
run. A directory appearing in that line without a row in the index is the whole of what this rule
lets through unremarked, and it is on screen every time the gate passes.

The cost of having no list is that a silo which is *not* a dot-directory — vendored documentation, a
`third_party/` tree — cannot be excluded without changing the check and superseding this ADR. That is
the intended price. It is also why the rule is stated here: nothing else in the repository says a
dot-directory holds machinery.

The check reads rendered table structure, so reformatting the index — changing its columns, or
moving it off a Markdown table — breaks it. `check-adr-index.mjs` has carried the same exposure since
it was written, with the same remedy: it fails loudly rather than reporting zero rows.

One instance of a `../CI.md` section describing machinery that does not exist is closed. The class is
not: `../CI.md` still describes gates nobody has built, and nothing fails when a described gate leaves
the workflow. That remains #77 gate CI.md against the workflow it describes, whose recorded remedy is
to make `../CI.md` an input to `check-verify-ci-parity.mjs`.
