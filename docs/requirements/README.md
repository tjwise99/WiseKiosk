# Requirements & verification (Doorstop)

WiseKiosk's requirements are tracked as a **Doorstop** tree under this
directory. Doorstop is a Python, Git-native requirements-management tool; it gives every requirement a
**stable ID**, decomposes stakeholder needs into
testable software requirements and then into verification items, and **fails CI** when a requirement
change leaves a downstream item unreviewed, an item orphaned, or a verification reference unresolved.

Why this exists and why Doorstop specifically:
[ADR 0002](../decisions/0002-requirements-management-doorstop.md).

## The three documents

A V-model tree — needs on the left, verification on the right:

| Prefix | Document | Holds | Links up to |
|---|---|---|---|
| `SYS` | [`sys/`](sys) | Stakeholder / system-level needs (the validation anchor), framework and per-module alike | — (top) |
| `SRS` | [`srs/`](srs) | Decomposed, testable "shall" statements | `SYS` |
| `TST` | [`tst/`](tst) | One item per test/check; `references` point at the real verifying file | `SRS` |

A module is a need: each carries one `SYS` item for its user-facing want, decomposed into `SRS` items
stating only what is specific to that module. Obligations true of every module stay on the framework
needs and are not restated ([ADR 0012](../decisions/0012-module-requirements-in-tree.md)).

Each item is one YAML file named for its ID (`SYS001.yml`, `SRS001.yml`, `TST001.yml`). IDs are the
prefix plus a zero-padded 3-digit number. **An ID is permanent** — once assigned it is never reused
or renumbered, so external references to it stay valid.

> **One-time ID reset.** The tree seeded alongside the tooling (the first six `SYS` items and their
> children) was placeholder content and was cleared by the requirements rewrite; IDs were
> re-established from `001` with new meanings. Permanence applies from that reset forward.

## Item attributes

Beyond Doorstop's native fields, every item carries four stored attributes
([ADR 0005](../decisions/0005-traceability-gating.md),
[ADR 0009](../decisions/0009-verification-justification-attribute.md)):

| Attribute | Values | Meaning |
|---|---|---|
| `status` | `proposed` \| `accepted` | Human review state. `proposed` items live on `main` — the tree is the backlog — but implementing against one is building on unbaselined spec |
| `verification-method` | `test` \| `inspection` \| `analysis` \| `demonstration` | How the requirement is verified; gates route on it |
| `verification-justification` | free text | What the item's verification settles and what it does not. Below `test`, what specifically blocks a mechanically-decidable check; at `test`, what the check leaves unproven. **Required on every item** |
| `rationale` | free text | Why the requirement exists. **Required at the `SYS` tier**, optional below |

**`header` is machine-read, so it is constrained.** Prose cites an item by identifier and header
together, the header carried verbatim inside an HTML comment
([`../CI.md`](../CI.md) § Documentation integrity), so header text is embedded into running Markdown.
Every header must therefore be non-empty, drawn from `A-Z a-z 0-9` and `` ,.'()&:;- ``, and not a
prefix of another item's header. The permitted set is an allowlist: a list of characters to reject
fails open on the one nobody thought of, and a header carrying `|` would split a table while one
carrying `-->` would close its own comment — neither visible to any other check. Prefix-freeness is
the reader's constraint rather than the checker's, which compares a header exactly: two items whose
headers begin alike are told apart only by a reader who reaches the end of both.

`rationale` and `verification-justification` answer different questions: why the obligation exists,
versus what its verification does and does not settle. An item at `inspection`, `analysis`, or
`demonstration` is claiming a human must judge it, and the justification is that claim's evidence, so
a method can never be weakened without saying what blocks the stronger one. An item at `test` is
claiming a machine settles it, and the justification bounds that claim — a green check that decides
set equality against a recorded list has not decided that the list is right.

