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
const declared = (dependabotText.split(/^updates:[^\S\n]*$/m)[1] ?? "")
  .split("\n")
  .filter((line) => /^\s*-\s/.test(line)).length;
if (entries.length !== declared) {
  problems.push(
    `.github/dependabot.yml declares ${declared} ecosystem entr(ies), of which ${entries.length} ` +
      `parsed — check-repo-silo.mjs cannot read this layout, so no entry was examined`,
  );
}

let checked = 0;
for (const entry of entries) {
  const ecosystem = entry.match(/^\s*- package-ecosystem:\s*"?([\w-]+)"?/m)?.[1];
  if (ecosystem === "github-actions") continue;
  checked += 1;
  const directory = entry.match(/^\s*directory:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
  if (!directory) {
    problems.push(`the '${ecosystem}' Dependabot entry declares no directory`);
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

if (problems.length) {
  console.error(`check-repo-silo: tooling is not siloed (${problems.length}):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(
  `Repository root holds no manifest, and ${checked} Dependabot entr(ies) resolve to their manifests.`,
);
