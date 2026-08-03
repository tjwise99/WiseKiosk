#!/usr/bin/env node
// Every check `just verify` depends on must also run in
// .github/workflows/checks.yml, and every named CI step must be either one of
// those checks or an enumerated CI-only exception (secret scanning; the
// PR-title Conventional-Commit check). See docs/CI.md § Gate wiring.
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

// Each `just verify` check → every token proving the same work runs in CI (the
// script path or command each of the recipe's commands runs). A recipe running
// more than one command lists one token per command (docs/CI.md § Gate wiring).
const CHECK_TOKENS = {
  "check-links": ["scripts/check-links.mjs"],
  "check-eol": ["git grep -lIP '\\r$'"],
  "check-branch": ["scripts/check-branch.sh"],
  "check-reqs": [
    "scripts/check-unreviewed.py",
    "scripts/check-suspect-links.py",
    "scripts/validate-tree.sh",
    "scripts/check-method-consistency.py",
    "scripts/check-text-citations.py",
    "scripts/check-headers.py",
  ],
  "check-citations": ["scripts/check-citations.py"],
  "check-arch": ["scripts/splice-arch-diagrams.mjs"],
  "check-site": ["docs/site/doorstop_to_needs.py"],
  "check-adr-index": ["scripts/check-adr-index.mjs"],
  "check-docs-index": ["scripts/check-docs-index.mjs"],
  "check-repo-silo": ["scripts/check-repo-silo.mjs"],
  "check-workflow-hardening": ["scripts/check-workflow-hardening.mjs"],
  "check-verify-ci-parity": ["scripts/check-verify-ci-parity.mjs"],
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

// Searched instead of the whole file: a token in a comment names no step that runs, and a token in
// a step's `name:` describes one rather than invoking it. Either would satisfy a plain text search
// while the step it stands for was deleted.
// YAML ends a line at an unquoted ` #`, so a token can outlive the step it names in a trailing
// comment. Only lines carrying no quote are stripped: a quoted '#' is content, and reading one as a
// comment would reject a legal workflow.
const stripTrailingComment = (line) => (/["']/.test(line) ? line : line.replace(/\s+#.*$/, ""));

const runningText = workflowText
  .split("\n")
  .filter((line) => !/^\s*#/.test(line) && !/^\s*- name:/.test(line))
  .map(stripTrailingComment)
  .join("\n");

for (const [check, tokens] of Object.entries(CHECK_TOKENS)) {
  for (const token of tokens) {
    if (!runningText.includes(token)) {
      fail(`'${check}' (token '${token}') is in \`just verify\` but no step in .github/workflows/checks.yml runs it`);
    }
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
  // Searched with the step's own `name:` removed, for the reason the forward loop excludes it: a
  // step named after a check is not a step running one.
  const body = chunk.split("\n").filter((line) => !/^\s*- name:/.test(line)).join("\n");
  const covered =
    Object.values(CHECK_TOKENS).flat().some((token) => body.includes(token)) ||
    CI_ONLY_ALLOWLIST.some((token) => body.includes(token));
  if (!covered) {
    fail(
      `CI step '${stepName}' matches no \`just verify\` check and no CI-only allowlist entry — ` +
        `add it to one or the other`,
    );
  }
}

console.log(
  `verify ⊆ CI holds: ${verifyChecks.length} recipe(s), ${Object.values(CHECK_TOKENS).flat().length} command(s) mapped, ${CI_ONLY_ALLOWLIST.length} CI-only exception(s) named.`,
);
