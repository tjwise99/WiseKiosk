# `check-arch` — `render-arch-svg.py` / `splice-arch-diagrams.py`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

The recipe runs `likec4 validate`, `likec4 gen dot`, `render-arch-svg.py` (strips two
non-deterministic byte sources — Graphviz's version comment from each `.svg`, and LikeC4's own
`likec4_id` from each `.dot` — then renders `.dot` to `.svg` with the system Graphviz `dot` binary),
`splice-arch-diagrams.py` (splices an `![alt](path)` image reference, not a fence, so a fence marker
inside the artifact no longer applies), and `git diff --exit-code`. The splice script fails on marker
problems; staleness is caught by the diff.

| Direction | Input |
|---|---|
| Must fail | no `arch-export` markers in `docs/ARCHITECTURE.md` |
| Must fail | an odd number of markers — an unpaired begin or end |
| Must fail | `end` before `begin` |
| Must fail | a pair whose begin and end name different artifacts |
| Must fail | a marker naming an artifact that does not exist |
| Must fail | a marker path escaping `docs/architecture/` textually |
| Must fail | a **symlink** artifact resolving outside `docs/architecture/` |
| Must pass | a well-formed pair; two distinct pairs; an artifact in a subdirectory |
| Must pass | a second run — idempotent, byte-stable, reporting *already current* |
| Must pass (`render-arch-svg.py`) | two independent `likec4 gen dot` processes against an unchanged model, `likec4_id` stripped — byte-identical `.dot` (#115, empirical) |
| Must pass (`render-arch-svg.py`) | two `dot -Tsvg` renders of the same stripped `.dot`, same Graphviz build — byte-identical `.svg` (#115, empirical) |

The symlink case was observed splicing a file from outside the repository into the document with
exit 0. Confirmed separately, because only a real run shows it: a hand edit inside a marker region is
overwritten and the tree goes clean again, and a change to a generated artifact reaches the document.

**A defect this work surfaced, in this same PR (#115):** the first `render-arch-svg.py`, committed and
pushed, stripped only Graphviz's version comment. It passed a byte-identical-across-two-local-runs
check, because both local runs happened to land in the same short-lived Node process's memory-address-
or timing-derived id sequence. It failed CI's very first real run, against a fresh checkout in a fresh
process: `likec4 gen dot`'s `likec4_id` attribute — an internal relationship id, the same one `likec4
export json` was already documented as unstable across machines (ADR 0003 rev 4) — differed from the
committed `.dot` files on every relationship, with no model change at all. Two local re-runs in one
process is not the case that matters; two *independent* processes is, and that is what the row above
now records.

## The three-line gate

| Direction | Input |
|---|---|
| Must fail | a committed artifact no view produces — a view added, exported and its artifact committed, then the view deleted |
| Must fail | a committed view whose artifact was never committed |
| Must fail | a committed artifact hand-edited away from what the model produces |
| Must pass | the unseeded tree — exit 0, leaving **zero** index entries |

`arch-export`'s `rm -rf`, the `git add --intent-to-add`, and the `HEAD` in the diff are three parts of
one mechanism, and the whole grid was run — each line removed against every row, not only the row it
protects. Sixteen cells at `adc1f65`, each its own extraction with `node_modules` **copied** rather
than symlinked, the ablation applied to that fixture's own `justfile` and committed, each seed
asserted present in `HEAD` before the run.

| Seeded state | full | no `rm -rf` | no `--intent-to-add` | no `HEAD` |
|---|---|---|---|---|
| Unchanged tree (must pass) | 0 | 0 | 0 | 0 |
| Committed artifact hand-edited | 1 | 1 | 1 | 1 |
| Committed view, artifact never committed | 1 | 1 | **0** | 1 |
| Committed artifact no view produces | 1 | **0** | 1 | **0** |

**Each line is necessary for exactly one row, and no ablation false-positives on the unchanged tree.**
Corroborated by looking at the tree rather than the exit code:

- `codegen` never prunes, so the orphan artifact sits on disk byte-identical to what is committed.
- The uncommitted artifact *was* generated and `git status` reports it `??`, which `git diff` does not
  read as drift.
- `git add` with a pathspec stages the deletion `rm -rf` just made, so an index-relative diff reads
  worktree and index as agreeing.

The hand-edited row is caught by every variant because it is the only one of the three that changes a
**tracked** file in place — which is why it is the wrong case to develop this gate against, and why
the two needing machinery are the two that were missed. The unchanged column matters as much as the
zeroes: a gate can be made to catch everything by failing on everything.

**The orphan row's two zeroes are the pair to remember**, because they are the same index read twice.
Adding `--intent-to-add` to catch the uncommitted artifact silently re-opened the orphan, and the
`HEAD` closed it again: the two lines act on one index in opposite directions. It survived a full
local `just verify`, six commits and a green CI run — CI proves nothing here, the repository tree
holding no orphan — and was caught only by re-running the original finding's own reproduction against
the fix.

Two traps in seeding this, both hit: `--intent-to-add` persists in the index after a failing run, so
re-running the pre-fix recipe in that tree also exits 1 and reads as the hole never existing — build
each direction its own fixture. And symlinking `node_modules/` into a fixture reds the gate, the
trailing-slash ignore pattern not matching a symlink, so `git add -N` marks it.

Two live consequences of `git add -N` taking the whole silo rather than `generated/`: any untracked
non-ignored file under `docs/architecture/` fails the gate, and after a failing run `git stash`
refuses with *"Entry … not uptodate"* until `git reset` clears the marker. Staged in-progress work
under `docs/architecture/` also fails the gate.

**What it does not catch: the index** ([docs/CI.md](../../docs/CI.md) § *Documentation integrity*
states the mechanism) — measured at exit 0 for a staged hand-edit of a generated artifact, a staged
`git rm --cached` of it, and a staged tamper of the document. The same shape as the orphan defect
above, one level out: that recipe compared worktree to index and was blind to HEAD, this one compares
HEAD to worktree and is blind to the index — no form has compared all three.

**Unprobed, and so unevidenced:** worktrees, submodules, `core.fileMode`, `autocrlf`, sparse checkout,
and git older than 2.53. **`likec4 codegen` has no case here** — a gap, not a reasoned exemption, since
`check-site` seeds Sphinx's own validator below. `likec4 validate` is covered only partly by the
invalid-model row under `check-arch-trace.py`: it was run against the validator directly rather than
through the recipe, so what is evidenced is that the binary exits non-zero on an unparseable model,
not that `check-arch` reaches it.
