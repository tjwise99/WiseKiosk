#!/usr/bin/env node
// Every action a workflow uses is pinned to a commit SHA and says which version that is, and no
// workflow grants GITHUB_TOKEN a write permission at the top level. See docs/CI.md § Action pins and
// workflow privilege.
//
// No dependencies: Node stdlib only, plain text scanning (no YAML parser) — matches
// scripts/check-repo-silo.mjs's idiom.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

const problems = [];

const workflows = execSync("git ls-files .github/workflows", { encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.ya?ml$/.test(path));

// A discovery that returns nothing finds no violations and reports success, which is the shape of a
// check that has stopped checking. Nothing else here can tell the two apart.
if (workflows.length === 0) {
  console.error("check-workflow-hardening: no workflow file discovered under .github/workflows");
  process.exit(1);
}

const PINNED = /@[0-9a-f]{40}$/;
// `uses:` and its value, and any comment trailing it. A reusable-workflow `uses:` at job level takes
// the same forms as a step's.
const USES = /^\s*(?:-\s*)?uses:\s*(\S+)\s*(?:#\s*(.*?)\s*)?$/;
// A top-level block opens at column zero; a job's own block is indented and may elevate.
const TOP_LEVEL_PERMISSIONS = /^permissions:[^\S\n]*(\S.*)?$/;
const GRANT = /^\s+([\w-]+):\s*"?([\w-]+)"?\s*$/;

let references = 0;

for (const path of workflows) {
  const lines = readFileSync(resolve(repoRoot, path), "utf8").split("\n");

  for (const [index, line] of lines.entries()) {
    const match = USES.exec(line);
    if (!match) continue;
    const [, action, comment] = match;
    references += 1;
    // A repository-local action or reusable workflow moves with the commit that calls it, so there
    // is no upstream to pin and nothing a SHA would add.
    if (action.startsWith("./")) continue;
    if (!PINNED.test(action)) {
      problems.push(`${path}:${index + 1} uses '${action}', which is not pinned to a commit SHA`);
    } else if (!comment) {
      problems.push(
        `${path}:${index + 1} pins '${action}' but names no version — the comment is the only thing ` +
          `that tells a reader what the SHA is`,
      );
    }
  }

  const opening = lines.findIndex((line) => TOP_LEVEL_PERMISSIONS.test(line));
  if (opening === -1) {
    problems.push(`${path} declares no top-level 'permissions:', so it inherits the repository default`);
    continue;
  }

  const inline = TOP_LEVEL_PERMISSIONS.exec(lines[opening])[1];
  if (inline) {
    if (inline !== "{}" && inline !== "read-all") {
      problems.push(`${path}:${opening + 1} grants '${inline}' at the top level; use read-all or {}`);
    }
    continue;
  }

  for (const line of lines.slice(opening + 1)) {
    // A blank or comment line inside the block ends nothing; stopping on one would leave every
    // grant below it unread while the scan reported success.
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const grant = GRANT.exec(line);
    if (!grant) break; // dedented out of the block: the next top-level key
    const [, scope, level] = grant;
    if (level !== "read" && level !== "none") {
      problems.push(
        `${path} grants '${scope}: ${level}' at the top level, where it reaches every job — ` +
          `elevate in the job that needs it`,
      );
    }
  }
}

if (problems.length) {
  console.error(`check-workflow-hardening: workflows are not hardened (${problems.length}):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(
  `${workflows.length} workflow(s) grant no write by default; ${references} action reference(s) pinned.`,
);
