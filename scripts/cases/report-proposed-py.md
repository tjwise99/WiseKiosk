# `report-proposed.py`

The inputs this reporter has been run against, in both directions. What it asserts, and why, is
[`docs/CI.md`](../../docs/CI.md) § Gate wiring's; how to run a case is [`../README.md`](../README.md)'s.

It reports and never gates, so both directions here are about the output, not the exit status: every
row below exited zero, and a row where it did not would be a defect in its own right. All rows run
against a copy of the tree; the reporter only reads, but the copy discipline is the tree checks'.

| Direction | Input | Output |
|---|---|---|
| Must show | the tree as it stands, `proposed` items in every tier | each tier's count against its population, identifiers listed; exit 0 |
| Must show | every item's status flipped to `accepted` | every tier prints its zero against its population, and the line does not disappear; exit 0 |
| Must show | one item's status misspelled | listed on its own line as outside the vocabulary, counted neither proposed nor baselined; exit 0 |
| Must show | one item's `status` key deleted | counted at its document's `attributes.defaults` value — `proposed` in this tree — not dropped; exit 0 |

**Known gaps.**

- A tree yielding no items prints `0 of 0 item(s)` and exits zero — visible only through its own
  population figure. Deliberate: reporting must not gate, and `check-unreviewed.py` fails that state
  before this runs in the recipe.
- The vocabulary line reports; failing a mis-spelled status is `check-arch-trace.py`'s, and only for
  the obliging tiers — a `TST` status outside the vocabulary is listed here and gated nowhere.
