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

Beyond Doorstop's native fields, every item carries three stored attributes
([ADR 0005](../decisions/0005-traceability-gating.md)):

| Attribute | Values | Meaning |
|---|---|---|
| `status` | `proposed` \| `accepted` | Human review state. `proposed` items live on `main` — the tree is the backlog — but implementing against one is building on unbaselined spec |
| `verification-method` | `test` \| `inspection` \| `analysis` \| `demonstration` | How the requirement is verified; gates route on it |
| `rationale` | free text | Why the requirement exists. **Required at the `SYS` tier**, optional below |

`verification-method` and `rationale` are fenced by the review fingerprint (editing them re-flags
review); `status` is not, because a state transition is not a content change. Verified/implemented
is **derived by tooling from evidence, never stored** (ADR 0005).

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
- **After editing a parent,** its children go suspect. Re-read them, then clear:
  `doorstop review <UID>` (or `doorstop review all`). Reviewing is the human act of re-blessing a
  downstream item after its parent moved — do not script it blindly.
