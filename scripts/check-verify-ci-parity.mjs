#!/usr/bin/env node
// Checks SRS067: every check `just verify` depends on must also run in
// .github/workflows/checks.yml, and every named CI step must be either one of
// those checks or an enumerated CI-only exception (secret scanning; the
// PR-title Conventional-Commit check).
//
// No dependencies: Node stdlib only, plain text scanning (no YAML parser) —
// matches scripts/check-links.mjs's idiom.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const justfileText = readFileSync(resolve(repoRoot, "justfile"), "utf8");
const workflowText = readFileSync(resolve(repoRoot, ".github/workflows/checks.yml"), "utf8");

const fail = (msg) => {
  console.error(`check-verify-ci-parity: ${msg}`);
  process.exit(1);
};

// Each `just verify` check → a stable token proving the same work runs in CI
// (the script path or command it runs).
const CHECK_TOKENS = {
  "check-links": "scripts/check-links.mjs",
  "check-eol": "git grep -lIP '\\r$'",
  "check-branch": "scripts/check-branch.sh",
  "check-reqs": "doorstop --error-all",
  "check-arch": "scripts/splice-arch-diagrams.mjs",
  "check-site": "docs/site/doorstop_to_needs.py",
  "check-verify-ci-parity": "scripts/check-verify-ci-parity.mjs",
};

// CI steps with no local equivalent — exempted by name, not mapped from `just verify`.
const CI_ONLY_ALLOWLIST = [
  "gitleaks", // secret-scan job: needs full git history, not part of `just verify`
  "scripts/check-commit-msg.sh", // PR-title Conventional-Commit check: no PR title exists locally
];

const verifyLine = justfileText.match(/^verify:(.*)$/m);
if (!verifyLine) fail("no `verify:` recipe line found in justfile");
const verifyChecks = verifyLine[1].trim().split(/\s+/).filter(Boolean);

for (const check of verifyChecks) {
  if (!(check in CHECK_TOKENS)) {
    fail(`'${check}' is in the \`verify\` recipe but has no entry in CHECK_TOKENS — add one`);
  }
}
for (const check of Object.keys(CHECK_TOKENS)) {
  if (!verifyChecks.includes(check)) {
    fail(`CHECK_TOKENS has '${check}' but it is not a \`verify\` dependency — remove the stale entry`);
  }
}

for (const [check, token] of Object.entries(CHECK_TOKENS)) {
  if (!workflowText.includes(token)) {
    fail(`'${check}' (token '${token}') is in \`just verify\` but not found in .github/workflows/checks.yml`);
  }
}

// Enumerate CI steps: a step is a `- name: …`/`- uses: …` list item at the
// workflow's step indentation; everything up to the next such item is its
// body. An unnamed step (checkout, setup-node, …) is infra, not a check, and
// is skipped — as is a toolchain-install step (this file names every one
// "Install …"), which prepares a check rather than being one.
const stepChunks = workflowText.split(/\n(?=      - (?:name|uses): )/);
for (const chunk of stepChunks) {
  const nameMatch = chunk.match(/^ {6}- name: (.+)$/m);
  if (!nameMatch) continue;
  const stepName = nameMatch[1].trim();
  if (stepName.startsWith("Install ")) continue;
  const covered =
    Object.values(CHECK_TOKENS).some((token) => chunk.includes(token)) ||
    CI_ONLY_ALLOWLIST.some((token) => chunk.includes(token));
  if (!covered) {
    fail(
      `CI step '${stepName}' matches no \`just verify\` check and no CI-only allowlist entry — ` +
        `add it to one or the other`,
    );
  }
}

console.log(
  `verify ⊆ CI holds: ${verifyChecks.length} check(s) mapped, ${CI_ONLY_ALLOWLIST.length} CI-only exception(s) named.`,
);
