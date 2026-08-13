#!/usr/bin/env node
// Every check `just verify` depends on must also run in
// .github/workflows/checks.yml, and every named CI step must be either one of
// those checks or an enumerated CI-only exception (secret scanning; the
// PR-title Conventional-Commit check). See docs/CI.md § Gate wiring.
//
// No dependencies: Node stdlib only, plain text scanning (no YAML parser) —
// matches scripts/check-links.mjs's idiom.
//
// What this has been run against, in both directions: cases/check-verify-ci-parity-mjs.md

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const workflowText = readFileSync(resolve(repoRoot, ".github/workflows/checks.yml"), "utf8");

const fail = (msg) => {
  console.error(`check-verify-ci-parity: ${msg}`);
  process.exit(1);
};

// Each `just verify` check → one token per command its recipe runs, each carrying that command
// whole. See docs/CI.md § Gate wiring.
const CHECK_TOKENS = {
  "check-links": ["node scripts/check-links.mjs"],
  "check-eol": ["sh scripts/check-eol.sh"],
  "check-branch": ["sh scripts/check-branch.sh"],
  "check-reqs": [
    "docs/requirements/.venv/bin/python scripts/check-unreviewed.py",
    "docs/requirements/.venv/bin/python scripts/check-suspect-links.py",
    "sh scripts/validate-tree.sh",
    "docs/requirements/.venv/bin/python scripts/check-method-consistency.py",
    "docs/requirements/.venv/bin/python scripts/check-text-citations.py",
    "docs/requirements/.venv/bin/python scripts/check-headers.py",
  ],
  "check-citations": ["docs/requirements/.venv/bin/python scripts/check-citations.py"],
  "check-arch": [
    "docs/architecture/node_modules/.bin/likec4 validate docs/architecture/model",
    "rm -rf docs/architecture/generated",
    "docs/architecture/node_modules/.bin/likec4 codegen mermaid docs/architecture/model -o docs/architecture/generated",
    "node scripts/splice-arch-diagrams.mjs",
    "git add --intent-to-add -- docs/architecture/",
    "git diff --exit-code HEAD -- docs/architecture/ docs/ARCHITECTURE.md",
  ],
  "check-arch-trace": ["docs/requirements/.venv/bin/python scripts/check-arch-trace.py"],
  "check-site": [
    "docs/site/.venv/bin/python docs/site/doorstop_to_needs.py",
    "docs/site/.venv/bin/sphinx-build -W -b html -c docs/site docs docs/site/_build/html",
  ],
  "check-adr-revs": ["python3 scripts/check-adr-revs.py"],
  "check-adr-index": ["node scripts/check-adr-index.mjs"],
  "check-docs-index": ["node scripts/check-docs-index.mjs"],
  "check-repo-silo": ["node scripts/check-repo-silo.mjs"],
  "check-workflow-hardening": ["node scripts/check-workflow-hardening.mjs"],
  "check-verify-ci-parity": ["node scripts/check-verify-ci-parity.mjs"],
};

// CI steps with no local equivalent — exempted by name, not mapped from `just verify`.
const CI_ONLY_ALLOWLIST = [
  "gitleaks", // secret-scan job: needs full git history, not part of `just verify`
  "scripts/check-commit-msg.sh", // PR-title Conventional-Commit check: no PR title exists locally
];

// Recipes are read from `just`'s own dump rather than parsed out of the justfile, so a recipe's
// dependencies and body are whatever `just` resolves them to.
const dump = JSON.parse(
  execSync("just --dump --dump-format json", { cwd: repoRoot, encoding: "utf8" }),
);

// A module's recipes sit outside `recipes`, so nothing below would see one. Reported rather than
// skipped: a check that cannot reach a population must not report success over the rest of it.
// The field's absence is not its emptiness — `--dump` is a debug surface, not a stable schema, so a
// shape this does not recognise fails rather than reading as "no modules".
if (!dump.modules || typeof dump.modules !== "object") {
  fail("the justfile dump carries no `modules` map, so this cannot tell whether a module is declared");
}
if (Object.keys(dump.modules).length) {
  fail(`the justfile declares module(s) ${Object.keys(dump.modules).join(", ")}, whose recipes this does not read`);
}

const verifyRecipe = dump.recipes.verify;
if (!verifyRecipe) fail("the justfile declares no `verify` recipe");
const verifyChecks = verifyRecipe.dependencies.map((dependency) => dependency.recipe);
if (!verifyChecks.length) fail("`verify` depends on no check, so nothing below judged anything");

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

const renderLine = (fragments, recipe) => {
  if (!fragments.every((fragment) => typeof fragment === "string")) {
    fail(`'${recipe}' interpolates a value into a command, which this cannot resolve to what runs`);
  }
  return fragments.join("").trim();
};

