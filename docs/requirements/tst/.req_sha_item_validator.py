"""Fail validation when a referenced file changed after the item was last reviewed.

`item_sha_required` writes the recorded hash; no core Doorstop command reads it back. This
is that read, wired as the document's `item_validator` hook so drift is reported inside
`doorstop --error-all`, per [ADR 0005 rev 2](../../decisions/0005-traceability-gating.md).

An entry with no recorded `sha` is skipped rather than failed: absence is Doorstop's own
pre-review state, and `Item.stamp()` is the backstop, because `references` — shas included —
ride the item's review fingerprint. Adding an entry, or dropping a `sha` from one, fails as
`unreviewed changes` without this hook having an opinion.
"""

from doorstop.common import DoorstopError


def item_validator(item):
    for reference in item.references or []:
        recorded = reference.get("sha")
        if recorded is not None and recorded != item._hash_reference(reference["path"]):
            yield DoorstopError(
                "referenced file changed since review: {}".format(reference["path"])
            )
