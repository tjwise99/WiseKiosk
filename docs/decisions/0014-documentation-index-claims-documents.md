# 0014 — The documentation index claims every tracked document, derived from the repository

**Status:** accepted
**Decided:** 2026-08-02 (#90 documentation-index claim check)

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

This is unrelated to [ADR 0005](0005-traceability-gating.md)'s retired gate 4, which
[ADR 0011](0011-requirement-or-convention.md) closed on 2026-07-26 for having no possible subject.
That gate asked an Inspection-method item to claim files; this decision does not reopen it, does not
supersede anything, and puts no obligation back in the tree. Which document holds which fact is
repository-facing under ADR 0011's test — no behaviour of the running kiosk can violate it — so it is
a check, and this ADR records how that check decides.

## Decision

**A row in the documentation index claims a document.** A tracked Markdown file is claimed by a row in
[`../README.md`](../README.md)'s table, or it sits under a silo named in a committed exclusions list.
Nothing else claims a document.

**The claimable set is derived from the repository.** `git ls-files '*.md'` is the population, so a
document added without a row fails. No inventory of documents is maintained by hand.

**A row's own cell says what it claims**, so the check reads a signal the table already carries rather
than adding syntax: a *Document* cell rendering as a path (`ARCHITECTURE.md`) claims that one file,
and one rendering with a trailing slash (`decisions/`) claims every tracked Markdown file beneath it.

**Scope is tracked Markdown.** The tree's `.yml` items are claimed by the tree and gated by
`check-reqs`; scripts and the LikeC4 model are code, which the index explicitly declines to index —
*"How a particular piece of code works is a fact about that code, not about the product."*

**Exclusions are a committed list** in the form [`../../scripts/upstream-hosts.txt`](../../scripts/upstream-hosts.txt)
already establishes: one `entry — what it serves` per line, naming directories rather than documents.
An entry covering a path the index claims is refused, and so is one that excludes no tracked document,
so the list cannot shadow an indexed document nor accumulate entries that have stopped meaning
anything. It is not thereby tamper-proof: deleting a row and excluding its directory in the same
change still hides a document, because no rule can tell that edit from a legitimate exclusion. What
the check buys is that hiding a document takes two visible edits rather than one.

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

**Excluding `architecture/` as a tooling silo**, on the index's own argument that a document
explaining how code works belongs beside that code. Rejected: the LikeC4 model is the source the
architecture diagrams are generated from, a reader looking for it should find it in the table, and a
silo exclusion would hide it. It gets a row.

## Consequences

Adding a document to `docs/` fails until it is indexed; retiring one fails until its row goes. That is
the obligation the index has always stated and never enforced.

The exclusions list remains the soft spot, narrowed rather than closed. A silo added to it is a
document set nothing indexes; the check refuses the one-edit forms of that, and the two-edit form —
row deleted, directory excluded — is left to review. That is accepted rather than solved: the
alternative is a rule that decides which directories *ought* to be indexed, which is the judgement the
list exists to record. Requiring each entry to say what it serves, and failing an entry that excludes
nothing, is what keeps the list short enough to read.

The check reads rendered table structure, so reformatting the index — changing its columns, or
moving it off a Markdown table — breaks it. `check-adr-index.mjs` has carried the same exposure since
it was written, with the same remedy: it fails loudly rather than reporting zero rows.

One instance of a `../CI.md` section describing machinery that does not exist is closed. The class is
not: `../CI.md` still describes gates nobody has built, and nothing fails when a described gate leaves
the workflow. That remains #77 gate CI.md against the workflow it describes, whose recorded remedy is
to make `../CI.md` an input to `check-verify-ci-parity.mjs`.
