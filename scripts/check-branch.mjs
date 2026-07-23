#!/usr/bin/env node
// The branch name must follow type_number-snake_name (ADR 0006): type is the
// issue-template set, number resolves via the GitHub API to an open issue whose
// labels include the type. `main` and dependabot/** are exempt. When an open PR
// exists with the default branch as base, the PR's recorded closing references
// (closingIssuesReferences — GitHub records them only against the default
// branch) must include the branch's issue. Owner/repo come from the `origin`
// remote, so the check works on any clone. GITHUB_TOKEN or GH_TOKEN is used as
// a bearer token when present (rate limits, CI); GraphQL requires it.
//
// No dependencies: `git` for branch/remote discovery and Node's stdlib fetch.

import { execSync } from "node:child_process";

const fail = (msg) => {
  console.error(`check-branch: ${msg}`);
  process.exit(1);
};

const branch =
  process.argv[2] ?? execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();

if (branch === "main") {
  console.log("Branch 'main' is exempt: the mainline is not a work branch.");
  process.exit(0);
}
if (branch.startsWith("dependabot/")) {
  console.log(`Branch '${branch}' is exempt: Dependabot names its own branches.`);
  process.exit(0);
}

const shape = /^(task|bug|design|module)_([1-9][0-9]*)-[a-z0-9]+(?:_[a-z0-9]+)*$/;
const m = branch.match(shape);
if (!m) {
  fail(
    `branch '${branch}' does not match type_number-snake_name — ` +
      `type one of task|bug|design|module, number a GitHub issue number, ` +
      `name lowercase snake_case (e.g. task_27-process_gates)`,
  );
}
const [, type, number] = m;

const origin = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
const repoMatch = origin.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!repoMatch) fail(`cannot derive owner/repo from origin remote '${origin}'`);
const [, owner, repo] = repoMatch;

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "wisekiosk-check-branch" };
if (token) headers.Authorization = `Bearer ${token}`;

const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
const res = await fetch(url, { headers });
if (res.status === 404) fail(`issue #${number} does not exist in ${owner}/${repo}`);
if (!res.ok) fail(`GitHub API returned ${res.status} for ${url}`);
const issue = await res.json();

if (issue.pull_request) fail(`#${number} is a pull request, not an issue`);
if (issue.state !== "open") fail(`issue #${number} is ${issue.state}, not open`);
const labels = issue.labels.map((l) => l.name);
if (!labels.includes(type)) {
  fail(
    `issue #${number} is not labeled '${type}' (labels: ${labels.join(", ") || "none"}) — ` +
      `the branch type must match the ticket's template label`,
  );
}

console.log(`Branch '${branch}' links open issue #${number} ('${issue.title}', labeled '${type}').`);

let pr;
if (process.env.PR_NUMBER) {
  const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${process.env.PR_NUMBER}`;
  const prRes = await fetch(prUrl, { headers });
  if (!prRes.ok) fail(`GitHub API returned ${prRes.status} for ${prUrl}`);
  pr = await prRes.json();
} else {
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) fail(`GitHub API returned ${listRes.status} listing PRs for '${branch}'`);
  pr = (await listRes.json())[0];
}

if (!pr) {
  console.log(`No open PR for '${branch}': the linkage gate binds once a PR is open.`);
  process.exit(0);
}

const defaultBranch = pr.base.repo.default_branch;
if (pr.base.ref !== defaultBranch) {
  console.log(
    `PR #${pr.number} targets '${pr.base.ref}', not the default branch '${defaultBranch}': ` +
      `GitHub records closing references only against the default branch, so there is nothing ` +
      `to gate — the gate binds on retarget.`,
  );
  process.exit(0);
}

if (!token) {
  fail(
    `PR #${pr.number} requires the recorded-linkage check, which needs GraphQL auth — ` +
      `export GH_TOKEN; a silently skipped gate is a false pass`,
  );
}

const gqlRes = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: `query($owner:String!,$repo:String!,$number:Int!){
      repository(owner:$owner,name:$repo){pullRequest(number:$number){
        closingIssuesReferences(first:20){nodes{number}}}}}`,
    variables: { owner, repo, number: pr.number },
  }),
});
if (!gqlRes.ok) fail(`GitHub GraphQL returned ${gqlRes.status}`);
const gql = await gqlRes.json();
if (gql.errors) fail(`GitHub GraphQL errors: ${gql.errors.map((e) => e.message).join("; ")}`);
const linked = gql.data.repository.pullRequest.closingIssuesReferences.nodes.map((n) => n.number);
if (!linked.includes(Number(number))) {
  fail(
    `PR #${pr.number} has no recorded closing reference to issue #${number} — add ` +
      `'Closes #${number}' to the PR body or link the issue in the PR's Development section; ` +
      `the gate reads GitHub's recorded state, either works`,
  );
}

console.log(`PR #${pr.number} records a closing reference to issue #${number}.`);
