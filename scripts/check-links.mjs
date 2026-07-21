#!/usr/bin/env node
// Every relative Markdown link in every tracked .md file must resolve to a file
// inside this repository. Enforces the "docs are standalone — no reference points
// outside this repo" invariant. Exits non-zero on the first broken or escaping link.
//
// No dependencies: uses `git ls-files` for the tracked-file list and Node's stdlib.

import { execSync } from "node:child_process";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const repoRoot = realpathSync(
  execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim(),
);

const mdFiles = execSync("git ls-files '*.md'", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const linkRe = /\]\(([^)]+)\)/g;
const problems = [];

for (const file of mdFiles) {
  const abs = resolve(repoRoot, file);
  const text = readFileSync(abs, "utf8");
  for (const match of text.matchAll(linkRe)) {
    const raw = match[1].trim().split("#")[0]; // drop anchor
    if (!raw) continue; // pure in-page anchor
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // scheme: http(s), mailto, etc.
    const target = resolve(dirname(abs), raw);
    const rel = relative(repoRoot, target);
    if (rel.startsWith("..")) {
      problems.push(`${file}  ->  ${raw}   (escapes the repository)`);
    } else if (!existsSync(target)) {
      problems.push(`${file}  ->  ${raw}   (does not exist)`);
    }
  }
}

if (problems.length) {
  console.error(`Broken or escaping Markdown links (${problems.length}):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`All Markdown links resolve inside the repo (${mdFiles.length} files checked).`);
