#!/usr/bin/env node
// Tooling is siloed with the feature it serves: a depth-1 listing of the
// repository root holds no manifest or environment directory, and every
// Dependabot entry that is not github-actions names a non-root directory holding
// the manifest its ecosystem implies. See docs/CI.md § Repository shape.
//
// No dependencies: Node stdlib only, plain text scanning (no YAML parser) —
// matches scripts/check-verify-ci-parity.mjs's idiom.

import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

const problems = [];

const listing = (dir) => {
  try {
    return readdirSync(resolve(repoRoot, dir));
  } catch {
    return null;
  }
};

const ROOT_FORBIDDEN = [/^package\.json$/, /^go\.mod$/, /^pyproject\.toml$/, /^requirements.*\.txt$/, /^\.venv$/];

for (const entry of listing(".").sort()) {
  if (ROOT_FORBIDDEN.some((pattern) => pattern.test(entry))) {
    problems.push(`'${entry}' sits at the repository root — silo it with the feature it serves`);
  }
}

// Each ecosystem → the manifest patterns its Dependabot directory must hold.
// An ecosystem absent here fails rather than passing unmapped.
const MANIFESTS = {
  pip: [/^requirements.*\.txt$/, /^pyproject\.toml$/],
  npm: [/^package\.json$/],
  gomod: [/^go\.mod$/],
};

const dependabotText = readFileSync(resolve(repoRoot, ".github/dependabot.yml"), "utf8");
const entries = dependabotText.split(/\n(?=\s*- package-ecosystem:)/).slice(1);

// The split is this script's only view of the file, and a layout it does not anticipate yields no
// entries. The guard counts list items under `updates:` instead — deliberately sharing no assumption
// with the split, because a guard keyed on the same literal goes to zero alongside the thing it
// guards and the two then agree that nothing is wrong.
const listItems = (dependabotText.split(/^updates:[^\S\n]*$/m)[1] ?? "")
  .split("\n")
  .filter((line) => /^\s*-\s/.test(line))
  .map((line) => line.search(/\S/));
// Only the shallowest list items are entries. A nested one belongs to a key an entry contains —
// `patterns:` written as a block list rather than inline — and counting those as entries fails a
// configuration that is merely spelled differently.
const entryDepth = Math.min(...listItems);
const declared = listItems.filter((depth) => depth === entryDepth).length;
// Asserted before the count, and sharing no assumption with the parser: a count derived from the
// same literal-matching goes to zero alongside the split, and the two then agree that nothing is
// wrong. No spelling of the keys can make a real entry list parse as empty.
if (entries.length === 0) {
  problems.push(
    `.github/dependabot.yml — no ecosystem entry parsed, so none was examined; either the file ` +
      `declares none, or check-repo-silo.mjs cannot read this layout`,
  );
} else if (entries.length !== declared) {
  problems.push(
    `.github/dependabot.yml holds ${declared} entr(ies) under 'updates:' but ${entries.length} ` +
      `parsed — check-repo-silo.mjs cannot read this layout, so the two disagree on what is there`,
  );
}

let checked = 0;
let actions = false;
for (const entry of entries) {
  const ecosystem = entry.match(/^\s*- package-ecosystem:\s*"?([\w-]+)"?/m)?.[1];
  if (ecosystem === "github-actions") {
    actions = true;
    continue;
  }
  checked += 1;
  const directory = entry.match(/^\s*directory:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
  if (!directory) {
    problems.push(`the '${ecosystem}' Dependabot entry declares no 'directory' key`);
    continue;
  }
  if (directory === "/") {
    problems.push(`the '${ecosystem}' Dependabot entry points at the repository root`);
    continue;
  }
  const patterns = MANIFESTS[ecosystem];
  if (!patterns) {
    problems.push(`ecosystem '${ecosystem}' has no manifest mapping in check-repo-silo.mjs — add one`);
    continue;
  }
  const contents = listing("." + directory);
  if (contents === null) {
    problems.push(`the '${ecosystem}' Dependabot entry names '${directory}', which does not exist`);
    continue;
  }
  if (!contents.some((name) => patterns.some((pattern) => pattern.test(name)))) {
    problems.push(
      `the '${ecosystem}' Dependabot entry names '${directory}', which holds no ` +
        patterns.map((pattern) => pattern.source).join(" or "),
    );
  }
}

// The loop above exempts github-actions from the manifest rule, so its entry is asserted to exist
// here instead. See docs/CI.md § Repository shape.
// Conditioned on the split above having produced entries: with none, the guard has already reported
// why, and this would add a claim about the file that the parse cannot support.
if (entries.length && !actions) {
  problems.push(".github/dependabot.yml declares no 'github-actions' entry, so action pins go stale");
}

// A recipe is a list of commands; shell control flow is a script, and a script is siloed under
// scripts/ like every other kind of tooling. Read from just's own dump so the shape is whatever just
// resolves it to. See docs/CI.md § Repository shape.
const recipes = JSON.parse(
  execSync("just --dump --dump-format json", { cwd: repoRoot, encoding: "utf8" }),
).recipes;
// Asserted before the loop, which passes vacuously over an empty set and would then agree that a
// justfile this could not read holds no script.
if (!recipes || !Object.keys(recipes).length) {
  problems.push("the justfile dump names no recipe, so nothing here judged it");
}
for (const [name, recipe] of Object.entries(recipes ?? {})) {
  if (recipe.shebang) {
    problems.push(`justfile recipe '${name}' is a shell script — move it under scripts/ and call it from a one-line recipe`);
  }
}

if (problems.length) {
  console.error(`check-repo-silo: tooling is not siloed (${problems.length}):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(
  `Repository root holds no manifest, no justfile recipe is a shell script, github-actions is ` +
    `covered, and ${checked} Dependabot entr(ies) resolve to their manifests.`,
);
