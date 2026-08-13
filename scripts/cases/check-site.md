# `check-site`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

The recipe runs `doorstop_to_needs.py` and then `sphinx-build -W`, so any warning fails the gate.

| Direction | Input |
|---|---|
| Must fail | a toctree naming a document that does not exist |
| Must fail | an unknown directive |
| Must fail | a duplicate explicit label |
| Must fail | an item whose link names a parent the tree does not hold — the generator emits a warning |
| Must fail | malformed item YAML — the generator raises rather than warns |
| Must pass | the tree as it stands |
| Must pass | a `.yaml`-suffixed item — it reaches the generated pages rather than being dropped |

The `.yaml` row closes the third of three raw item loaders. Two are in `scripts/`; this one is the
generator, and leaving it would have meant the tree gates judging an item the published site silently
omits, with warnings-as-errors unable to report a page nobody asked for.

**What it does not catch**, both run and observed. A broken MyST cross-reference does not fail the
build: `conf.py` sets `suppress_warnings = ["myst.xref_missing"]`, so the MyST forms are silently
dropped, while Sphinx's own `{ref}` role is not covered by that suppression and still fails under
`-W`. A new top-level document does not orphan-warn, because `docs/site/index.md` carries `:glob:`
toctrees that adopt it. Both are configuration choices, but they mean this gate asserts *the site
builds*, not *the site is internally consistent*.
