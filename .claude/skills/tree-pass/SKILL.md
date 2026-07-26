---
name: tree-pass
description: >-
  Run a triage pass over a tier of the WiseKiosk Doorstop tree — SYS, SRS or TST — deciding which
  items earn their place and rewriting the ones that stay. Carries this repo's mechanics: how to
  parse the tree, the invariants to re-check after every ruling, the method rule, the review
  fingerprint, and how decisions are recorded. Invoke when condensing or reviewing a tier, when a
  requirement "reads like a list", or when auditing the tree for orphans and method mismatches.
  For the judgement itself — what earns its place — use the requirements-triage skill.
---

# Tree pass

Judgement lives in **`requirements-triage`** (global skill): the tells, the dispositions, the
governing rule that a requirement states a want. Load it first. This skill carries only what is
specific to this tree.

Conventions are in [`docs/requirements/README.md`](../../../docs/requirements/README.md) and are
authoritative where this file and it disagree.

## Mechanics you cannot do by eye

Doorstop links are a list of either bare UIDs or single-key mappings. Parse, never grep:

```python
import yaml, glob, os, collections
items = {os.path.basename(p)[:-4]: yaml.safe_load(open(p))
         for p in glob.glob('docs/requirements/*/*.yml')}
kids = collections.defaultdict(list)
for k, v in items.items():
    for l in (v.get('links') or []):
        kids[l if isinstance(l, str) else list(l.keys())[0]].append(k)
```

Run the tool from its own venv — it is siloed with the feature it serves:
`docs/requirements/.venv/bin/python`, installed from `docs/requirements/requirements-dev.txt`.

## Invariants — re-run after every ruling, not at the end

1. **No orphan.** Every `SRS` has a surviving `SYS` parent; every `TST` a surviving `SRS`.
2. **No childless active item.** An active parent with no children fails the strict gate.
3. **Method rule.** A parent's `verification-method` equals the **least-decidable** method among its
   children, ordered by mechanical decidability: `test` > `analysis` > `inspection` >
   `demonstration`. Gated by `scripts/check-method-consistency.py`. Re-parenting one `inspection`
   child onto an all-`test` parent silently drags the parent down — this has happened, three times
   in one pass.
4. **Cascade recorded.** Deleting an `SRS` orphans its `TST` children. Enumerate them, and note
   which were `active` with real `references` — those are live checks, not placeholders.
5. **Clause-level tracing.** `--error-all` links item-to-item and cannot see a clause of a child
   tracing to no clause of its parent. **This tree's dominant defect class.** Every merge must be
   checked clause by clause by a human.

## The review fingerprint

`Item.stamp()` hashes **the UID** along with text and references (`doorstop/core/item.py`). Three
consequences:

- Renaming an item unreviews it, and makes every child suspect via the parent stamp in `links:`.
- A `reviewed` stamp copied across a UID change cannot match — the tooling catches forged carry-over.
- `verification-method`, `verification-justification` and `rationale` are inside the fence; `status`
  is not.

Clearing suspect links and re-stamping is a **human read**, never scripted
(`docs/requirements/README.md`). Inactive items are skipped by Doorstop entirely, so a stamp on a
pending item carries no authority — edits there are nearly free now and expensive after activation.

## Where content goes when it leaves the tree

| Content | Home |
|---|---|
| Product premise, operator truth | `README.md` |
| Settled decision with a rejected alternative | `docs/decisions/` (ADR) |
| As-built structure | `docs/ARCHITECTURE.md` — **facts only**, never rationale |
| Test strategy | `docs/TESTING.md` |
| A reason | the item's own `rationale` |
| "Revisit if X" | a **reopen premise** in `rationale`, in `SYS019`'s form |
| Uncommitted feature | a GitHub issue, with the reopen path written into it |
| A lint rule or threshold | a `TST` item, or tool configuration |

Every item must carry a `verification-justification` — below `test`, what blocks a mechanical check;
at `test`, what the check leaves unproven ([ADR 0009](../../../docs/decisions/0009-verification-justification-attribute.md)).

## Recording

**One issue comment per ruling, at the moment it is taken.** The issue thread is the authoritative
record — scratchpad summaries go stale the moment a later ruling contradicts them, and a rebuild
authored from a summary will silently carry the stale version.

Each comment states: the decision, the owner's reasoning in their words where given, the resulting
text, the children and their covering clauses, the count, and anything knowingly given up.

## Verification before proposing merge

`just verify` green, confirmed in CI rather than locally. Independent review is mandatory when this
session authored the change — see `CLAUDE.md`. Two reviewers with opposed briefs surface more than
one neutral reviewer: on the pass that produced this skill, the adversarial pair caught six lost
obligations, a reversed decision, and three method mismatches that the authoring session had
verified and believed sound.
