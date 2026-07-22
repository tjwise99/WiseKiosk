#!/usr/bin/env node
// The Mermaid diagrams embedded in docs/ARCHITECTURE.md are generated, never
// hand-maintained: each `<!-- arch-export:begin <file> -->` …
// `<!-- arch-export:end <file> -->` marker pair is rewritten from the named
// artifact under docs/architecture/, wrapped in a ```mermaid fence. Enforces the
// "one definition, many generated views" rule for the embedded diagrams — a hand
// edit inside a marker region is overwritten here and caught by the staleness
// gate. Exits non-zero on unpaired or malformed markers, a marker naming a
// missing (or escaping) artifact, or a document with no markers at all.
//
// Run as the final step of `just arch-export`. No dependencies: Node stdlib only.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, sep } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const targetPath = resolve(repoRoot, "docs/ARCHITECTURE.md");
const artifactRoot = resolve(repoRoot, "docs/architecture");

const fail = (msg) => {
  console.error(`splice-arch-diagrams: ${msg}`);
  process.exit(1);
};

const text = readFileSync(targetPath, "utf8");
const markerRe = /<!-- arch-export:(begin|end) (\S+) -->/g;
const markers = [...text.matchAll(markerRe)].map((m) => ({
  kind: m[1],
  name: m[2],
  start: m.index,
  end: m.index + m[0].length,
}));

if (markers.length === 0) fail("no arch-export markers found in docs/ARCHITECTURE.md");
if (markers.length % 2 !== 0) fail("odd number of arch-export markers — an unpaired begin or end");

let out = "";
let cursor = 0;
for (let i = 0; i < markers.length; i += 2) {
  const begin = markers[i];
  const end = markers[i + 1];
  if (begin.kind !== "begin" || end.kind !== "end" || begin.name !== end.name) {
    fail(
      `malformed marker pair: '${begin.kind} ${begin.name}' followed by '${end.kind} ${end.name}'`,
    );
  }
  const artifact = resolve(artifactRoot, begin.name);
  if (!artifact.startsWith(artifactRoot + sep)) {
    fail(`${begin.name}: escapes docs/architecture/`);
  }
  if (!existsSync(artifact)) {
    fail(`${begin.name}: no such generated artifact under docs/architecture/`);
  }
  let body = readFileSync(artifact, "utf8");
  if (!body.endsWith("\n")) body += "\n";
  out += text.slice(cursor, begin.end);
  out += "\n\n```mermaid\n" + body + "```\n\n";
  cursor = end.start;
}
out += text.slice(cursor);

if (out !== text) writeFileSync(targetPath, out);
console.log(
  `Spliced ${markers.length / 2} generated diagram(s) into docs/ARCHITECTURE.md${out === text ? " (already current)" : ""}.`,
);
