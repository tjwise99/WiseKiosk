# `check-arch-trace.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

Every row re-run at `adc1f65`, script md5 `f3d15a77411d08dc2fc50c04cb798b1a` — unchanged in what it
scans from the `962e69718a8927aadfabf50422913937` the rows were last run against, that diff being
three docstring lines and one message string. The section was first exercised at `5c48ed8` against
md5 `62e44de86ab097dfa0ee68084a1fb6f3`. The counting rows were first exercised at `7883e3b`, md5
`012e4cd6425770ec3ce01b5d1b111216`, each run a second time against the form it replaced — `04cea31`,
md5 `62e44de86ab097dfa0ee68084a1fb6f3` — because what those rows assert is that a number *moves*, and
a number that never moved cannot be shown to move by a single run.

**Pinning the script is not enough here, and that is what this section learned.** Its rows count
elements, relationships and items, so a model or tree that grows re-decides every one of them while
the script's hash sits still. The baseline is the cheaper second check on both:

```
architecture → requirements holds: 52 tag application(s) on 19 of 38 element(s) and relationship(s), naming 37 accepted item(s).
requirements → architecture holds: all 37 accepted, active item(s) in an obliging tier are tagged, of 93 item(s) in the tree — 5 proposed, 1 retired and 50 verification item(s) are outside the population.
```

**Read that pair before trusting a figure below.** If it does not reproduce, the tree has moved and
every count here is suspect. A date, a commit and an md5 cannot say that on their own: this section
carried all three and was false anyway, because what had moved was the model rather than the script.
No row here is worded *the tree's real state* — a row keyed on what the tree happens to hold dates the
moment the tree changes, silently. Each case is its own extraction of the named commit, never `HEAD`;
`node_modules` may be symlinked here, the `check-arch` fixtures needing a copy only because of
`git add --intent-to-add`, which this check never runs.

**There is no all-bound fixture, and the headline must-fail row is a seed.** When the second direction
landed, the tree held accepted items the model bound nowhere; #119 bound the last of them, which
inverted the arrangement. Every must-pass row is now the plain extraction and the defect direction is
seeded.

## Must fail — tags → tree

Each is seeded on the plain extraction, so an unbound report appearing beside the expected diagnostic
would mean the seed had disturbed the second direction as well. None did.

| Case | Input | Reported |
|---|---|---|
| Identifier naming no item | a three-digit `SYS` identifier the tree does not hold, declared and applied to the `Layout assembly` element | `no such item in the requirements tree` |
| Mis-cased identifier | an accepted `SRS` item's own number, lower-cased, declared and applied the same way | `mis-cased — items are upper-case` |
| Declared, applied to nothing | SRS023<!-- The backend establishes no client identity and gates no route on one --> declared with no application anywhere | `declared and applied to nothing` |
| Item not accepted | SRS023<!-- The backend establishes no client identity and gates no route on one -->, which is `proposed`, declared **and** applied | `the item is proposed, not accepted` |
| Item retired | SRS005<!-- One validation implementation -->, `active: false`, declared and applied | `the item is retired` |
| Tag that is not an identifier | `needs-srs`, taken from the model on `origin/main` | `not a requirement identifier` |
| No tag at all | every declaration and application stripped from both model files | the *names no requirement* guard |
| Model that does not parse | a tag where the grammar wants a closing brace | `the model does not validate`, from `likec4 validate` |

**The no-tag seed asserts the count it removes**, which is the cheapest independent check on the
baseline: it fails unless it deletes exactly **89** lines — 37 declarations and 52 applications. Those
are the two numbers the success line reports, arrived at by deleting rather than counting, so they do
not both come from the same reader.

## Must pass — tags → tree

| Case | Input | Reported |
|---|---|---|
| The model as it stands | no seed | the baseline pair, exit 0 |
| An accepted identifier on an **element** | no seed — ten elements carry tags | " |
| An accepted identifier on a **relationship** | no seed — five logical relationships carry tags | " |
| One identifier applied to several subjects | no seed — SYS003<!-- A deployment is parameterised from outside the image --> sits on four. Applications exceed identifiers | " |
| A relationship carrying no tag | no seed — the bundle-serving edge and six others | " |
| **A tag on a deployment element** | no seed — `publishedImage` carries four, `configurationFile` one | " |
| **A tag on a deployment relationship** | no seed — both mount edges carry SYS003<!-- A deployment is parameterised from outside the image --> | " |
| An item bound on two subjects losing one | SRS017<!-- Full-screen assembly at kiosk; reflow, no horizontal scroll, at narrower widths -->'s application on `frontend` deleted, its `layout` application and declaration left | **51** applications on 19 of 38, 37 items, exit 0 — one fewer, still bound |
| Every tag on elements, none on any relationship | all **16** relationship applications removed, the **13** distinct identifiers among them placed on the system element | **49** applications on **13** of 38, 37 items, exit 0, and the export confirms zero relationship subjects carry a tag |

