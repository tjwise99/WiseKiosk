#!/usr/bin/env node
// Every action a workflow uses is pinned to an immutable reference and says which version that is,
// and no workflow grants GITHUB_TOKEN a write permission at the top level. A line this script cannot
// read is a failure rather than a skip. See docs/CI.md § Action pins and workflow privilege.
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

// Asserted before the scan: a discovery returning nothing finds no violations and reports success.
// See docs/CI.md § Action pins and workflow privilege.
if (workflows.length === 0) {
  console.error("check-workflow-hardening: no workflow file discovered under .github/workflows");
  process.exit(1);
}

const SHA = /@[0-9a-f]{40}$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/;
// `uses:` as a mapping key — at the head of a block entry, or inside a flow mapping.
const USES = /(?:^|[-{,])\s*uses:\s*(.*)$/;
// A top-level block opens at column zero; a job's own block is indented and may elevate.
const TOP_LEVEL_PERMISSIONS = /^permissions:[^\S\n]*(\S.*)?$/;
const GRANT = /^([\w-]+):\s*(\S+)$/;

const uncomment = (text) => text.replace(/\s+#.*$/, "").trim();
const unquote = (text) => text.replace(/^(['"])(.*)\1$/, "$2").trim();
const version = (line) => line.match(/\s#\s*(\S.*?)\s*$/)?.[1] ?? "";

let references = 0;

for (const path of workflows) {
  const lines = readFileSync(resolve(repoRoot, path), "utf8").split("\n");

  for (const [index, line] of lines.entries()) {
    if (/^\s*#/.test(line)) continue;
    const key = USES.exec(line);
    if (!key) continue;
    references += 1;
    const where = `${path}:${index + 1}`;
    // A flow mapping continues past the value, so the reference ends at the first ',' or '}'.
    const action = unquote(uncomment(key[1]).split(/[,}]/)[0].trim());
    if (!action) {
      problems.push(`${where} declares 'uses:' with no value this script can read`);
      continue;
    }
    // A repository-local action or reusable workflow has no upstream to pin — docs/CI.md § Action
    // pins and workflow privilege.
    if (action.startsWith("./")) continue;
    if (action.startsWith("docker://")) {
      if (!DIGEST.test(action)) {
        problems.push(`${where} uses '${action}', which is not pinned to an image digest`);
      }
      continue;
    }
    if (!SHA.test(action)) {
      problems.push(`${where} uses '${action}', which is not pinned to a commit SHA`);
    } else if (!version(line)) {
      problems.push(
        `${where} pins '${action}' but names no version — the comment is the only thing that tells ` +
          `a reader what the SHA is`,
      );
    }
  }

  const opening = lines.findIndex((line) => TOP_LEVEL_PERMISSIONS.test(line));
  if (opening === -1) {
    problems.push(`${path} declares no top-level 'permissions:', so it inherits the repository default`);
    continue;
  }

  const declared = uncomment(TOP_LEVEL_PERMISSIONS.exec(lines[opening])[1] ?? "");
  if (declared === "read-all" || declared === "{}") continue;

  const grants = [];
  if (declared.startsWith("{")) {
    // A flow mapping holds the whole block on the opening line.
    const pairs = declared.replace(/^\{/, "").replace(/\}$/, "");
    for (const pair of pairs.split(",")) grants.push([`${path}:${opening + 1}`, pair]);
  } else if (declared) {
    problems.push(`${path}:${opening + 1} grants '${declared}' at the top level; use read-all or {}`);
    continue;
  } else {
    let indent = null;
    for (const [offset, line] of lines.slice(opening + 1).entries()) {
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      const depth = line.search(/\S/);
      // A grant is indented under the key, so column zero is the next top-level key, and anything
      // shallower than the first grant has dedented out of the block.
      if (depth === 0 || (indent !== null && depth < indent)) break;
      indent ??= depth;
      grants.push([`${path}:${opening + offset + 2}`, line]);
    }
  }

  for (const [where, text] of grants) {
    const grant = GRANT.exec(uncomment(text));
    // Breaking out here instead would leave every grant below the unreadable line unread.
    if (!grant) {
      problems.push(`${where} sits in the top-level 'permissions:' block and cannot be read: '${text.trim()}'`);
      continue;
    }
    const [, scope, level] = grant;
    if (unquote(level) !== "read" && unquote(level) !== "none") {
      problems.push(
        `${where} grants '${scope}: ${level}' at the top level, where it reaches every job — ` +
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
