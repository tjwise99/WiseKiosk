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
| `SYS` | [`sys/`](sys) | Stakeholder / system-level needs (the validation anchor) | — (top) |
| `SRS` | [`srs/`](srs) | Decomposed, testable "shall" statements | `SYS` |
| `TST` | [`tst/`](tst) | One item per test/check; `references` point at the real verifying file | `SRS` |

Each item is one YAML file named for its ID (`SYS001.yml`, `SRS001.yml`, `TST001.yml`). IDs are the
prefix plus a zero-padded 3-digit number. **An ID is permanent** — once assigned it is never reused or
renumbered, so external references to it stay valid.

> **One-time ID reset.** The tree seeded alongside the tooling (`SYS001`–`006` and children) was
> placeholder content and was cleared by the requirements rewrite; IDs were re-established from
> `001` with new meanings. Permanence applies from that reset forward.

## Item attributes

Beyond Doorstop's native fields, every item carries four stored attributes
([ADR 0005](../decisions/0005-traceability-gating.md),
[ADR 0009](../decisions/0009-verification-justification-attribute.md)):

| Attribute | Values | Meaning |
|---|---|---|
| `status` | `proposed` \| `accepted` | Human review state. `proposed` items live on `main` — the tree is the backlog — but implementing against one is building on unbaselined spec |
| `verification-method` | `test` \| `inspection` \| `analysis` \| `demonstration` | How the requirement is verified; gates route on it |
| `verification-justification` | free text | Why the method is not `test` — what specifically blocks a mechanically-decidable check. **Required when `verification-method` is not `test`**, empty otherwise |
| `rationale` | free text | Why the requirement exists. **Required at the `SYS` tier**, optional below |

`rationale` and `verification-justification` answer different questions: why the obligation exists,
versus why it cannot be settled by a machine. An item at `inspection`, `analysis`, or `demonstration`
is claiming a human must judge it; the justification is that claim's evidence, so a method can never
be weakened without saying what blocks the stronger one.

`verification-method`, `verification-justification`, and `rationale` are fenced by the review
fingerprint (editing them re-flags review); `status` is not, because a state transition is not a
content change. Verified/implemented
is **derived by tooling from evidence, never stored** (ADR 0005).

### Choosing a verification method

Two rules, in order:

1. **An item sits at the strongest method it honestly supports** — `test` over
   `demonstration`/`analysis` over `inspection`. Strength is what the obligation *can* bear, not what
   has been built yet: an unwritten check is a backlog entry, not a reason to claim `inspection`.
2. **A mixed-method item is a defect, not a classification case.** Where an item's text welds a
   mechanically-decidable clause to a residual judgement, split it so each clause sits at its own
   honest method. Averaging the item down hides the decidable half; leaving it at `test` hides the
   judgement half, which is worse — it reads as a machine guarantee nobody has.

It follows that **a parent's method equals the weakest method among its children**: the parent's
obligation is the conjunction of theirs, so it can be no stronger than the weakest, and claiming
less than that understates what the tree already proves. A parent weaker than every child is
under-classification; a parent stronger than its weakest child is a false signal. Both are defects.

Where a parent legitimately holds a residual obligation no child carries — a conclusion drawn by
comparing the children's bounds against something outside the system — it may sit below its
children, and the `verification-justification` says why.

## The V&V model: Doorstop proves linkage, the test suite proves correctness

This is the load-bearing distinction. **Doorstop does not run anything.** It proves that the graph is
complete and current:

- **Validation** (completeness) — every `SYS` need has a child `SRS`, every `SRS` has a child `TST`,
  and no `SRS`/`TST` is orphaned without a parent. A gap fails the gate.
- **Verification linkage** — every active `TST` item's `references` must resolve to a real file in the
  repo. A dangling reference fails the gate.
- **Re-validation** — editing a parent item changes its fingerprint, flagging every child **suspect**
  until re-reviewed. A silent divergence is impossible.

What Doorstop does **not** do is prove the referenced check actually passes. That is the job of
[`just verify`](../../justfile) and the CI suite. Doorstop proves a `TST` item *points at* a real
verifying file; the corresponding `just` gate proves that check *passes*. Both are required.

### Pending verifications

Where a requirement's verifying test does not exist yet (no application code has landed), its `TST`
item is committed **`active: false`** with a note describing the test to come. Inactive items are
excluded from reference/review checking, so the tree still validates clean; each is activated and
given a real `references` entry as its test lands. Inactive `TST` items surface as an informational
`no item with UID: TST00x` line during validation — that is Doorstop noting a stubbed verification,
not a failure (the run still exits 0).

### Pending decomposition

The same idiom extends upward while the tree is being built out: a `SYS` or `SRS` item whose
decomposition round has not yet arrived is committed **`active: false`** with its full content and
attributes. The strict gate errors on any *active* parent with no child links, so an item is
activated in the same change that writes its first child. Elsewhere `active: false` means
retirement (ADR 0005); an item carrying a pending note is awaiting decomposition or its verifying
artifact, not retired.

**Activation is a review act.** Doorstop skips inactive items entirely, so a `reviewed` stamp on a
pending item carries no authority and edits to pending items are invisible to the gate. The fence
lands at activation: the change that activates an item re-reads it in full and stamps its review
(`doorstop review <UID>`) then — never before, never scripted.

## Running the gate

Requires a local venv — siloed here beside the requirements it serves — with the pinned tool
([`requirements-dev.txt`](requirements-dev.txt)). Create it from the repo root:

```sh
python3 -m venv docs/requirements/.venv
docs/requirements/.venv/bin/pip install -r docs/requirements/requirements-dev.txt
```

Then:

```sh
just check-reqs      # docs/requirements/.venv/bin/doorstop --error-all  — the strict gate (fails on any issue)
just verify          # runs check-reqs alongside the other repo gates
```

`just check-reqs` runs the **exact** command CI runs (see
[`../../.github/workflows/checks.yml`](../../.github/workflows/checks.yml), job `requirements`):
`docs/requirements/.venv/bin/doorstop --error-all`. The `--error-all` flag promotes Doorstop's suspect / unreviewed /
orphan / unresolved-reference warnings to errors, so the process exits non-zero and the gate actually
blocks — plain `doorstop` only warns.

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
  clause that reverses a recorded decision is a finding: either the decision is reopened with its own
  review, or the clause does not land. (A phone-width `shall` slipped this way in the #38 round,
  against a scope decision recorded in `SYS013` — caught only by independent review.)
- **Traceability is item-level; individual clauses are not checked.** An item that links two parents
  satisfies the orphan gate at item granularity, yet a single clause inside its `text` can be
  supported by *neither* parent — an orphan the gate cannot see. Prefer one obligation per parent;
  when an item must span parents, confirm by hand that every clause traces to one of them.
- **A baselined round lands its `SYS`/`SRS` `accepted` + `active: true`** (reviewed in the same
  change). Only items awaiting decomposition or a verifying artifact stay `active: false` (see
  *Pending* above). "Active" and "reviewed" arrive together — an active-but-unreviewed item fails
  `--error-all` — so a domain's requirements are never left `proposed`/inactive, which would leave
  them un-baselined and outside the gate.
