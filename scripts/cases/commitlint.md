# The Conventional-Commit gate: `commitlint`, both stages

The inputs the adopted gate has been run against, in both directions. The gate replaces
`check-commit-msg.sh` and `conventional-commit.regex`
(ADR 0016 rev 5; #107 adopt commitlint), and the rows below are that check's recorded cases re-run
against the adopted tool — including the must-pass rows, since an adopted tool may reject legal
input the authored check accepted. Why the two stages differ is
[ADR 0006 rev 3](../../docs/decisions/0006-process-gates.md)'s: `fixup!`/`squash!`/merge subjects
never survive the squash, where the pull-request title *becomes* the commit on `main`.

**Tool, pinned as run:** `@commitlint/cli` 21.2.2 with `@commitlint/config-conventional` 21.2.2,
installed by pre-commit 4.6.2 from the `additional_dependencies` pins in
[`.pre-commit-config.yaml`](../../.pre-commit-config.yaml). The commit-message stage reads
[`.commitlintrc.json`](../../.commitlintrc.json); the pull-request-title stage reads
[`.commitlintrc-pr-title.json`](../../.commitlintrc-pr-title.json), which extends the same base
with `defaultIgnores` off. A case fails if the hook exits non-zero.

**Run a case** from the repository root, against the same hook definitions CI uses:

```sh
printf '%s\n' "<message>" > "$f"
scripts/.venv/bin/pre-commit run commitlint --hook-stage commit-msg --commit-msg-filename "$f"
COMMITLINT_TITLE_FILE="$f" scripts/.venv/bin/pre-commit run commitlint-pr-title --hook-stage manual
```

| Direction (retired check) | Input | commit-msg stage | PR-title stage |
|---|---|---|---|
| Must fail | `some plain prose` | fail (`type-empty`, `subject-empty`) | fail (same) |
| Must fail | `Fix: a thing` | fail (`type-case`, `type-enum`) | fail (same) |
| Must fail | `feat a thing` | fail (`type-empty`, `subject-empty`) | fail (same) |
| Must fail | `feat(): a thing` | **pass — gap, see note** | **pass — gap, see note** |
| Must fail | `feat(CI): a thing` | **pass — gap, see note** | **pass — gap, see note** |
| Must fail | `feat: ` | fail (`header-trim`, `subject-empty`) | fail (same) |
| Must fail | `feats: a thing` | fail (`type-enum`) | fail (same) |
| Must pass | `fix: a thing` | pass | pass |
| Must pass | `feat(ci): a thing` | pass | pass |
| Must pass | `feat(ci)!: a thing` | pass | pass |
| Must pass / must fail on the title | `fixup! feat: x` | pass (`defaultIgnores`) | fail (`type-empty`, `subject-empty`) |
| Must pass / must fail on the title | `squash! feat: x` | pass (`defaultIgnores`) | fail (same) |
| Must pass / must fail on the title | `Merge branch 'x'` | pass (`defaultIgnores`) | fail (same) |

The last three pairs are the ones that matter: the same string accepted at one stage and rejected at
the other, from one base configuration — the property the retired `--pr-title` flag carried.

Three notes the rows cannot carry alone:

- **Two must-fail rows are given up: empty scope and uppercase scope.** `config-conventional`
  carries no `scope-empty` or `scope-case` rule, so `feat(): x` and `feat(CI): x` pass both stages
  where the retired regex refused them. The defaults stand unconfigured
  (ADR 0016 rev 5: practice adapts to the tool, not the reverse); adding a `scope-case` rule to
  [`.commitlintrc.json`](../../.commitlintrc.json) is the one-line remedy if either gap proves
  worth closing.
- **Legal input the adopted tool rejects**, each measured: `fix: Sentence case subject` fails
  `subject-case`, `fix: a thing.` fails `subject-full-stop`, and a 105-character header fails
  `header-max-length` (100) — the tightening ADR 0016 rev 5 accepts, titles adapting rather than
  the tool being configured around them.
- **A misconfigured pull-request-title invocation fails closed:** the `commitlint-pr-title` hook
  run with `COMMITLINT_TITLE_FILE` unset exits non-zero rather than judging nothing and passing.