// `just` emits a comment as its own body entry, and splits a `\` continuation across entries. Both
// are rejoined to the commands actually run, so neither shape reads as a command needing a token.
const bodyCommands = (recipe, name) => {
  const commands = [];
  let pending = "";
  for (const [index, fragments] of recipe.body.entries()) {
    const line = renderLine(fragments, name);
    // `#!` opens a script body, and only on the first line; anywhere else it is a shell comment.
    if (!pending && line.startsWith("#") && !(index === 0 && line.startsWith("#!"))) continue;
    const joined = pending + line;
    if (joined.endsWith("\\")) {
      pending = `${joined.slice(0, -1).trimEnd()} `;
      continue;
    }
    pending = "";
    if (joined === "") continue;
    // `@` suppresses the echo and is stripped; `-` discards the command's failing status, so the
    // recipe passes where CI's identical command fails. Failing beats normalising it away. The
    // prefix is taken once, with the whitespace `just` allows after it, so both read the same shape.
    const prefix = joined.match(/^[@-]+\s*/)?.[0] ?? "";
    if (prefix.includes("-")) {
      fail(`'${name}' prefixes '${joined}' with '-', which ignores its failing status — the recipe would pass a check CI fails`);
    }
    commands.push(joined.slice(prefix.length));
  }
  if (pending) fail(`'${name}' ends on a line continuation with no line after it`);
  return commands;
};

// Dependencies and `just <recipe>` both reach another recipe's commands, so both are expanded.
const commandsOf = (name, seen = new Set()) => {
  if (seen.has(name)) fail(`recipe '${name}' depends on itself`);
  seen.add(name);
  const recipe = dump.recipes[name];
  if (!recipe) fail(`no '${name}' recipe in the justfile`);
  // A shebang body is one shell script, whose lines are control flow rather than commands to map.
  // Failing beats exempting: an exemption is an opt-out any recipe could take by adding a line.
  if (typeof recipe.shebang !== "boolean") {
    fail(`the dump for '${name}' carries no \`shebang\` field, so this cannot tell a script from a list of commands`);
  }
  if (recipe.shebang) fail(`'${name}' is a shell script, which this cannot map to CI commands — move it under scripts/`);

  const reach = (target) => commandsOf(target, new Set(seen));

  return [
    ...recipe.dependencies.flatMap((dependency) => reach(dependency.recipe)),
    ...bodyCommands(recipe, name).flatMap((command) => {
      const delegated = command.match(/^@?just (\S+)$/);
      return delegated ? reach(delegated[1]) : [command];
    }),
  ];
};

for (const [check, tokens] of Object.entries(CHECK_TOKENS)) {
  const commands = commandsOf(check);
  // Asserted before the token loops, which both pass vacuously over an empty list and would then
  // agree that a recipe this could not read is correctly mapped.
  if (commands.length === 0) fail(`'${check}' has an empty recipe body, or this could not read it`);

  // Whole-string against the recipe in both directions; a substring against the workflow above,
  // where CI spells a command with arguments the recipe does not.
  for (const token of tokens) {
    if (!commands.includes(token)) {
      fail(`'${check}' (token '${token}') is no command its recipe runs — the recipe changed, or the token is stale`);
    }
  }

  for (const command of commands) {
    if (!tokens.includes(command)) {
      fail(`'${check}' runs '${command}' but no CHECK_TOKENS entry is that command — add one`);
    }
  }
}

// Searched instead of the whole file: a token in a comment names no step that runs, and a token in
// a step's `name:` describes one rather than invoking it. Either would satisfy a plain text search
// while the step it stands for was deleted.
// YAML ends a line at a ` #` outside a quoted scalar, so a token can outlive the step it names in a
// trailing comment. A quote is syntactic only where a scalar may begin — after the indent, an
// optional `- `, and an optional `key:`; anywhere else it is an ordinary character, which is why an
// apostrophe in prose neither opens a quote nor hides what follows it.
const SCALAR_START = /^\s*(?:-\s+)?(?:[^\s:#]+:(?:\s+|$))?/;

const stripTrailingComment = (line) => {
  let index = line.match(SCALAR_START)[0].length;
  const quote = line[index];
  if (quote === '"' || quote === "'") {
    index += 1;
    while (index < line.length) {
      if (quote === '"' && line[index] === "\\") index += 1;
      else if (line[index] === quote) {
        if (quote === "'" && line[index + 1] === "'") index += 1;
        else break;
      }
      index += 1;
    }
    index += 1; // past the closing quote
  }
  const comment = line.slice(index).search(/(?:^|\s)#/);
  return comment === -1 ? line : line.slice(0, index + comment);
};

const strip = (text) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && !/^\s*- name:/.test(line))
    .map(stripTrailingComment)
    .join("\n");

const runningText = strip(workflowText);

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
  // Searched with the step's own `name:` and every comment removed, for the reason the forward loop
  // excludes them: a step named after a check is not a step running one, and neither is a comment
  // mentioning it.
  const body = strip(chunk);
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
