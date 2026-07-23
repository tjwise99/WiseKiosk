#!/usr/bin/env node
// The first line of a commit message must be a Conventional Commit (ADR 0006).
// Default mode (the commit-msg hook) additionally passes fixup!/squash! prefixes
// and merge messages — they never survive the squash merge. --pr-title drops
// those allowances for the CI gate on the PR title, which becomes the commit
// on main.
//
// No dependencies: Node stdlib only.

import { readFileSync } from "node:fs";

const fail = (msg) => {
  console.error(`check-commit-msg: ${msg}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const prTitle = args.includes("--pr-title");
const file = args.find((a) => a !== "--pr-title");
if (!file) fail("usage: check-commit-msg.mjs [--pr-title] <message-file>");

const first = readFileSync(file, "utf8").split("\n", 1)[0];

if (!prTitle && /^(fixup!|squash!|Merge )/.test(first)) {
  console.log(`Allowed (never reaches main): ${first}`);
  process.exit(0);
}

const conventional =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .+/;
if (!conventional.test(first)) {
  fail(
    `'${first}' is not a Conventional Commit — expected type(scope)?: subject, ` +
      `type one of feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`,
  );
}

console.log(`Conventional Commit: ${first}`);