`verification-method`, `verification-justification`, and `rationale` are fenced by the review
fingerprint (editing them re-flags review), as are the item's **parent links** — `Item.review()`
stamps the sorted parent UIDs along with the content, so re-parenting an item unreviews it. `status` is
not fenced, because a state transition is not a content change. Verified/implemented
is **derived by tooling from evidence, never stored** (ADR 0005).

**An item's `text` names no other item.** The obligation must be readable on its own —
ISO/IEC/IEEE 29148's *complete* and *singular* characteristics — and an identifier inside it defeats
that twice over: the reader cannot tell what is required without a lookup, and a renumber rewrites
`links:` while leaving the sentence pointing at whatever now occupies the number. Say the thing
itself. `rationale` and `verification-justification` explain the tree to someone reading it as a
tree, so they may name items freely; `check-text-citations.py` fails on `text` only.

### Choosing a verification method

Methods are ordered by **mechanical decidability** — how much of the verification a machine settles,
unattended, on every commit:

> `test` > `analysis` > `inspection` > `demonstration`

This is deliberately **not** the classical V&V rigor ordering, which ranks evidential strength and
places demonstration above inspection. Ranked that way, "move to the stronger method" would push an
item out of continuous integration and onto physical hardware or a wall clock — the opposite of what
this tree is for. `demonstration` sits last because it is the one method that can never gate a
merge, not because a thirty-day soak proves less than reading a file.

Two rules, in order:

1. **An item sits at the most decidable method it honestly supports.** Decidability is what the
   obligation *can* bear, not what has been built yet: an unwritten check is a backlog entry, not a
   reason to claim `inspection`.
2. **A mixed-method item is a defect, not a classification case.** Where an item's text welds a
   mechanically-decidable clause to a residual judgement, split it so each clause sits at its own
   honest method. Averaging the item down hides the decidable half; leaving it at `test` hides the
   judgement half, which is worse — it reads as a machine guarantee nobody has.

It follows that **a parent's method equals the least decidable method among its children**: the
parent's obligation is the conjunction of theirs, so it can be no more decidable than the least, and
claiming less than that understates what the tree already proves. A parent below every child is
under-classification; a parent above its least-decidable child is a false signal. Both are defects.

Where a parent legitimately holds a residual obligation no child carries — a conclusion drawn by
comparing the children's bounds against something outside the system — it may sit below its
children, and the `verification-justification` says why.

**A non-normative item (`normative: false`) obliges nothing**, so it carries an empty
`verification-method` and no justification, and needs no children. It states orientation or scope
whose falsifiable content is owned by other items, and is written in the indicative — a `shall` in a
non-normative item reads as an obligation nothing verifies. This is the one legal empty method;
every normative item has one.

## The V&V model: Doorstop proves linkage, the test suite proves correctness

This is the load-bearing distinction. **Doorstop does not run anything.** It proves that the graph is
complete and current:

- **Validation** (completeness) — every `SYS` need has a child `SRS`, every `SRS` has a child `TST`,
  and no `SRS`/`TST` is orphaned without a parent. A gap fails the gate.
- **Verification linkage** — every active `TST` item's `references` must resolve to a real file in the
  repo. A dangling reference fails the gate.
