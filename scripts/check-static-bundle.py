#!/usr/bin/env python3
"""The frontend build emits a static single-page bundle and nothing more.

[ADR 0018 rev 1](../docs/decisions/0018-frontend-svelte-vite-static-spa.md) decided a static SPA
with no server-side rendering, no router and no meta-framework; this is the mechanical form of that
sentence, and [`docs/CI.md`](../docs/CI.md) § *Module and framework structure* states what it
asserts. Four properties, each read from what the build emitted rather than from what anyone
declared:

- **One HTML entry, and it carries no rendered content.** Exactly one HTML file at the root of the
  emitted tree, and inside its `body` no text and no nesting outside the tags that carry no
  content — so the mount element is empty and nothing was pre-rendered into it.
- **No server-entry chunk**, and no directory of one.
- **No SSR target or adapter declared in the build configuration** — read over the Vite
  configuration and every local module it transitively imports, a population derived by walking
  those imports rather than listed, so a plugin file added and wired in is judged without anyone
  remembering to name it.
- **Every npm package in the emitted module graph is in the committed allowlist.** An allowlist
  rather than a denylist of named routers and meta-frameworks, which fails open the first time
  somebody hand-rolls a hash router: any new runtime dependency fails here until it is reviewed.

The module graph is Rollup's, written out by the build (`frontend/vite-plugin-module-graph.ts`): the
emitted chunks carry no package names, so a check reading only the emitted files could not decide
which packages ship.

An empty population fails rather than passing. No emitted tree, no module graph, a graph naming no
module, and an emitted tree with no script are each a run that judged nothing, which must not read
as a clean bundle.

What this has been run against, in both directions: cases/check-static-bundle-py.md
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
MODULE_GRAPH = FRONTEND / ".vite" / "module-graph.json"
ALLOWLIST = FRONTEND / "bundle-allowlist.json"

# The build configuration's entry point. The rest of the population is derived from it — see
# `build_configuration` — rather than listed, so a plugin module added and wired in is judged
# without anyone remembering to name it here.
BUILD_ENTRY = "vite.config.ts"

# A relative import in the build configuration, from either spelling.
LOCAL_IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]""")

# A declaration that would make this something other than a static single-page bundle.
SERVER_RENDERING = re.compile(r"\bssr\b|\badapter\b|@sveltejs/kit", re.IGNORECASE)

# Emitted names that would be a server half rather than a client bundle.
SERVER_CHUNK = re.compile(r"entry-server|[._-]server[._-]|\bssr\b")

# The npm package an emitted module id belongs to, scoped names included.
PACKAGE = re.compile(r"node_modules/((?:@[^/]+/)?[^/]+)")

# Tags inside `body` that carry no rendered content, so nesting under them is not pre-rendering.
CONTENTLESS = {"script", "style", "link", "meta", "template", "noscript"}