**Seven of those rows need no seed, which is exactly what makes them weak** — an arm never read and an
arm that reads and approves are the same exit code. The two deployment rows are the arms `c8f1511`
added, so each has a control moving the item out of the logical model entirely:

| Control | Reported |
|---|---|
| SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->'s only application moved onto the `secretFiles` **deployment element** | passes — 52 applications on **20** of 38, all 37 bound |
| The same application moved onto the `publishedImage -> runningContainer` **deployment relationship** | passes — 52 applications on **20** of 38, all 37 bound |

Were either group unread, that item would be reported *declared and applied to nothing* and *tagged
nowhere*, which is what it does report when the tag goes onto a **view** instead. The relationship
row's seed selects bodies by which brace a relationship line opened, not by indentation, and is
confirmed by reading the export for surviving relationship tags rather than by an exit status that is
0 either way.

**A premise this check rests on and does not test:** in the deployment-elements section it reads, an
`instanceOf` entry carries no tags — it does not inherit its logical target's. A LikeC4 version
propagating them there would leave every run green while the completeness rule went hollow for every
item bound to an instantiated container. Re-run that row when the pin moves, and read the right
section: the instances are the `.deployments.elements` entries carrying an `element` key, and neither
of the two carries a `tags` key. **The view section shows the opposite and is not what the check
reads** — `.views.<name>.nodes[]` entries of `kind: instance` do carry the instantiated container's
tags, so a selector written on that reads inheritance the checked section does not have and reports
the premise broken when it holds.

## Must fail — tree → tags

| Case | Input | Reported |
|---|---|---|
| **An accepted, active item bound nowhere** | SRS028<!-- Served responses declare their type, and forbid the browser inferring one -->'s declaration **and** its only application removed | `1 of 37 accepted, active item(s) are tagged nowhere`, naming it |
| The tree loads no item | the three tier directories removed | `the requirements tree loaded no item` |
| No document carries an obliging tier | the two obliging tiers removed, the verification tier left with its `parent:` line dropped so the build still resolves | `no document carries an obliging tier` |
| The population is empty | every `status: accepted` in the two obliging tiers flipped to `proposed` — **38** items, 0 left | `no item is accepted and active` |
| A tier the rule has no answer for | a fourth document, prefix `OPS`, parented to `SYS`, holding one accepted item | `1 item(s) this rule cannot place, leaving 37 in the population it judged` |
| A status outside the vocabulary | one accepted item's `status` mis-spelled | both arms — an unresolved tag **and** `leaving 36 in the population it judged` |

The first row is a seed because the alternative dated. It removes an item bound on exactly one
subject; an item bound on two is the must-pass row above, and the pair separates *unbound* from *bound
less often*. **It was read in CI as well as locally** — on PR #134 the `architecture` job's last step
fails while the `check-arch` step above it passes, so the step is wired, reached and able to fail its
job.

**The last two rows are question 10, *Unjudged input*, from both sides.** The mis-spelled status is
the sharp one: comparing against `accepted` alone reads it as *not accepted* and drops the item,
indistinguishable from the item being correctly out of scope. That count belongs in the unplaceable
message and not only in the success line, because the success line is absent from a failing run and
the unbound message is absent when nothing is unbound — with an untagged item's status mis-spelled,
both are, and the shrinkage would be real and invisible.

## Must pass — tree → tags, and the controls that show each exclusion works

An exclusion that passes proves nothing on its own: an item skipped for the right reason and an item
skipped because the arm is dead read identically. Each row is a pair.

| Excluded input | Passes | Control: the property removed | Fails, reporting |
|---|---|---|---|
| A retired accepted item bound nowhere | SRS005<!-- One validation implementation -->, in the tree | `active: true` | 1 of **38** — the population grew by the item |
| A `proposed` item bound nowhere | four `SRS` and one `SYS`, in the tree | `status: accepted` on SRS023<!-- The backend establishes no client identity and gates no route on one --> | 1 of **38**, naming that item |
| A verification-tier item bound nowhere | the whole tier, **50** items | one made `accepted` **and** `active`, still untagged | **nothing** — exit 0. It stays out, so the exclusion is by tier |

