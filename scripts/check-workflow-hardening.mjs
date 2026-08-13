#!/usr/bin/env node
// Every action a workflow uses is pinned to an immutable reference and says which version that is,
// and no workflow grants GITHUB_TOKEN a write permission at the top level. A line this script cannot
// read is a failure rather than a skip. See docs/CI.md § Action pins and workflow privilege.
//
// No dependencies: Node stdlib only, plain text scanning (no YAML parser) — matches
// scripts/check-repo-silo.mjs's idiom.
//
// What this has been run against, in both directions: cases/check-workflow-hardening-mjs.md

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
// `uses:` as a mapping key: at the head of a block entry, or inside a flow mapping. Both anchored —
// an unanchored match reads `uses:` out of any string that happens to contain it.
const USES = /^\s*(?:-\s*)?uses:\s*(.*)$/;
const FLOW_USES = /[{,]\s*uses:\s*([^,}]+)/g;
// Keys whose value is free text. A `uses:` inside one names no action.
const PROSE = /^\s*(?:-\s*)?(?:run|name|if|shell|working-directory):/;
// A block scalar's content is indented under its key and is free text throughout.
const SCALAR = /^\s*(?:-\s*)?[\w-]+:\s*[|>][-+\d]*\s*(?:#.*)?$/;
// The key's own column. A block entry's dash sits left of it, and the entry's remaining keys align
// with the key rather than with the dash.
const KEY_COLUMN = /^\s*(?:-\s*)?/;
// A line whose value opens a flow collection. `uses:` inside any other value is text, and reading a
// flow line needs no view of where its strings begin and end. A `uses:` written inside a string on
// such a line is read as a reference, and fails as unpinned rather than passing unseen.
const FLOW_START = /^\s*(?:-\s*)?(?:[\w-]+:\s*)?[[{]/;
// A top-level block opens at column zero; a job's own block is indented and may elevate.
const TOP_LEVEL_PERMISSIONS = /^permissions:[^\S\n]*(\S.*)?$/;
const GRANT = /^["']?([\w-]+)["']?:\s*(\S+)$/;

const uncomment = (text) => text.replace(/\s+#.*$/, "").trim();
const unquote = (text) => text.replace(/^(['"])(.*)\1$/, "$2").trim();
const version = (line) => line.match(/\s#\s*(\S.*?)\s*$/)?.[1] ?? "";

let references = 0;

for (const path of workflows) {
  const lines = readFileSync(resolve(repoRoot, path), "utf8").split("\n");

  let scalar = null;
  for (const [index, line] of lines.entries()) {
    if (scalar !== null) {
      if (line.trim() === "" || line.search(/\S/) > scalar) continue;
      scalar = null;
    }
    if (/^\s*#/.test(line)) continue;
    if (SCALAR.test(line)) {
      scalar = KEY_COLUMN.exec(line)[0].length;
      continue;
    }
    if (PROSE.test(line)) continue;

    const where = `${path}:${index + 1}`;
    const text = uncomment(line);
    const block = USES.exec(text);
    // A flow mapping can carry several steps on one line, so every `uses:` in it is read.
    const flow = FLOW_START.test(text);
    const found = block ? [block[1]] : flow ? [...text.matchAll(FLOW_USES)].map((m) => m[1]) : [];
    if (found.length === 0) {
      // Read from the line rather than from `text`: a '#' inside a quoted value truncates `text`,
      // and the reference it hides must still be reported rather than passing as absent.
      if (flow && /\buses:/.test(line)) {
        problems.push(`${where} declares 'uses:' in a layout this script cannot read: '${line.trim()}'`);
      }
      continue;
    }

    for (const reference of found) {
      references += 1;
      const action = unquote(reference.trim());
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
          `${where} pins '${action}' but names no version — the comment is the only thing that ` +
            `tells a reader what the SHA is`,
        );
      }
    }
  }

  const opening = lines.findIndex((line) => TOP_LEVEL_PERMISSIONS.test(line));
  if (opening === -1) {
    problems.push(`${path} declares no top-level 'permissions:', so it inherits the repository default`);
    continue;
  }

  let declared = uncomment(TOP_LEVEL_PERMISSIONS.exec(lines[opening])[1] ?? "");
  // A flow mapping may close on a later line.
  for (let at = opening + 1; declared.startsWith("{") && !declared.endsWith("}"); at += 1) {
    if (at >= lines.length) break;
    declared += " " + uncomment(lines[at]);
  }
  if (declared === "read-all") continue;

  const grants = [];
  if (declared.startsWith("{")) {
    const pairs = declared.replace(/^\{/, "").replace(/\}$/, "").trim();
    // An empty flow mapping grants nothing, which is the most restricted a workflow can be.
    if (pairs === "") continue;
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

  if (grants.length === 0) {
    problems.push(`${path}:${opening + 1} declares 'permissions:' with nothing under it`);
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
