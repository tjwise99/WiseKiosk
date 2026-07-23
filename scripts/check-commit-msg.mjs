#!/usr/bin/env node
// The first line of a commit message must be a Conventional Commit (ADR 0006).
// The pattern is defined once in conventional-commit.regex, shared with the sh
// commit-msg hook. Default mode mirrors the hook's fixup!/squash!/merge
// allowances — they never survive the squash merge. --pr-title drops them for
// the CI gate on the PR title, which becomes the commit on main.
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

const conventional = new RegExp(
  readFileSync(new URL("conventional-commit.regex", import.meta.url), "utf8").trim(),
);
if (!conventional.test(first)) {
  fail(
    `'${first}' is not a Conventional Commit — expected type(scope)?: subject ` +
      `(pattern: scripts/conventional-commit.regex)`,
  );
}

console.log(`Conventional Commit: ${first}`);
