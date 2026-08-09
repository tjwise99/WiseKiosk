# 0022 — Bind every accepted requirement in the model, and grow the model where nothing can

**Status:** accepted
**Decided:** 2026-08-08 (allocation-completeness design discussion, ticket #121 allocation completeness)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-08 — first written (#121 allocation completeness).

## Context

[ADR 0005 rev 1](0005-traceability-gating.md) rejected requirement→source design-allocation refs and
routed the duty elsewhere in one sentence: "Design allocation, where wanted, belongs to the
architecture model, not the gate system." The model then built a mechanism that answers a different
question.

[ADR 0019 rev 1](0019-boundary-at-what-deploys-and-tag-tier.md),
[ADR 0020 rev 1](0020-two-containers-one-origin-and-dual-tier-tags.md) and
[ADR 0021 rev 1](0021-component-earns-its-interface-and-framework-half-only.md) argue at length about
**which** element a tag belongs on — *tags discriminate rather than inventory*; *stamping an element
with everything it owes distinguishes nothing*; *a tag sits where its obligation is observable*. Those
arguments are right and none of them concerns whether every requirement lands anywhere at all.
Discrimination and completeness are orthogonal, and three phases won the first without the second
being put on the table.

**Nothing could have noticed.** `check-arch-trace` walks tags→tree: every identifier the model carries
resolves to an accepted item. A requirement the model represents nowhere is invisible to it by
construction, which is how the gap accumulated unseen rather than being tolerated.

The state this decision met: **31 accepted items, 26 tagged**, and five bound nowhere —
SRS005<!-- One validation implementation -->,
SRS007<!-- Configuration schema offers no secret-bearing key -->,
SRS015<!-- One schema, all boundary value classes -->,
SRS020<!-- Non-root container user --> and
SRS025<!-- No secret material in the published image -->. Each absence was defensible and none was
recorded. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) had already separated the cases — an item
reaching permanently outside the boundary, an item still `proposed`, and an item obliging something no
element stands for — and deferred to this record the two questions that separation leaves open:
whether such an item owes a recorded reason, and what to call the case.

## Decision

**Every accepted, active `SYS` or `SRS` item binds to at least one element or relationship in the
architecture model. Where an item can bind nowhere, the model grows to draw what it obliges — the rule
does not bend, and there is no exemption record.**

**The population is the obliging tiers, `accepted` and `active`, and each of those three words is
load-bearing rather than a convenience.** `check-arch-trace` resolves a tag only to an accepted item,
so a `proposed` item cannot be tagged and a rule reaching it would be unsatisfiable. A retired item
obliges nothing — and retirement here is `active: false` with `status` untouched
([ADR 0005 rev 1](0005-traceability-gating.md)), so a retired item stays `accepted` and the second
word does not imply the third. **`TST` is out of the population**, which the tree's third document
makes worth saying: a verification item states how an obligation is settled, not an obligation on the
running software, so it allocates to nothing in a model of what runs. `check-arch-trace`'s identifier
pattern admits `TST` because it judges resolution rather than allocation; this rule does not inherit
that reach. The consequence is stated below rather than left to be discovered: **acceptance now
carries an allocation obligation.**

**This adds completeness to discrimination and changes neither the tier rules nor the placement
rules.** Where a tag sits is still ADR 0019 rev 1's — the tier its level answers to, plus any coarser
item discharged observably there (ADR 0020 rev 1), bound where the obligation is observable, at each
depth where an observable is composed (ADR 0021 rev 1). This record says only that the set of items
bound nowhere is empty.

### The five, disposed of

**SRS007<!-- Configuration schema offers no secret-bearing key --> binds on the operator's
configuration supply.** Its second clause obliges delivery — "the delivered configuration shall be
secret-free by construction, not by a redaction step" — and that relationship is the delivery. This is
ADR 0021 rev 1's own move on SRS018<!-- One generic published image --> rather than an extension of
it: an obligation on an artifact the model does not draw, bound where what it obliges is observable.
It discriminates, because the operator's *other* supply is where a secret does travel, and this is the
item saying the two cannot be one.

