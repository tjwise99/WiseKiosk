#!/bin/sh
# The branch name must follow type_number-snake_name (ADR 0006): the shape is
# defined once in scripts/branch-shape.regex, shared with the pre-push hook;
# the number resolves via the GitHub API to an open issue carrying a milestone
# and exactly one type label, which is the branch type (ADR 0013). main and
# dependabot/* are exempt. When an open PR exists, its Development field
# (closingIssuesReferences) must link the branch's issue — any base; body
# keywords only write the record against the default branch, so other bases
# need the manual link. The PR's base and the issue's parent must agree: a
# sub-issue means a shared merge target. Owner/repo come from the origin
# remote, so the check works on any clone. GITHUB_TOKEN or GH_TOKEN is used as
# a bearer token when set (rate limits, CI); the GraphQL phase requires it.
#
# Dependencies: git, grep, sed, curl, jq.
set -eu

fail() {
    echo "check-branch: $1" >&2
    exit 1
}

if [ $# -ge 1 ]; then
    branch=$1
else
    branch=$(git symbolic-ref --short -q HEAD) || fail "detached HEAD and no branch argument"
fi

case "$branch" in
    main)
        echo "Branch 'main' is exempt: the mainline is not a work branch."
        exit 0 ;;
    dependabot/*)
        echo "Branch '$branch' is exempt: Dependabot names its own branches."
        exit 0 ;;
esac

scripts_dir=$(dirname "$0")
if ! printf '%s' "$branch" | grep -Eqf "$scripts_dir/branch-shape.regex"; then
    fail "branch '$branch' does not match type_number-snake_name — type one of task|bug|design|module, number a GitHub issue number, name lowercase snake_case (e.g. task_27-process_gates; pattern: scripts/branch-shape.regex)"
fi
type=${branch%%_*}
rest=${branch#*_}
number=${rest%%-*}

origin=$(git remote get-url origin)
slug=$(printf '%s\n' "$origin" | sed -nE 's#.*github\.com[:/]([^/]+/[^/]+)$#\1#p')
slug=${slug%.git}
owner=${slug%%/*}
repo=${slug#*/}
{ [ -n "$owner" ] && [ -n "$repo" ]; } || fail "cannot derive owner/repo from origin remote '$origin'"

token=${GITHUB_TOKEN:-${GH_TOKEN:-}}
api() {
    if [ -n "$token" ]; then
        curl -sS -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $token" "$@"
    else
        curl -sS -H "Accept: application/vnd.github+json" "$@"
    fi
}

api_base="https://api.github.com/repos/$owner/$repo"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

status=$(api -o "$tmp" -w '%{http_code}' "$api_base/issues/$number")
[ "$status" != "404" ] || fail "issue #$number does not exist in $owner/$repo"
[ "$status" = "200" ] || fail "GitHub API returned $status for $api_base/issues/$number"

if jq -e 'has("pull_request")' "$tmp" >/dev/null; then
    fail "#$number is a pull request, not an issue"
fi
state=$(jq -r .state "$tmp")
[ "$state" = "open" ] || fail "issue #$number is $state, not open"
if ! jq -e --arg t "$type" '.labels | map(.name) | any(. == $t)' "$tmp" >/dev/null; then
    labels=$(jq -r '[.labels[].name] | join(", ")' "$tmp")
    fail "issue #$number is not labeled '$type' (labels: ${labels:-none}) — the branch type must match the ticket's template label"
fi

types=$(sed -nE 's/^\^\(([^)]+)\)_.*$/\1/p' "$scripts_dir/branch-shape.regex")
[ -n "$types" ] || fail "cannot read the branch type set from scripts/branch-shape.regex"
type_labels=$(jq -r --arg types "$types" '($types | split("|")) as $set | [.labels[].name | select(IN($set[]))] | join(", ")' "$tmp")
type_count=$(jq --arg types "$types" '($types | split("|")) as $set | [.labels[].name | select(IN($set[]))] | length' "$tmp")
[ "$type_count" = "1" ] || fail "issue #$number carries $type_count type labels (${type_labels:-none}) — exactly one of $types names the template it was opened from, and a second makes the branch type ambiguous"
jq -e '.milestone != null' "$tmp" >/dev/null || fail "issue #$number has no milestone — the milestone is this repo's phase axis, and a ticket outside it is absent from the definition of done it belongs to"

