#!/usr/bin/env node
// Every relative Markdown link in every tracked .md file must resolve to a file
// inside this repository, and every absolute http/https link must name a host on
// scripts/upstream-hosts.txt, whose every entry must name what it serves.
// Enforces the "docs are standalone — no reference points outside this repo"
// invariant and the host allowlist in docs/CI.md § Documentation integrity.
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

const problems = [];

const allowlistPath = "scripts/upstream-hosts.txt";
const allowedHosts = new Set();
readFileSync(resolve(repoRoot, allowlistPath), "utf8")
  .split("\n")
  .forEach((line, index) => {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) return;
    const [host, ...rest] = entry.split("—");
    if (!rest.join("—").trim()) {
      problems.push(
        `${allowlistPath}:${index + 1}  ->  ${entry}   (names no service — write 'host — what it serves')`,
      );
      return;
    }
    allowedHosts.add(host.trim());
  });

const linkRe = /\]\(([^)]+)\)/g;
const absoluteRe = /\bhttps?:\/\/[^\s<>)\]"'`]+/gi;

for (const file of mdFiles) {
  const abs = resolve(repoRoot, file);
  const text = readFileSync(abs, "utf8");
  for (const match of text.matchAll(linkRe)) {
    const raw = match[1].trim().split("#")[0]; // drop anchor
    if (!raw) continue; // pure in-page anchor
    if (/^https?:/i.test(raw)) continue; // absolute: the host scan below owns it
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // other scheme: mailto, etc.
    const target = resolve(dirname(abs), raw);
    const rel = relative(repoRoot, target);
    if (rel.startsWith("..")) {
      problems.push(`${file}  ->  ${raw}   (escapes the repository)`);
    } else if (!existsSync(target)) {
      problems.push(`${file}  ->  ${raw}   (does not exist)`);
    }
  }

  // Every absolute URL, whatever syntax carries it — inline link, reference definition, autolink or
  // bare text. Matching the link form alone would leave the other three unchecked.
  for (const [url] of text.matchAll(absoluteRe)) {
    const host = URL.parse(url)?.hostname;
    if (!host) {
      problems.push(`${file}  ->  ${url}   (not a parseable URL)`);
    } else if (!allowedHosts.has(host)) {
      problems.push(`${file}  ->  ${url}   (host '${host}' is not on ${allowlistPath})`);
    }
  }
}

if (problems.length) {
  console.error(`Broken, escaping or off-allowlist Markdown links (${problems.length}):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(
  `All Markdown links resolve inside the repo or name an allowlisted host (${mdFiles.length} files, ${allowedHosts.size} host(s) allowed).`,
);