- **Re-validation** — editing a parent item changes its fingerprint, flagging every child **suspect**
  until re-reviewed, and moving a child to a different parent unreviews the child. Among **active**
  items a silent divergence is impossible; an inactive item is evaluated for neither, and what is and
  is not covered there is [below](#pending-decomposition).

What Doorstop does **not** do is prove the referenced check actually passes. That is the job of
[`just verify`](../../justfile) and the CI suite. Doorstop proves a `TST` item *points at* a real
verifying file; the corresponding `just` gate proves that check *passes*. Both are required.

### Pending verifications

Where a requirement's verifying test does not exist yet (no application code has landed), its `TST`
item is committed **`active: false`** with a note describing the test to come. Inactive items are
excluded from reference/review checking; each is activated and given a real `references` entry as its
test lands. A `SRS` parent whose child is pending surfaces an informational `no item with UID: TST00x`
line during validation — Doorstop noting a stubbed verification, not a failure.

**A tier in which every item is pending is a different case, and it does not validate clean.**
Doorstop treats a document with no *active* item as having no items at all, and stops checking it
there. That is the tier the `TST` document is in until the first test lands, and it is why the gate
runs Doorstop behind [`validate-tree.sh`](#running-the-gate) rather than directly.

### Pending decomposition

The same idiom extends upward while the tree is being built out: a `SYS` or `SRS` item whose
decomposition round has not yet arrived is committed **`active: false`** with its full content and
attributes. The strict gate errors on any *active* parent with no child links, so an item is
activated in the same change that writes its first child. Elsewhere `active: false` means
retirement (ADR 0005); an item carrying a pending note is awaiting decomposition or its verifying
artifact, not retired.

**Activation is a review act.** Doorstop skips inactive items entirely, so a `reviewed` stamp on a
pending item carries no authority and edits to a pending item's own text are invisible to the gate.
One half of that is now mechanical: `check-suspect-links.py` fails when a pending item's *parent*
moves after the link was reviewed, which is the drift Doorstop cannot see. The rest still lands at
activation — the change that activates an item re-reads it in full and stamps its review
(`doorstop review <UID>`) then, never before, never scripted.

## Running the gate

Requires a local venv — siloed here beside the requirements it serves — with the pinned tool
([`requirements-dev.txt`](requirements-dev.txt)). Create it from the repo root:

```sh
python3 -m venv docs/requirements/.venv
docs/requirements/.venv/bin/pip install -r docs/requirements/requirements-dev.txt
```

Then:

```sh
just check-reqs      # check-unreviewed.py, check-suspect-links.py, validate-tree.sh, check-method-consistency.py, check-text-citations.py, check-headers.py
just verify          # runs check-reqs alongside the other repo gates
```

`just check-reqs` runs the **exact** commands CI runs (see
[`../../.github/workflows/checks.yml`](../../.github/workflows/checks.yml), job `requirements`):
`scripts/check-unreviewed.py`, then `scripts/check-suspect-links.py`, then
`scripts/validate-tree.sh`, then `scripts/check-method-consistency.py`, then
`scripts/check-text-citations.py`, then `scripts/check-headers.py`. The `--error-all` flag
`validate-tree.sh` passes to Doorstop promotes its suspect / unreviewed / orphan /
unresolved-reference warnings to errors, so the process exits non-zero and the gate actually
blocks — plain `doorstop` only warns.

**Why Doorstop runs behind a wrapper: one exception, and it expires by itself.** Doorstop's
`Document.items` is active-only, so a document whose items are *all* pending yields `no items` and
returns **before every other check on that document**. Every `TST` item is pending until the code it
checks exists, so under `--error-all` the whole verification tier is at once fatal and unvalidated.
`validate-tree.sh` tolerates that one error and nothing else. It also fails when the error stops
appearing — an active `TST` item means the exception is dead, and a dead exception that passes
quietly is how a suppression becomes permanent ([`../CI.md § The exception
register`](../CI.md#the-exception-register) refuses the same shape). Retiring it is #78.

**`check-unreviewed.py` runs first because Doorstop writes.** Validating the tree stamps a review
fingerprint into any item that has none, and into any link carrying no stamp — whether or not a
person looked, and `--no-reformat` does not prevent it. An item authored in one commit would
otherwise be "reviewed" by whoever next ran the gate, which is the one thing the fingerprint exists
to prove. Failing first stops Doorstop before it can stamp. Clear it with `doorstop review <uid>`,
deliberately, never by re-running the gate.

Between them the five commands assert that no item carries a review fingerprint nobody wrote; that
every parent link resolves and no item is orphaned or left suspect, **inactive items included**;
that every active `TST` item's `references` resolve to a real file; that every item carries a
`verification-justification`; that no item claims a verification method its own children do not
support; and that no item's `text` names another item. Each is a property of the
specification, which is why they are stated here rather than in
[`../CI.md`](../CI.md) with the repository's checks — that document says they run and block, this one
says what they mean. `check-verify-ci-parity` asserts the recipe-to-CI correspondence one command at
a time, so a command added to the recipe and not to CI fails rather than passing unseen.

The browsable, click-through traceability view of this tree (needtables, link graphs, matrices) is
built by the documentation site silo, [`../site/README.md`](../site/README.md) (ADR 0004); this
directory is the requirements' canonical source and gate, not its presentation.

## Adding or changing requirements

Run all commands with the venv (`docs/requirements/.venv/bin/doorstop …`):

- **Add an item:** `doorstop add SRS` (creates the next `SRS0NN.yml`). Edit its `text` to a single
  "shall" statement; write a `header` summarising it.
- **Link it up:** `doorstop link SRS0NN SYS0MM` (child first, parent second). Every `SRS` needs a
  `SYS` parent and every `TST` a `SRS` parent, or the gate flags an orphan.
- **Point a `TST` at its check:** add a `references` list entry `{path: <repo-relative-file>, type:
  file}`. The path must resolve to a real tracked file. **Doorstop cannot reference a file under a
  dot-directory** (e.g. anything in `.github/`) — see ADR 0002; cite such wiring in the item's `text`
  instead.
- **After editing a parent,** its children go suspect. Re-read each child, then run
  `doorstop clear <UID>` followed by `doorstop review <UID>` — `clear` updates the stored parent
  fingerprint in the child's `links:`; `review` alone re-stamps the item but leaves the link
  suspect. Re-blessing is the human act of re-reading a downstream item after its parent moved —
  do not script it blindly.
- **After moving an item to a different parent,** the item itself is unreviewed — its parent UIDs are
  inside its own stamp — so `clear` is not enough. Read it against the parent it now has and
  `doorstop review <UID>`. `--error-all` reports it as `unreviewed changes` until you do.
- **Neither command can reach an inactive item.** `Tree.find_item` is active-only, so
  `doorstop review TST019`<!-- Pending: no identity-based rejection, in the contract or on the wire -->
  and
  `doorstop clear TST019`<!-- Pending: no identity-based rejection, in the contract or on the wire -->
  both answer `no item with UID` while that item is pending. Stamping one takes a loop over
  `document._iter()`. Where a pending item's link goes suspect before activation, that loop is the
  only route.
- **Inactive items are not rewritten by Doorstop**, so write their parent links in dict form,
  `- UID: null` (the form Doorstop itself stamps); a plain-string link breaks the docs-site
  needs generator.
- **Quote two-digit levels** (`level: '1.10'`) — unquoted, YAML parses a float and collapses it
  to `1.1`.
- **A document can never be empty** — "no items" is a gate error, so a tree reset must land in
  the same change as its first new items.
- **Check the tree before adding a normative clause.** A new `shall` can contradict a decision
  already recorded in an existing item's `rationale` — a deliberately-excluded case, a boundary an
  owner already fixed. `--error-all` cannot see this; grep the relevant items' rationales first. A
  clause that reverses a recorded decision is a finding: either the decision is reopened with its
  own review, or the clause does not land. (A phone-width `shall` slipped this way in the #38 round,
  against a scope decision recorded in `SYS002`<!-- The configured layout renders whole --> —
  caught only by independent review.)
- **Traceability is item-level; individual clauses are not checked.** An item that links two parents
  satisfies the orphan gate at item granularity, yet a single clause inside its `text` can be
  supported by *neither* parent — an orphan the gate cannot see. Prefer one obligation per parent;
  when an item must span parents, confirm by hand that every clause traces to one of them.
- **A baselined round lands its `SYS`/`SRS` `accepted` + `active: true`** (reviewed in the same
  change). Only items awaiting decomposition or a verifying artifact stay `active: false` (see
  *Pending* above). "Active" and "reviewed" arrive together — an active-but-unreviewed item fails
  `--error-all` — so a domain's requirements are never left `proposed`/inactive, which would leave
  them un-baselined and outside the gate.
