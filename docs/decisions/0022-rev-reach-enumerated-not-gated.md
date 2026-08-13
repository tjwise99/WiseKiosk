# 0022 — A rev's reach is enumerated by a tool and read by a reviewer; no check decides whether a claim survived

**Status:** accepted
**Decided:** 2026-08-13 (#145 prose pass, against the sweep PR #144 shipped)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-13 — first written (#145 prose pass).

## Context

An ADR is versioned, and [`README.md`](README.md) says revving one reaches every document citing it,
"each of which is then updated or re-decided". `just check-adr-revs` makes the **pin** unavoidable and
nothing makes the **re-reading** so — a fact [`../../scripts/check-adr-revs.py`](../../scripts/check-adr-revs.py)
states in its own docstring.

A sweep that rewrites `rev N` to `rev N+1` across the tree therefore satisfies the gate while
re-deciding nothing, and the green result certifies a reach that did not happen. On the branch
squashed as `197d075`, commit `52bb933` bumped three records and re-pinned the tree; two sentences in
[ADR 0021 rev 2](0021-repository-layout.md) had only their rev token changed while the claim
each hung off went false, and `check-adr-revs` reported 295 of 295 citations current across both.
`8f43ccb` fixed them and recorded that it was the third recurrence of one class; `9177e5a` and
`62c0a48` are two more on the same branch.

Independent review caught every instance, always after the fact and twice after the class had already
been named. What review had to do was hold a 690-line record's diff against sentences in thirteen
other files — an enumeration, re-derived by a person each time.

## Decision

**A rev's reach is enumerated by a tool and read by a reviewer.**

| | |
|---|---|
| Which citations the sweep wrote and nothing else touched | [`../../scripts/adr-rev-reach.py`](../../scripts/adr-rev-reach.py) — a property of the diff, so a machine settles it |
| Whether the claim hanging off one survived the rev | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) review checklist question 21, *Rev reach* |

That split is [ADR 0011 rev 1](0011-requirement-or-convention.md)'s, and this is the second instance
of the pattern its consequences describe: a checklist question whose input is a mechanical artifact,
so the reviewer has something real to read from rather than a belief about their own sweep.

**The tool blocks nothing and is outside `just verify`.** It reports and exits zero. What it prints,
per ADR whose head rev moved and whose substance moved with it, is every tracked line whose citation
pin moved while the line around it did not — file, number and text.

**Substance excludes what a rev necessarily rewrites**: the head `**Rev:**` line and the *Revisions*
section, both of which move on every rev, and every `rev N` token in what is left. Without that last
part a sweep cascades — each record it merely passes through differs textually while asserting what
it asserted before, and its own citations join the list.

**A line the change also edited is outside the report.** Its author had the sentence open; a sweep
did not write it. That is the whole discrimination the tool performs, and it performs no other:
whether a listed line is stale is not decided here.

**Reaching zero is not the goal.** A reviewer who reads a sentence and finds it still true leaves it
untouched, so it is listed again on the next run. The list is a work-list for one pass, never a
burn-down whose emptiness certifies anything.

## Alternatives considered

**A blocking check that fails any pin-only change.** The drafted answer, and machine-decidable, which
is what [ADR 0011 rev 1](0011-requirement-or-convention.md) routes to a check. Rejected as fail-closed
on legal input by a wide margin: at `52bb933`, 53 of 55 pin-only edits were legal, a rev that does not
touch what a citation asserts being the ordinary case. The escapes it would grow are an exemption
list — where [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) question 11, *Narrowed guards*, says a
bypass gets spelled — or editing sentences until the diff stops being pin-only, which is the defect in
different clothes. An acknowledgement variant fails the same way [`../CI.md`](../CI.md) rejected the
co-change registry: a gate satisfied by declaring is a checkbox, and the declaration becomes reflex.

**A checklist question with no enumeration behind it.** Rejected: it asks the judgement of the reader
who has just run the sweep and believes it complete, which is the belief that failed at every one of
the instances above. It is 0011's argument about the taxonomy table read backwards.

**Narrow the list by comparing the changed hunks against the citing sentence.** Rejected: that is a
machine deciding whether a claim survived, which is the half this record allocates to a reader. A
heuristic there would be wrong quietly, and its output would carry the authority of the deterministic
half.

**Do nothing, and rely on independent review.** It caught all five instances, which is real evidence.
Rejected because each pass fixed the instance and the class survived, twice after a reviewer had
named it, and because the enumeration a reviewer re-derives by hand is the part that is cheap to
produce.

**Record this as a rev of [ADR 0011 rev 1](0011-requirement-or-convention.md).** Rejected: that record
decides where an obligation lives, and this applies its rule rather than changing it. A gate was
weighed and refused here, which is what earns a record of its own.

## Consequences

**The obligation `README.md` states becomes performable.** "Updated or re-decided" had no artifact
naming what it ranged over; the reviewer is handed the list.

**One more thing in the layer nothing gates.** The tool has no check behind it, the question it feeds
is not a check, and both are what [ADR 0011 rev 1](0011-requirement-or-convention.md) and
[`../CI.md`](../CI.md)'s closing section already describe for this layer. The reopen premise is the
same one: if the checklist stops being walked, this is a dead letter.

**A reviewer who skips it is invisible.** No gate reads the tool's output, and a pull request that
never ran it looks identical to one that ran it and found the claims sound. That is the price of not
being fail-closed on legal input, and it is the trade taken.

**The population is complete only while `check-adr-revs` is green.** A citation a sweep missed fails
that gate and never reaches this tool. The two compose, and neither substitutes for the other.

**Line granularity is what a machine can see.** A claim can rot below its citation, which `8f43ccb`'s
own class — a record describing how another record argues — is the shape of. The line printed is a
handle to a paragraph, not a bound on what a reader opens. A citation re-pinned and **re-wrapped** in
one change falls out of the pairing for the same reason and is not listed; the recorded gaps sit with
the tool's cases in [`../../scripts/README.md`](../../scripts/README.md).

**A rev is bought by a change in what a reader would otherwise get wrong, not by a change in how many
words it takes.** This record prices a rev: taking one obliges the bumper to re-read every citation
the sweep re-pinned, so a rewrite nobody can perceive costs real reading for no gain. The corollary is
that **a document whose bulk is rejected alternatives cannot be condensed by a prose pass at all** — a
reason compressed past a point stops being an argument a later reader can check. Where a condensation
is worth having but not worth its own sweep, it belongs in the record's next substantive rev, where
the sweep is being paid anyway.