The strongest counter is that its first clause obliges the configuration *schema's key set*, and its
`verification-justification` settles that against a committed allowlist rather than against anything a
delivery shows. **That objection mistakes verification for observability: a tag records where an
obligation is observable, not where it is settled.** The distinction is recorded because it is the
general answer rather than this item's detail — without it, the next close call is argued from an
item's `verification-justification` and this trade is walked again.

**SRS015<!-- One schema, all boundary value classes --> binds on the payload relationship**, where its
parent SYS005<!-- Single-definition internal contract --> and its only sibling
SRS016<!-- Both sides consume the generated types --> already sit. Its middle clause quantifies over
"every value crossing the boundary, including those a module contributes", and that relationship is
the boundary being crossed.

**SRS004<!-- Page renders a legible error state for every configuration failure class --> gains a
second binding on the render relationship**, keeping the one it has on the page shell. Its two clauses
sit at two depths — a plain-language error state naming which failure occurred is what a Viewer sees,
and a page shell that loads without requiring a valid configuration is a property of one component —
which is ADR 0021 rev 1's composed-observable rule applied, not widened.
SYS001<!-- Failure is legible and proportionate -->'s `verification-justification` names
SRS001<!-- A failed module shows why, and only that module -->,
SRS002<!-- A module-scoped configuration error is reported at that module -->, this item and
SRS026<!-- The display says when the backend is gone --> as one set, and the other three sit on that
relationship already.

**SRS020<!-- Non-root container user --> and SRS025<!-- No secret material in the published image -->
bind at the Deployment level**, which #123 C4 phase 4 Deployment draws. Both oblige the published
image; no level drawn today has an element the image is. They are unbound in the interim, and that is
deliberate — see *Consequences*.

