#!/usr/bin/env node
// The branch name must follow type_number-snake_name (ADR 0006): type is the
// issue-template set, number resolves via the GitHub API to an open issue whose
// labels include the type. `main` and dependabot/** are exempt. Owner/repo come
// from the `origin` remote, so the check works on any clone. GITHUB_TOKEN is
// used as a bearer token when present (rate limits, CI); plain fetch otherwise.
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

const headers = { Accept: "application/vnd.github+json", "User-Agent": "wisekiosk-check-branch" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

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
