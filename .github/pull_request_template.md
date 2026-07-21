## What and why

<!-- What this changes, and the requirement or ADR it implements. Link the design it was written
against — a reviewer with no spec can only ask "does this look plausible?" -->

## Reviewability

- [ ] The diff can be read attentively in one sitting.
- [ ] Scoped to intended files only.

## Checks

- [ ] `just verify` passes locally; CI is green.
- [ ] Docs swept for any claim this change invalidated (FOUNDATIONS / ARCHITECTURE / TESTING).
- [ ] A decision with a real rejected alternative is recorded as an ADR.
- [ ] Nothing on the "what must not be built" list (FOUNDATIONS §5) was added.
- [ ] Any value crossing the frontend/backend boundary is generated from the one schema, not
      hand-declared.
