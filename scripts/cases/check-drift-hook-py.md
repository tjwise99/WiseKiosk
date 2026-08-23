# `check-drift-hook.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s § Gate wiring; how to run a case is [`../README.md`](../README.md)'s.

Covers both keys, both directions of each, the hook file's absence, and the guard that reports an
unreadable block as unread rather than as a missing key. Script md5
`99a739253dcf0b3b4d873bebbb0e258b` at `8aea7a9 name the trigger`; each row is a scratch tree holding
that script and a `docs/requirements/tst/.doorstop.yml` of its own, the passing row being the config
this branch commits.

| Direction | Case | Input |
|---|---|---|
| Must fail | The whole `extensions:` block dropped | the shape `Document.save()` writes — `declares no top-level 'extensions' block … no extension key was examined`, then both missing keys |
| Must fail | `item_sha_required` deleted, `item_validator` kept | `declares no 'item_sha_required', so a referenced test can drift from its review unreported` |
| Must fail | `item_validator` deleted, `item_sha_required` kept | `declares no 'item_validator'` — the recorded hash with nothing reading it back |
| Must fail | `item_sha_required: false` | `is 'false', expected 'true'`. Doorstop tests the key's presence, so `false` still hashes; a config that reads as a thrown switch is the defect |
| Must fail | `item_validator` renamed to a file that exists nowhere | two problems: the wrong value, and `names .other_validator.py, which is not a file beside it` |
| Must fail | The hook file absent, the config intact | `names .req_sha_item_validator.py, which is not a file beside it` |
| Must fail | The config absent | `is absent, so this read no configuration` |
| Must fail | `extensions:` misspelled `extensons:` | the unread-block guard, then both missing keys — the silent-typo case, since Doorstop validates no `extensions` key |
| Must pass | The config this branch commits | `arms the drift hook — item_sha_required: true, item_validator: .req_sha_item_validator.py; hook file present beside it` |
| Must pass | `item_sha_required: 'true'` | the same scalar spelled quoted |
| Must pass | A trailing comment on the value | `item_sha_required: true # armed` |
| Must pass | Reordered, with an extra extension key | `item_sha_buffer_size` beside the two — the assertion is over the two named keys, not over the block's exact contents |

**The unread-block guard is what the misspelled-`extensions` row proves.** A walk that parses no
block finds no wrong value and would otherwise report only "no such key", which reads as a config
somebody edited rather than one this cannot follow.

**Seeded against the live tree as well as in scratch trees.** With the `extensions:` block removed
from `docs/requirements/tst/.doorstop.yml` and `// drift` appended to a referenced test,
`doorstop --error-all --no-reformat` exits **0**; with the block restored and the same drift in
place it exits **1** with four errors. That is the failure this check exists to catch, measured
rather than asserted.

**Legal input this rejects.**

- **A flow-style block.** `extensions: {item_sha_required: true, item_validator: …}` fails as an
  unread block: there is no YAML parser here, and a one-line mapping carries no nested key a line
  scan can see. Fail-closed rather than fail-open.
- **A value arriving by anchor or merge key.** Nothing here resolves an alias, so a config that
  declares the pair somewhere else and merges it in fails.

**Known gaps.**

- **The config, never a run.** No *row* observes Doorstop loading the hook — the rows are configs,
  and the check reads nothing else. That the armed pair actually fails a drifted reference is
  measured once, in the live-tree seed above, and nowhere else:
  [`the-requirements-tree-checks.md`](the-requirements-tree-checks.md)'s
  `doorstop --error-all --no-reformat` section holds two rows, both about parent links, and no row
  for a drifted reference, an unresolved keyword or a sha mismatch. That tier of the tree's own
  gate is unrecorded, and this record is not the place to close it.
- **The hook's contents are unread.** A file present but exporting no `item_validator`, or one whose
  comparison is wrong, passes here. What the hook must do is
  [ADR 0005 rev 2](../../docs/decisions/0005-traceability-gating.md)'s, and a check reading it would
  be a second implementation of it.
- **`sys/` and `srs/` are not examined.** The extension is per-document and only `TST` carries
  references to test files, so nothing here would have an opinion on the other two.
