## What and why

<!-- What this changes, and the requirement or ADR it implements. Link the design it was written
against — a reviewer with no spec can only ask "does this look plausible?" -->

## Reviewability

- [ ] The diff can be read attentively in one sitting.
- [ ] Scoped to intended files only.

## Checks

- [ ] `just verify` passes locally; CI is green.
- [ ] A decision with a real rejected alternative is recorded as an ADR.
- [ ] Any value crossing the frontend/backend boundary is generated from the one schema, not
      hand-declared.
- [ ] The [review checklist](../CONTRIBUTING.md#review-checklist) is walked against this diff.
