# `check-workflow-hardening.mjs`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

| Direction | Case | Input |
|---|---|---|
| Must fail | Unpinned action | `uses: actions/checkout@v7` |
| Must fail | Expression as the reference | `uses: ${{ env.ACTION }}` |
| Must fail | Pinned, no version comment | a 40-hex SHA with the trailing `# vN` removed |
| Must fail | Container action on a tag | `uses: docker://alpine:3.19` |
| Must fail | Reference the parser cannot read | `uses:` with its value on the following line |
| Must fail | Flow-mapping step, unpinned | `- {uses: actions/checkout@v4, with: {x: 1}}` |
| Must fail | Second reference on a flow line | `steps: [{uses: …@<sha>}, {uses: …@v4}]` |
| Must fail | Quoted flow reference, unpinned | `steps: [{uses: "actions/checkout@v4"}]` |
| Must fail | Reference hidden by an apostrophe | `- {msg: don't, uses: …@v4, other: 'x'}` |
| Must fail | Reference hidden by a quoted `#` | `- {args: "a # b", uses: …@v4}` |
| Must fail | Unpinned action after a block scalar ends | a `run: \|` step, then `- uses: actions/checkout@v4` |
| Must fail | Unpinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@v4` |
| Must fail | Write grant carrying a comment | `contents: write # seeded`, with a second grant below |
| Must fail | Quoted write level | `contents: 'write'` |
| Must fail | Blanket write | `permissions: write-all` |
| Must fail | Flow mapping granting write | `permissions: {contents: read, actions: write}` |
| Must fail | Multi-line flow mapping granting write | the same across three lines |
| Must fail | Unreadable line inside the block | a line under `permissions:` that is not a grant |
| Must fail | No top-level block | the workflow declares none |
| Must fail | Block with nothing under it | `permissions:` followed by the next top-level key |
| Must fail | No workflow discovered | a repository with no file under `.github/workflows` |
| Must pass | SHA pin | `uses: actions/checkout@<sha> # v7.0.1` |
| Must pass | Quoted SHA pin | the same with the reference in double quotes |
| Must pass | Digest-pinned container action | `uses: docker://alpine@sha256:<64 hex>` |
| Must pass | Repository-local action | `uses: ./.github/actions/local` |
| Must pass | Flow-mapping step, pinned | `- {uses: …@<sha>, with: {x: 1}} # v7.0.1` |
| Must pass | Apostrophe beside a pinned flow reference | `- {msg: don't, uses: …@<sha>, other: 'x'} # v7.0.1` |
| Must pass | No action at all | a job whose only step is `run:` |
| Must pass | Workflow fixture inside a heredoc | a `run: \|` body containing `- uses: actions/checkout@v4` |
| Must pass | Comment on the block-scalar header | `run: \| # materialise a fixture` above the same body |
| Must pass | Pinned action behind a dash-line scalar | `- if: >-` on the dash line, then `uses: …@<sha> # vN` |
| Must pass | `uses:` named in an echoed string | `run: echo "pin it as - uses: owner/action@sha"` |
| Must pass | `uses:` named in a trailing comment | `run: node x.mjs # rewrites each - uses: line` |
| Must pass | `uses:` inside a `with:` value | `command: build - uses: cache` |
| Must pass | `uses:` inside an `env:` value | `NOTE: "a, uses: b"` |
| Must pass | Read-all with a trailing comment | `permissions: read-all # least privilege` |
| Must pass | Empty flow mapping | `permissions: {}` and `permissions: { }` |
| Must pass | Flow mapping, all read | one line and across several |
| Must pass | Quoted scope key | `"contents": read` |
| Must pass | Quoted read levels | `contents: 'read'`, `actions: "none"` |
| Must pass | Comment inside the block | a comment line between `permissions:` and its grants |
| Must pass | Job-level elevation | `pages: write` and `id-token: write` in a job's own block |
| Must pass | Block placed after `jobs:` | the top-level block declared below the jobs it governs |

**Known rejections.** Legal YAML this rejects, each failing loudly by file and line, each needing a
spelling this repository does not use. Closing them means another cut at the matcher and every
previous cut introduced a defect.

| Input | What happens |
|---|---|
| `env: {A: 1} # see the uses: rule` | reported as a layout the check cannot read |
| `- {name: "uses: nothing", run: echo hi}` | the same: a flow step is not skipped as free text |
| `env: {NOTE: "a, uses: b"}` | read as a reference, and fails as unpinned |

The third is the flow spelling of a value the table passes in block form; only inside a flow mapping
is the string read as a reference.
