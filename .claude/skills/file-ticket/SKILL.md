---
name: file-ticket
description: >-
  File a WiseKiosk issue that conforms to the gates, from a session where the GitHub template picker
  does not exist. Carries the template-to-label-to-branch-type mapping, the required milestone, how
  ordering and epic membership are recorded, and the API traps that make each of those silently
  fail. Invoke before `gh issue create` — filing a ticket by hand produces one that cannot be
  branched on.
---

# File a ticket

`gh issue create --title … --body …` **bypasses the template picker entirely.** All four files in
[`.github/ISSUE_TEMPLATE/`](../../../.github/ISSUE_TEMPLATE/) apply to none of it: no type label, no
headings, no milestone. That is the root cause this skill exists for, and it is not hypothetical —
ten of sixteen open tickets were unbranchable on 2026-07-24, and the identical defect recurred four
days later.

**This skill is advisory.** Nothing forces its use, and a session that does not invoke it is not
stopped by it. The half with teeth is `scripts/check-branch.sh`, which refuses the merge later —
so a ticket filed wrong is not lost, only expensive. What follows is how to not pay that.

## What the gate will demand

From [`docs/CI.md` § *Repository shape*](../../../docs/CI.md#repository-shape) and
[ADR 0013](../../../docs/decisions/0013-work-tracking-invariants.md), decided against the ticket
whose branch is being cut:

- **open** — it cannot be closed when the branch is worked;
- **exactly one type label** from `task`, `bug`, `design`, `module` — a second makes the branch type
  ambiguous. Non-type labels (`documentation`) are free;
- **a milestone**;
- **a parent iff the work targets an integration branch** — see *Epic membership* below.

## Type, template and branch are one choice

Picking the type picks the template and the branch prefix. They cannot diverge; a branch's type names
the template its ticket was opened from ([ADR 0006](../../../docs/decisions/0006-process-gates.md)).

| Type | Template | Labels the picker would apply | Branch |
|---|---|---|---|
| `task` | [`task.md`](../../../.github/ISSUE_TEMPLATE/task.md) | `task` | `task_<n>-…` |
| `bug` | [`bug_report.md`](../../../.github/ISSUE_TEMPLATE/bug_report.md) | `bug` | `bug_<n>-…` |
| `design` | [`design_decision.md`](../../../.github/ISSUE_TEMPLATE/design_decision.md) | `design`, `documentation` | `design_<n>-…` |
| `module` | [`new_module.md`](../../../.github/ISSUE_TEMPLATE/new_module.md) | `module` | `module_<n>-…` |

Read the labels from the template's own `labels:` frontmatter rather than this table if the two
disagree — the template is what the picker obeys.

## Filing

Body from the template file, YAML frontmatter stripped, then filled in. Say in the body that it was
filed this way, as the templates' own tickets do: *"Filed via `gh`, which bypasses the template
picker; body follows `.github/ISSUE_TEMPLATE/<file>`."*

```sh
sed '1{/^---$/!q}; 1,/^---$/d' .github/ISSUE_TEMPLATE/task.md > /tmp/body.md   # then edit
gh issue create --title "…" --body-file /tmp/body.md --label task --milestone 1
```

`--milestone` takes the number or the title; the titles carry a `·` (`1 · Requirements complete`), so
the number is less error-prone. `gh milestone list` does not exist — read them with
`gh api repos/tjwise99/WiseKiosk/milestones --jq '.[]|"\(.number) \(.title)"'`.

**A label the repository does not have is silently dropped**, by `--label` and by a template's
frontmatter alike. That is how `new_module.md` produced unlabeled tickets for as long as the `module`
label was missing. After filing, read the labels back rather than trusting the exit code.

## Ordering, and epic membership

**Ordering goes in GitHub's native dependency edges, never in the body.** No `⛔ Blocked by:` line:
it mirrors the edges and drifts from them — four of eight such lines had already gone stale when they
were stripped. Ready-to-work is the derived `-is:blocked` view.

**A sub-issue means a shared merge target, not a topic.** Make the new ticket a sub-issue **iff** its
pull request will target an integration branch rather than `main`; the parent is the ticket anchoring
that branch. Everything else that merely relates is grouped by the milestone. The gate asserts this
in both directions, so a sub-issue whose PR targets `main` fails just as a PR into an integration
branch from a non-member does.

The sub-issues endpoint takes the parent's **issue number** in the path but the child's **database
`id`** in the body — not its number. Passing the number silently attaches the wrong issue or 404s:

```sh
child=$(gh api repos/tjwise99/WiseKiosk/issues/<child-number> --jq .id)
gh api repos/tjwise99/WiseKiosk/issues/<parent-number>/sub_issues -f sub_issue_id=$child
```

## In the body

- **Never a bare `#N`, and never a number as a name.** Issues and PRs share one counter, so `#66` and
  `#69` are indistinguishable by shape. Write `PR #66` for a pull request and `#69 tree rebuild` —
  number *and* name — for a ticket. The same holds for requirement identifiers: `SRS026
  backend-unreachable state`, never bare, because a renumber rewrites `links:` and leaves prose
  pointing at whatever now occupies the number.
- **Every relative link must resolve inside the repository** — issue bodies are not checked by
  `just check-links`, so a `../blob/main/…` link is on you.
- State what authorizes the work and what is already decided, so the ticket does not re-litigate
  settled ground when it is finally worked.