class Body(HTMLParser):
    """What the emitted entry's `body` holds: rendered text, and elements nested inside elements."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.stack = []
        self.rendered = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.inside = True
            return
        if not self.inside:
            return
        if self.stack:
            self.rendered.append(f"<{tag}> nested inside <{self.stack[-1]}>")
        if tag not in CONTENTLESS:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "body":
            self.inside = False
        elif self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_data(self, data):
        if self.inside and self.stack and data.strip():
            self.rendered.append(f"text inside <{self.stack[-1]}>: {data.strip()[:40]!r}")


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


def check_entry(problems):
    """One HTML entry at the root of the emitted tree, carrying no rendered content."""
    entries = sorted(DIST.glob("*.html"))
    if len(entries) != 1:
        names = ", ".join(entry.name for entry in entries) or "none"
        problems.append(f"expected exactly one HTML entry in frontend/dist/, found {len(entries)}: {names}")
        return

    body = Body()
    body.feed(entries[0].read_text(encoding="utf-8"))
    for rendered in body.rendered:
        problems.append(f"{entries[0].name}: body carries rendered content — {rendered}")


def check_no_server_half(problems):
    """No server-entry chunk, and no directory of one."""
    for path in sorted(DIST.rglob("*")):
        if path.is_dir() and path.name in {"server", "ssr"}:
            problems.append(f"frontend/dist/{path.relative_to(DIST)}/ is a server half of the build")
        elif path.is_file() and SERVER_CHUNK.search(path.name):
            problems.append(f"frontend/dist/{path.relative_to(DIST)} is named as a server entry")


def build_configuration(problems):
    """The Vite configuration and every local module it transitively imports.

    Derived by walking the imports rather than listed, because a hand-kept list is a population an
    added plugin file falls outside of with nothing reporting it. An import that cannot be resolved
    is a problem rather than a skip: a module this cannot open is a module it did not judge.
    """
    entry = FRONTEND / BUILD_ENTRY
    if not entry.is_file():
        problems.append(f"frontend/{BUILD_ENTRY} is absent — this judged no build configuration")
        return []

    found, pending = {}, [entry]
    while pending:
        path = pending.pop()
        if path in found:
            continue
        text = path.read_text(encoding="utf-8")
        found[path] = text
        for spec in LOCAL_IMPORT.findall(text):
            target = (path.parent / spec).resolve()
            candidates = [target] if target.suffix else [
                target.with_suffix(".ts"), target / "index.ts"
            ]
            resolved = next((one for one in candidates if one.is_file()), None)
            if resolved is None:
                problems.append(
                    f"{path.relative_to(ROOT)} imports {spec!r}, which resolves to no file — "
                    f"this cannot judge a module it cannot open"
                )
            else:
                pending.append(resolved)
    return sorted(found.items())


def check_configuration(problems):
    """No SSR target or adapter declared anywhere the build is configured from."""
    population = build_configuration(problems)
    if not population:
        problems.append("no build configuration file was read — this judged no declaration")
        return
    for path, text in population:
        where = path.relative_to(ROOT)
        for number, line in enumerate(text.split("\n"), start=1):
            found = SERVER_RENDERING.search(line)
            if found:
                problems.append(f"{where}:{number} declares {found.group(0)!r}")


def check_module_graph(problems):
    """Every npm package that reached the bundle is in the committed allowlist."""
    if not MODULE_GRAPH.is_file():
        problems.append(f"{MODULE_GRAPH.relative_to(ROOT)} is absent — run `just check-build` first")
        return
    ids = json.loads(MODULE_GRAPH.read_text(encoding="utf-8"))
    if not ids:
        problems.append("the emitted module graph names no module — this judged nothing")
        return

    allowed = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    shipped = {found.group(1) for module in ids if (found := PACKAGE.search(module))}
    for package in sorted(shipped - set(allowed)):
        problems.append(
            f"{package} is in the emitted module graph and not in frontend/bundle-allowlist.json — "
            f"a new runtime dependency is reviewed before it ships"
        )
    for package in sorted(set(allowed) - shipped):
        problems.append(
            f"{package} is allowlisted but reaches no emitted module — the allowlist may not "
            f"outlive what it was granted for"
        )
    return shipped


def main():
    if not DIST.is_dir():
        return fail(["frontend/dist/ is absent — run `just check-build` first"])

    problems = []
    scripts = [path for path in DIST.rglob("*.js")]
    if not scripts:
        problems.append("frontend/dist/ holds no script — an emitted tree with nothing in it is not a bundle")

    check_entry(problems)
    check_no_server_half(problems)
    check_configuration(problems)
    shipped = check_module_graph(problems)

    if problems:
        return fail(sorted(problems))
    print(
        f"one HTML entry with an empty mount, no server half, no SSR target or adapter declared, "
        f"and {len(shipped)} npm package(s) in the emitted graph, every one allowlisted: "
        f"{', '.join(sorted(shipped))}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
