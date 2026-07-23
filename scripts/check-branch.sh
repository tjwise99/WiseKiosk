#!/bin/sh
# The branch name must follow type_number-snake_name (ADR 0006): the shape is
# defined once in scripts/branch-shape.regex, shared with the pre-push hook;
# the number resolves via the GitHub API to an open issue whose labels include
# the type. main and dependabot/* are exempt. When an open PR exists with the
# default branch as base, the PR's recorded closing references
# (closingIssuesReferences — GitHub records them only against the default
# branch) must include the branch's issue. Owner/repo come from the origin
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
if [ "$base_ref" != "$default_branch" ]; then
    echo "PR #$pr_number targets '$base_ref', not the default branch '$default_branch': GitHub records closing references only against the default branch, so there is nothing to gate — the gate binds on retarget."
    exit 0
fi

[ -n "$token" ] || fail "PR #$pr_number requires the recorded-linkage check, which needs GraphQL auth — export GH_TOKEN; a silently skipped gate is a false pass"

query='query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:20){nodes{number}}}}}'
payload=$(jq -n --arg q "$query" --arg owner "$owner" --arg repo "$repo" --argjson number "$pr_number" \
    '{query: $q, variables: {owner: $owner, repo: $repo, number: $number}}')
status=$(api -o "$tmp" -w '%{http_code}' -X POST -d "$payload" https://api.github.com/graphql)
[ "$status" = "200" ] || fail "GitHub GraphQL returned $status"
if jq -e 'has("errors")' "$tmp" >/dev/null; then
    fail "GitHub GraphQL errors: $(jq -r '[.errors[].message] | join("; ")' "$tmp")"
fi
if ! jq -e --argjson n "$number" '.data.repository.pullRequest.closingIssuesReferences.nodes | any(.number == $n)' "$tmp" >/dev/null; then
    fail "PR #$pr_number's Development field does not link issue #$number — link it there (a 'Closes #$number' body keyword writes the same record); the gate reads GitHub's recorded state"
fi
echo "PR #$pr_number records a closing reference to issue #$number."
