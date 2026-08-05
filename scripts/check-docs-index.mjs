#!/usr/bin/env node
// Every tracked Markdown file outside a top-level dot-directory is claimed by a row in
// docs/README.md's index; one rendered path carries one row; a row names a tracked
// document, or a directory holding one; every row's link resolves to a tracked file;
// and no Guarantees or Excludes cell is empty. A row rendering with a trailing slash
// claims the subtree beneath it. See docs/CI.md § Documentation integrity and ADR 0014 rev 1.
//
// No dependencies: Node stdlib only, plain text scanning — matches
// scripts/check-adr-index.mjs's idiom.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, posix } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const INDEX = "docs/README.md";

const problems = [];

// The index's links are written relative to docs/; this returns them repo-relative.
const fromDocs = (path) => posix.normalize(posix.join("docs", path));

const tracked = new Set(
  execSync("git ls-files -z '*.md'", { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter(Boolean),
);

const fileClaims = new Set();
const subtreeClaims = [];
const claimed = new Set();
let rows = 0;

for (const line of readFileSync(resolve(repoRoot, INDEX), "utf8").split("\n")) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  if (cells[0] === "Document" || cells.every((cell) => /^-+$/.test(cell))) continue;
  if (cells.length !== 3) {
    problems.push(`${INDEX}: a row has ${cells.length} cells, expected Document, Guarantees, Excludes`);
    continue;
  }

  const [document, guarantees, excludes] = cells;
  const link = document.match(/^\[`([^`]+)`\]\(([^)]+)\)$/);
  if (!link) {
    problems.push(`${INDEX}: Document cell '${document}' is not a backticked-path link`);
    continue;
  }
  rows += 1;

  const [, rendered, target] = link;
  if (!guarantees) problems.push(`${INDEX}: row '${rendered}' has an empty Guarantees cell`);
  if (!excludes) problems.push(`${INDEX}: row '${rendered}' has an empty Excludes cell`);

  const linked = fromDocs(target);
  if (!tracked.has(linked)) {
    problems.push(`${INDEX}: row '${rendered}' links '${target}', which is not a tracked file`);
  }

  const claim = fromDocs(rendered);
  if (claimed.has(claim)) {
    problems.push(`${INDEX}: '${rendered}' has two rows — one fact, one canonical home`);
  }
  claimed.add(claim);

  if (claim.startsWith(".") && claim.includes("/")) {
    problems.push(`${INDEX}: row '${rendered}' indexes a dot-directory, which is machinery`);
  }

  if (rendered.endsWith("/")) {
    subtreeClaims.push(claim);
    if (![...tracked].some((path) => path.startsWith(claim))) {
      problems.push(`${INDEX}: row '${rendered}' claims a directory holding no tracked document`);
    }
  } else {
    fileClaims.add(claim);
    if (!tracked.has(claim)) problems.push(`${INDEX}: row '${rendered}' names no tracked document`);
  }
}

// Independently sourced — the git index against the index file — so a parse that stops
// matching cannot take both to zero at once. See ADR 0014 rev 1.
if (!rows) problems.push(`${INDEX}: no index row parsed — the table's shape has moved`);
if (!tracked.size) problems.push("git ls-files reported no tracked Markdown file");

const machinery = new Set();
for (const path of [...tracked].sort()) {
  if (path === INDEX) continue; // The index does not index itself.
  if (path.startsWith(".") && path.includes("/")) {
    machinery.add(path.slice(0, path.indexOf("/") + 1)); // A top-level dot-directory holds machinery. ADR 0014 rev 1.
    continue;
  }
  if (fileClaims.has(path)) continue;
  if (subtreeClaims.some((subtree) => path.startsWith(subtree))) continue;
  problems.push(`${path} has no row in ${INDEX}`);
}

if (problems.length) {
  console.error(`check-docs-index: the documentation set and its index disagree (${problems.length}):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
// Naming them is what makes ADR 0014 rev 1's accepted trade reviewable: a directory appearing
// here without an index row is the whole of what the rule lets through unremarked.
console.log(
  `every tracked document is claimed: ${rows} index row(s), ${tracked.size} document(s).\n` +
    `machinery, claimed by nothing: ${[...machinery].sort().join(" ") || "none"}`,
);
