# The requirements-tree checks

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

All seven run against a copy of the tree. Each passes on an unseeded copy, which is the must-pass row
every table below shares and none repeats.

## `check-unreviewed.py`

| Direction | Input |
|---|---|
| Must fail | an item with its `reviewed:` line deleted |
| Must fail | `reviewed: true` — Doorstop's declared-review placeholder, which YAML makes a bool |
| Must fail | `reviewed:` present but empty |
| Must fail | a `.yaml`-suffixed item with no fingerprint |
| Must fail | an item with no `reviewed:` whose link carries the parent's real stamp, copied by hand |
| Must fail | one silo removed; one renamed; one emptied; all three removed |
| Must fail | a document with no items — a fourth tier, or one nested below a silo |
| Must fail | a nested document holding an item with no `reviewed:` |
| Must fail | two nested documents sharing a directory name, one of them empty |
| Must pass | a fourth tier, and a nested document, each holding one reviewed item |
| Must pass | a `.doorstop.yml` under `.venv/`, a tool's directory rather than a tier |

**Known gaps.**

- A quoted, non-empty `reviewed:` string spelling falsehood passes — the check tests only that the
  value is a non-empty string. The owner ruled on 2026-08-02 to record rather than close it: closing
  it pins Doorstop's internal encoding into the gate for a defect reachable only by hand-forgery, and
  the forged item fails the next real validation on content mismatch anyway.
- The same gap swallows a pasted stamp on a genuinely reviewed item — both digests are correct for
  their content, so it is invisible everywhere.
- Malformed item YAML raises a traceback rather than the tool's diagnostic; it still exits non-zero,
  so it fails closed.

## `check-suspect-links.py`

| Direction | Input |
|---|---|
| Must fail | the parent of an inactive item mutated, so the child's stamp goes stale |
| Must fail | an inactive item linking a parent UID the tree does not hold |
| Must pass | a **`SYS`** item mutated — its `SRS` children are active, so nothing inactive went stale |

**Documented gap, not to be closed.** A `TST` item's *own* fingerprint is checked for presence, never
correctness: inactive items are invisible to `doorstop --error-all`, and this check scopes itself to
link staleness, so a stale stamp on a `TST` item's own text or attributes passes all three tree
checks. This is #80's pending-population gap, and the owner ruled on 2026-07-30 not to gate it — a
re-stamp on every placeholder edit is the most common act in a tree pass, and the CLI cannot reach an
inactive item.

## `validate-tree.sh`

| Direction | Input |
|---|---|
| Must fail | a link naming a parent UID the tree does not hold, on an **active** item |
| Must fail | a `TST` item activated — the pending-tier exception reports itself dead |
| Must fail | the venv's `doorstop` absent — named as missing, not diagnosed as a live tier |
| Must pass | the tree as it stands |

The *no items* message collides between *all items inactive* and *no items exist*; in this tree's
topology it never occurs without a distinct second error line from the active tiers.

## `check-method-consistency.py`

| Direction | Input |
|---|---|
| Must fail | a blanked `verification-justification` |
| Must fail | a parent at `inspection` above children at `test` — overstating |
| Must fail | a capitalised `Test` on a parent |
| Must fail | a typo such as `tset` |
| Must fail | the `verification-method` key deleted |
| Must pass | a `normative: false` item carrying an empty method and no justification |

## `check-text-citations.py`

| Direction | Input |
|---|---|
| Must fail | an identifier in an item's `text` |
| Must fail | a **lowercase** identifier in an item's `text` |
| Must pass | an identifier in `rationale` |

## `check-headers.py`

| Direction | Input |
|---|---|
| Must fail | an emptied header — which also trips the prefix-free rule, an empty string prefixing every other header |
| Must fail | a header containing `/`, outside the permitted set |
| Must fail | a header containing an en dash |
| Must fail | a header containing a **non-breaking space**, leading or mid-string |
| Must pass | a header folded across two lines in the YAML block scalar |

- A zero-width space, not being whitespace to Python, is caught throughout.
- A *trailing* non-breaking space is unreachable rather than accepted: Doorstop strips it from the
  block scalar before the check reads the header, confirmed by reading `item.header` directly.

## `check-citations.py`

| Direction | Input |
|---|---|
| Must fail | a citation naming no item |
| Must fail | a citation carrying the wrong header for a real item |
| Must fail | an `ADR` number naming no file |
| Must fail | a **lowercase** identifier, cited or not |
| Must fail | a mixed-case identifier |
| Must fail | an untracked `.md` — the untracked guard names it as unreadable, whatever it contains |
| Must pass | an identifier or ADR number inside a fenced code block |
| Must pass | an untracked `.md` under `.claude/` — outside this gate's population, so outside its guard |
| Must pass | a word merely containing an identifier |
| Must pass | a correct uppercase citation with its verbatim header |

The case rows exist because a lowercase citation carrying a fabricated header on a *real* item passed
clean — the exact failure the check exists to catch, invisible rather than reported. The owner ruled
on 2026-08-02 that a mis-cased identifier is malformed.

**Two wrapping rules, and they differ.** The `ADR` pattern admits exactly one line break between the
word and its number; the header normaliser admits any number, including a blank-line paragraph break.
Neither is a false-resolve — CommonMark reads the comment as one either way — and the difference is
between two readers rather than between a document and its code.
