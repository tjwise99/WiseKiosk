#!/usr/bin/env python3
"""Build-time asset copy for the API explorer page (#195).

Copies the Swagger UI files the page needs out of the npm-installed
`swagger-ui-dist` (never committed — build-fetched via `npm ci`, ADR 0029) and
a copy of `boundary/openapi.yaml` (the single schema source, never
hand-edited) into `docs/site/vendor/`, which `conf.py` lists in
`html_static_path` so Sphinx copies it into the built site's `_static/`.

Usage: docs/site/.venv/bin/python docs/site/copy_explorer_assets.py
Output is generated and gitignored.
"""

from __future__ import annotations

import shutil
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent.parent

SWAGGER_UI_DIST = SITE / "node_modules" / "swagger-ui-dist"
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

    print(f"copied {len(SWAGGER_UI_FILES)} swagger-ui-dist file(s) and openapi.yaml into {VENDOR}")


if __name__ == "__main__":
    main()