**The verification tier needed its control most**, because every item in it is `active: false` *and*
`status: proposed`, so exclusion by tier and exclusion falling through the `status` and `active` gates
are indistinguishable on the tree as it stands. Its second control is on the code: deleting the
verification arm from the fixture's script, against that same seed, reports all **50** as unplaceable
and fails.

## What the success line counts

Two lines, one per direction. A failing run prints neither, which shaped the last two rows.

| Case | Input | Reported |
|---|---|---|
| Baseline | no seed | 52 applications on 19 of 38 subjects, 37 items; all 37 of 93 tree items bound, 5 proposed / 1 retired / 50 verification outside |
| One of several applications of the same identifier removed | SYS003<!-- A deployment is parameterised from outside the image --> dropped from one edge, which keeps SRS007<!-- Configuration schema offers no secret-bearing key --> so the subject survives | **51** applications on **19** of 38, **37 items** — applications move alone |
| A subject loses every tag, the applications surviving elsewhere | `pageShell`'s only tag, SRS004<!-- Page renders a legible error state for every configuration failure class -->, moved onto `layout` | **52** applications on **18** of 38, **37 items** — subjects move alone |

**Each of the last two rows moves exactly one of the three numbers**, which makes them evidence that
the three are independent rather than one number spelled three ways. The middle row carries the
argument: the `04cea31` form reported a set union, so an identifier applied twice counted once and
deleting one of its applications left that line **byte-identical** before and after the seed. A count
that cannot move is not evidence. The third row moves the applications rather than stripping them,
because stripping leaves those items unbound, the run fails, and a failing run prints no success line
at all. Nothing gates any of this — a wrong success line fails no build, which is why it went
unnoticed until a model carried both a duplicated identifier and a deliberately untagged relationship
at once.

## Guards, and what they hide

- Both directions report in full rather than the first exiting. **The guards are the exception: each
  exits on the spot**, so the stripped-tag model reports *the model names no requirement* rather than
  37 unbound items. The guard is right; the reader has been told the run stopped, not that the rest is
  clean.
- **Each guard reads something the thing it guards does not** — the obliging-tier guard is keyed on
  the document set, the population guard on `status` and `active`, and the unbound set is a subset of
  the population.
- **The unparseable-model row is the one that matters.** `likec4 export json` behaves like `codegen`
  and **succeeds on a broken model**, emitting a degraded document whose tags have gone missing, so a
  check reading the export without validating first finds no unresolved identifier and prints success.
  Found by a malformed seed, not by design: had the degradation dropped the declarations too, the run
  would have been green.
- **Every degenerate input fails closed** — emptied model directory, removed model directory, removed
  requirements tree, unparseable model. The removed-directory case is the sharp one: `likec4 validate`
  exits **0** on a directory holding no model, so the element guard is the only thing catching it.
- **One export group is guarded and three are not.** Of `elements`, `relations`,
  `deployments.elements` and `deployments.relations`, only the first is asserted non-empty. The other
  three fail closed today because each holds the sole application of some identifier — a property of
  where the tags sit rather than of the check: with `.deployments.relations` dropped the run exits
  **0**, subjects falling 38 → 35 while all 37 items still report bound. A shape change in
  `likec4 export json` is the only input reaching this, so it is recorded rather than fixed. Asserting
  all four keys are **present** — not non-empty, which would red a project with no deployment block —
  is what would make it a property of the check.

**What it does not catch: a tag on a view.** The export carries tags in a fifth place and the scan does
not read it. That is deliberate — a view is a projection of the model rather than a subject in it, and
ADR 0019 rev 5 binds an item to an element or a relationship.

| Seed | Result |
|---|---|
| An item declared and applied **only** on a view | fails — *declared and applied to nothing*, and the item reported unbound |
| A view tag naming an item already applied to an element | passes, exit 0, the counts unmoved — the view tag is invisible in both directions |

The verdict is right in both and the message is not. This is also the control for the deployment rows
above: the same move into a group the scan **does** read passes. `globals`, `imports` and
`manualLayouts` carry no tag-bearing subject; `imports` is empty in a single-project setup and is the
next place to look if a second LikeC4 project is added.

**`check-arch` is unaffected, asserted rather than assumed** — `git status --porcelain` taken before
and after a run in a git fixture is unchanged, with zero index entries.
