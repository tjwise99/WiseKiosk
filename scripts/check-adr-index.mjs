#!/usr/bin/env node
// The docs/decisions/ directory and its index table agree: every ADR file has a
// row, every row resolves to a real file, and numbering is contiguous from 0001
// with no duplicates. See docs/CI.md § Documentation integrity.
//
// No dependencies: Node stdlib only, plain text scanning — matches
// scripts/check-links.mjs's idiom.
//
// What this has been run against, in both directions: cases/check-adr-index-mjs.md

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const decisionsDir = resolve(repoRoot, "docs/decisions");

const problems = [];

const files = new Map();
for (const name of readdirSync(decisionsDir).sort()) {
  if (name === "README.md" || name === "TEMPLATE.md" || !name.endsWith(".md")) continue;
  const match = name.match(/^(\d{4})-.+\.md$/);
  if (!match) {
    problems.push(`docs/decisions/${name} is not named NNNN-<slug>.md`);
    continue;
  }
  // readdirSync reports names, not what they are: a directory or a dangling symlink named
  // NNNN-<slug>.md otherwise counts as an ADR on the strength of its name alone.
  if (!statSync(resolve(decisionsDir, name), { throwIfNoEntry: false })?.isFile()) {
    problems.push(`docs/decisions/${name} is not a readable file`);
    continue;
  }
  if (files.has(match[1])) {
    problems.push(`number ${match[1]} is carried by two files: ${files.get(match[1])}, ${name}`);
  } else {
    files.set(match[1], name);
  }
}

const indexText = readFileSync(resolve(decisionsDir, "README.md"), "utf8");

// A destination may be angle-bracketed, carry a title, lead with ./ or end in an anchor; none of
// that is part of the filename the row is claiming.
const destination = (value) => {
  let raw = value.trim();
  const titled = raw.match(/^(\S+)\s+["'(]/);
  if (titled) raw = titled[1];
  if (raw.startsWith("<") && raw.endsWith(">")) raw = raw.slice(1, -1);
  return raw.split("#")[0].replace(/^\.\//, "");
};

const rows = new Map();
for (const match of indexText.matchAll(/^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|/gm)) {
  const [, number, rawTarget] = match;
  const target = destination(rawTarget);
  if (rows.has(number)) {
    problems.push(`docs/decisions/README.md has two rows for number ${number}`);
  } else {
    rows.set(number, target);
  }
}

for (const [number, name] of files) {
  if (!rows.has(number)) {
    problems.push(`docs/decisions/${name} has no row in docs/decisions/README.md`);
  }
}
for (const [number, target] of rows) {
  if (!files.has(number)) {
    problems.push(`docs/decisions/README.md row ${number} names no ADR file`);
  } else if (target !== files.get(number)) {
    problems.push(
      `docs/decisions/README.md row ${number} links '${target}', but the file is '${files.get(number)}'`,
    );
  }
}

const numbers = [...files.keys()].sort();
numbers.forEach((number, index) => {
  const expected = String(index + 1).padStart(4, "0");
  if (number !== expected) {
    problems.push(`ADR numbering is not contiguous from 0001: expected ${expected}, found ${number}`);
  }
});

if (problems.length) {
  console.error(`check-adr-index: the decisions directory and its index disagree (${problems.length}):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(`decisions/ and its index agree: ${files.size} ADR(s), contiguous from 0001.`);