**SRS005<!-- One validation implementation --> retires**, with the desk validator it obliges
(#129 retire the desk configuration validator, owner, 2026-08-07). It is recorded here because it was
one of the five and a reader will ask. Its ground: the display page already owes the full validation
report in operator language without a valid configuration
(SRS004<!-- Page renders a legible error state for every configuration failure class -->), the apply
floor is a page reload rather than a redeploy, and the page is reachable over HTTP from any device on
the network — so a desk-side tool has no pre-deploy gap left to fill, and an obligation that one
implementation be shared between the page and a tool that does not exist obliges nothing. That is
[ADR 0007 rev 2](0007-config-validation-allocation.md)'s own argument against the backend boot gate,
reaching the surviving half of the same instinct.

### The layout pair is not in conflict

ADR 0021 rev 1 binds SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at
narrower widths --> to the Frontend container rather than the render relationship, because it "names
a property of the assembled page rather than of what it shows anyone", while its parent
SYS002<!-- The display's rendering keeps nothing from a viewer --> sits on that relationship. Read as
a contradiction twice, so the distinction is recorded here.

The contradiction only bites if the two are co-extensive.
SYS002<!-- The display's rendering keeps nothing from a viewer --> has exactly one child — the only
need in the tree that does — and if that child carried the whole want, splitting them across two
subjects would assert a difference in where they are observable
that nothing supports.

**They are not co-extensive: SYS002<!-- The display's rendering keeps nothing from a viewer --> is
under-decomposed** (owner, 2026-08-08).
SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths --> covers the
geometry half — regions that do not overlap, content that is not clipped, reflow rather than
horizontal scrolling. What the parent obliges beyond that is how the assembled display reads to the
person in front of it, and those obligations are viewer-facing by their nature. **The parent therefore
sits on the render relationship because that is where its decomposition will land, rather than as a
coarser copy of the child**, and the child sits on what assembles the page. What that decomposition
contains is #132 under-decomposition of the layout need's to settle, not this record's — and a ruling
there that the parent is *not* under-decomposed reopens this placement. Reopening it means arguing a
different subject, not removing the binding: this record forbids leaving the item unbound, and the
container beside its own child is the coarser copy the paragraph above rejects.

**A ground that reads well and is wrong, recorded because two readers reached it.** Not *the child is
decidable geometry while the parent is what a person sees*.
SYS002's<!-- The display's rendering keeps nothing from a viewer --> own `rationale` absorbs
no-overlap, no-clipping and no-scrollbars "as one property rather than three observables", and its
`verification-justification` opens "Geometry is decidable" — so the
parent is geometry too, and measurable too. The axis is what each obliges, not whether anyone has to
watch.

ADR 0021 rev 1 is also narrower than it looks here: it chose between two container-depth subjects for
SRS017's<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths --> *second*
binding and said nothing about where the parent sits. Under ADR 0020 rev 1 that is
settled by where the item is discharged observably at the level, and for this one it is the
relationship that renders.

## Alternatives considered

**An exemption record: every unbound item carries an entry naming a category and a reason.** The
strongest rival, this ticket's lead option, and what #122 close check-arch-trace's second direction
was scoped to build. Rejected on its population. The candidate vocabulary was *enabling system*,
*design-time artifact*, *deployment artifact* and *deferred*; walking the five items emptied three of
those four. SRS007<!-- Configuration schema offers no secret-bearing key --> and
SRS015<!-- One schema, all boundary value classes --> bind, so *design-time artifact* has no member.
*Deferred* has none and
arguably never could — the module and upstream deferrals ADR 0019 rev 1 and ADR 0021 rev 1 record are
deferred **elements**, not unbound requirements, and no accepted item is unbound because a module
component is undrawn. SRS005<!-- One validation implementation --> retires, so *enabling system* has
none. What remained was two items that
bind the moment the Deployment level lands, and none of the five `proposed` items looks unbindable
either.

So the mechanism would have been built to hold two entries for the length of one slice. The deciding
argument is the owner's: **the gap is an artefact of a specification that has not yet defined its
modules, not a permanent class of unbindable requirement**, and building a mechanism around
scaffolding is how scaffolding becomes load-bearing. Against it stands the honest cost — an escape
hatch is the pressure valve that lets a reviewer record *this obliges something the model should not
draw* instead of drawing it badly, which is a real risk given how hard ADR 0019 rev 1 and
ADR 0021 rev 1 worked to refuse inventing an element. That risk is answered by the reopen premise
below rather than dismissed. The hatch never built cannot rot into an allowlist, which was that
ticket's own first-named trap and [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s review question
11.

**No completeness obligation**, on the ground that the model is a communication artifact and C4
supplies no such rule. Honest, and it is what the repository has today. Rejected because it leaves
ADR 0005 rev 1's routed duty discharged by nobody: that record rejected design-allocation refs partly
*because* the model would carry the link, and a model that owes nothing carries it in name only. It
also declines the only reading under which the five absences were a finding rather than a preference.

**Draw the Deployment level first, then write this rule**, so it is true of the tree the moment it is
written. Rejected on sequencing: the rule is what tells that level which requirements it must
accommodate, and deciding the rule after the level that answers it would let the level's convenience
choose the rule. The order taken is decide, make true, enforce.

**Bind SRS020<!-- Non-root container user --> to the Backend container now**, on the argument that the
thing running under a uid is that container. Rejected: it is the image's property, not the running
process's, and #123 C4 phase 4 Deployment would then either move the tag or argue why it stayed —
this effort writing itself a correction, which is the one outcome the integration branch exists to
prevent.

## Consequences

**Acceptance carries an allocation obligation.** Baselining an item is already the act of reading it
and judging what it obliges (ADR 0020 rev 1); it now also requires deciding where that obligation is
observable, or that the model must grow first. Five `SYS` and `SRS` items are `proposed` today and
each acquires this when accepted; the `TST` tier acquires nothing, being outside the population.

**The completeness check lands red, deliberately.** #122 close check-arch-trace's second direction
enumerates accepted items bound nowhere and fails when that set is non-empty; on landing it fails on
SRS020<!-- Non-root container user --> and SRS025<!-- No secret material in the published image -->
— the set the retirement of SRS005<!-- One validation implementation --> leaves behind — and
#123 C4 phase 4 Deployment turns it green. The defect case therefore needs no fixture — it is the
tree's real state, which is better evidence than a seed. The legal direction still needs one, and
[ADR 0010 rev 1](0010-runtime-materialised-gate-fixtures.md) is the mechanism. That this branch merges
to `main` once, at the end, is what makes a red intermediate state affordable.

**The model's element set answers to the tree, in one narrow way.** An accepted item whose subject
nothing draws is now a reason to extend the model. That pressure is bounded — the rule requires each
item to bind to *something*, not to have an element of its own, and existing elements and
relationships absorb almost everything — but it is real, and it is the opposite of the direction
ADR 0019 rev 1 and ADR 0021 rev 1 push when they refuse an aggregate external system and a placeholder
module box.

**Premise that would reopen this:** an accepted item whose subject the model cannot draw without
inventing an element that earns no place under ADR 0021 rev 1's interface test. At that point the
exemption record is back on the table, argued against a real case rather than an anticipated one.

**The second pressure is cheaper than the first, and no gate sees it.** Inventing an element is the
visible way to satisfy a rule that cannot be satisfied honestly; the cheap way is a plausible-but-wrong
tag on an element that already exists. `check-arch-trace`'s scope is resolution, and ADR 0021 rev 1
states the consequence directly — whether the tagged element is the one that requirement obliges is
"held by review alone, and by nothing else in the repository". An exemption record would have surfaced
that same situation as a written entry someone reads; this rule surfaces it as a green check. It is
held by review alone, which is ADR 0021 rev 1's position on this link rather than a new one — and
**no question in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)'s checklist asks it**, so review
here means a reader who happens to look rather than one who is prompted. That gap is named rather
than left for the first person to find it; a rule creating two pressures and answering one has not
been thought through. Closing it is a checklist edit, and it is not made here because inserting a
question renumbers the ones below it, and [`../requirements/README.md`](../requirements/README.md),
[`../../scripts/README.md`](../../scripts/README.md),
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) itself and open tickets all cite question numbers.