title=$(jq -r .title "$tmp")
echo "Branch '$branch' links open issue #$number ('$title', labeled '$type')."

if [ -n "${PR_NUMBER:-}" ]; then
    status=$(api -o "$tmp" -w '%{http_code}' "$api_base/pulls/$PR_NUMBER")
    [ "$status" = "200" ] || fail "GitHub API returned $status for $api_base/pulls/$PR_NUMBER"
else
    status=$(api -o "$tmp" -w '%{http_code}' "$api_base/pulls?head=$owner:$branch&state=open")
    [ "$status" = "200" ] || fail "GitHub API returned $status listing PRs for '$branch'"
    first_pr=$(jq '.[0]' "$tmp")
    printf '%s\n' "$first_pr" > "$tmp"
fi

if jq -e '. == null' "$tmp" >/dev/null; then
    echo "No open PR for '$branch': the linkage gate binds once a PR is open."
    exit 0
fi

pr_number=$(jq -r .number "$tmp")
base_ref=$(jq -r .base.ref "$tmp")
default_branch=$(jq -r .base.repo.default_branch "$tmp")

[ -n "$token" ] || fail "PR #$pr_number requires the recorded-linkage check, which needs GraphQL auth — export GH_TOKEN; a silently skipped gate is a false pass"

query='query($owner:String!,$repo:String!,$number:Int!,$issue:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:20){nodes{number}}} issue(number:$issue){parent{number}}}}'
payload=$(jq -n --arg q "$query" --arg owner "$owner" --arg repo "$repo" --argjson number "$pr_number" --argjson issue "$number" \
    '{query: $q, variables: {owner: $owner, repo: $repo, number: $number, issue: $issue}}')
status=$(api -o "$tmp" -w '%{http_code}' -X POST -d "$payload" https://api.github.com/graphql)
[ "$status" = "200" ] || fail "GitHub GraphQL returned $status"
if jq -e 'has("errors")' "$tmp" >/dev/null; then
    fail "GitHub GraphQL errors: $(jq -r '[.errors[].message] | join("; ")' "$tmp")"
fi
if ! jq -e --argjson n "$number" '.data.repository.pullRequest.closingIssuesReferences.nodes | any(.number == $n)' "$tmp" >/dev/null; then
    hint="link it there (a 'Closes #$number' body keyword writes the same record)"
    if [ "$base_ref" != "$default_branch" ]; then
        hint="link it there manually — body keywords record nothing against base '$base_ref'"
    fi
    fail "PR #$pr_number's Development field does not link issue #$number — $hint; the gate reads GitHub's recorded state"
fi
echo "PR #$pr_number records a closing reference to issue #$number."

parent=$(jq -r '.data.repository.issue.parent.number // ""' "$tmp")
if [ "$base_ref" = "$default_branch" ]; then
    [ -z "$parent" ] || fail "issue #$number is a sub-issue of #$parent, but PR #$pr_number targets the default branch — sub-issue membership means a shared merge target, not topical grouping; the milestone is what groups (ADR 0013)"
    echo "Issue #$number has no parent, and PR #$pr_number targets the default branch."
else
    printf '%s' "$base_ref" | grep -Eqf "$scripts_dir/branch-shape.regex" ||
        fail "PR #$pr_number's base '$base_ref' is neither the default branch nor a conforming integration branch — an integration branch is a branch, so it links a ticket of its own (ADR 0006)"
    anchor_rest=${base_ref#*_}
    anchor=${anchor_rest%%-*}
    [ -n "$parent" ] || fail "PR #$pr_number targets integration branch '$base_ref' but issue #$number has no parent — a ticket whose PR targets an integration branch is a sub-issue of that branch's anchor #$anchor (ADR 0013)"
    [ "$parent" = "$anchor" ] || fail "issue #$number is a sub-issue of #$parent, but PR #$pr_number targets '$base_ref', which is anchored at #$anchor — membership tracks the merge target"
    echo "Issue #$number is a sub-issue of #$anchor, which anchors base branch '$base_ref'."
fi
