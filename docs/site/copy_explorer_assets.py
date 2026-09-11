#!/usr/bin/env python3
"""Build-time asset copy for the API explorer and architecture explorer pages (#195, #115).

Copies the Swagger UI files the API explorer page needs out of the npm-installed
`swagger-ui-dist` (never committed — build-fetched via `npm ci`), a copy of
`boundary/openapi.yaml` (the single schema source, never hand-edited), and the
LikeC4 webcomponent bundle the architecture explorer page needs, into
`docs/site/vendor/`, which `conf.py` lists in `html_static_path` so Sphinx
copies it into the built site's `_static/`.

The LikeC4 bundle (`docs/architecture/embed/likec4-views.js`) comes from a
separate, siloed toolchain this script does not invoke — `just arch-export`,
run before this script by `docs-serve` and by `pages.yml`. The read-only
`docs-site` check job never runs `arch-export`, so the bundle is absent there;
copying it is conditional on its presence rather than an error, and the
architecture explorer page simply renders without its interactive view in that
build.

Usage: docs/site/.venv/bin/python docs/site/copy_explorer_assets.py
Output is generated and gitignored.
"""

from __future__ import annotations

import shutil
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent.parent

SWAGGER_UI_DIST = SITE / "node_modules" / "swagger-ui-dist"
LIKEC4_EMBED = ROOT / "docs" / "architecture" / "embed" / "likec4-views.js"
VENDOR = SITE / "vendor"

# The exact files the explorer page loads — not the whole dist tree (which
# also carries an unused standalone HTML page, favicons, source maps for
# bundles the page does not load, and oauth2-redirect assets this page has
# no use for).
SWAGGER_UI_FILES = [
    "swagger-ui.css",
    "swagger-ui-bundle.js",
    "swagger-ui-standalone-preset.js",
]


def main() -> None:
    if VENDOR.exists():
        shutil.rmtree(VENDOR)
    swagger_ui_out = VENDOR / "swagger-ui"
    swagger_ui_out.mkdir(parents=True)

    for name in SWAGGER_UI_FILES:
        source = SWAGGER_UI_DIST / name
        if not source.is_file():
            raise SystemExit(
                f"{source} is missing — run `npm --prefix docs/site ci` first"
            )
        shutil.copyfile(source, swagger_ui_out / name)

    schema_source = ROOT / "boundary" / "openapi.yaml"
    shutil.copyfile(schema_source, VENDOR / "openapi.yaml")

    if LIKEC4_EMBED.is_file():
        likec4_out = VENDOR / "likec4"
        likec4_out.mkdir(parents=True)
        shutil.copyfile(LIKEC4_EMBED, likec4_out / "likec4-views.js")
        likec4_note = "likec4-views.js"
    else:
        print(f"{LIKEC4_EMBED} not found — skipping (run `just arch-export` first to embed "
              "the architecture model)")
        likec4_note = "no likec4-views.js"

    print(f"copied {len(SWAGGER_UI_FILES)} swagger-ui-dist file(s), openapi.yaml and "
          f"{likec4_note} into {VENDOR}")


if __name__ == "__main__":
    main()