**Two subjects now carry six tags** — the payload relationship and the render relationship, the latter
by this record's own SRS004<!-- Page renders a legible error state for every configuration failure
class --> binding. Neither is the most heavily tagged: the Backend container has carried eight since
before this branch. They are not enumerated here, because a list of them kept in step by nothing is
the second inventory [`../ARCHITECTURE.md`](../ARCHITECTURE.md) argues against. ADR 0020 rev 1's bar is
against stamping an element with everything it owes rather than against a count, and each tag on both
subjects names a distinct obligation, so both hold. It is recorded because a count climbing is the
signal to argue the next addition rather than assume it.

**ADR 0021 rev 1 carries one sentence this branch has already outrun**, and it is not corrected here.
Its Consequences say SRS013<!-- Client-facing contract for rejected requests --> "sits on request
validation"; #120 gave that item a second binding on the payload relationship, which its own
composed-observable rule authorises. Correcting it means revving that record, which under
[`README.md`](README.md) moves every citation of it in the tree — for text #124 merge the three C4
ADRs deletes. It is that ticket's to absorb.

**So is every ground resting on SRS005<!-- One validation implementation -->.** This record rules that
item retired, and three C4 decisions lean on it —
[ADR 0019 rev 1](0019-boundary-at-what-deploys-and-tag-tier.md) as an invariant already held,
[ADR 0020 rev 1](0020-two-containers-one-origin-and-dual-tier-tags.md) as its example of an obligation
reaching permanently outside the model, and
[ADR 0021 rev 1](0021-component-earns-its-interface-and-framework-half-only.md) resting on 0020's
reason. #129 retire the desk configuration validator sweeps the citations; what #124 merge the three
C4 ADRs must absorb is that the *argument* those passages make no longer has its example. Recorded
here because this register is where that ticket will look.

**This record takes 0022, and #124 merge the three C4 ADRs will renumber it.** That slice merges
ADR 0019 rev 1, ADR 0020 rev 1 and ADR 0021 rev 1 into one document and returns two numbers to the
pool, which leaves this one stranded above a gap against the contiguity rule
[`README.md`](README.md) states.
