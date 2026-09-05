# `check-render-policy`

The inputs this check has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s; how to run a case is [`../README.md`](../README.md)'s.

The recipe builds the render tier's production configuration
(`frontend/vite.config.render.ts`) and previews it under `preview.headers` — the backend's tracked
`csp.txt` and `permissions-policy.txt`, read by `frontend/vite.config.ts` — then runs the
example-configuration and emission specs at each of the three supported viewports.
`frontend/tests/render/harness.ts`'s `render()` collects every console message under this project
and asserts none matches `Content Security Policy`, `Permissions-Policy` or `Unrecognized feature`.

Each row below was seeded into the working tree at the kiosk viewport
(`--project=kiosk`) and reverted; `git diff --quiet` confirmed both the seed landing and the
revert leaving no residue. Counts are this check's own population at the tree as it stands (WI3,
#266): 15 tests.

| Direction | Case | Input | Result |
|---|---|---|---|
| Must pass | The tree as it stands | — | 15 passed |
| Must pass | A legal Permissions-Policy addition | `backend/internal/headers/permissions-policy.txt`'s `screen-wake-lock=()` changed to `screen-wake-lock=(self)` | 15 passed — granting a real feature raises no console message, so the regex is not tripped merely by the header naming one |
| Must fail | A CSP violation | `BrightImage.svelte`'s `img` reverted from the same-origin `bright-image.gif` import to its former `data:image/gif;base64,…` `src` | 3 failed, 12 passed (the two full-emission and the exemption reads) — console: ``Loading the image 'data:image/gif;base64,…' violates the following Content Security Policy directive: "img-src 'self'". The action has been blocked.`` |
| Must fail | An unrecognised Permissions-Policy feature | `permissions-policy.txt`'s `screen-wake-lock=()` changed to `screen-wake-lock=(), frobulate=()` | 15 failed — console: `Error with Permissions-Policy header: Origin trial controlled feature not enabled: 'frobulate'.` |

**The CSP row is the defect WI3 fixed, seeded back.** `BrightImage.svelte`'s exempt-imagery fixture
shipped as a `data:` URI until #266's `img-src 'self'` made it unloadable; reverting that one line is
this check's own proof that it would have caught the regression, not just that it passes today.

**The unrecognised-feature row uses a name this repository already knows is invalid.**
`frobulate` was in `permissions_policy.go`'s universe before the #266 Chromium-151 resync dropped it
for logging exactly this message under a stock launch — the same name, reused here rather than
invented, so the two records agree on what "unrecognised" means.

**What it does not catch.** A console message that does not contain any of the three matched
substrings — a warning from an unrelated header, or a Permissions-Policy failure Chromium phrases
without the string `Permissions-Policy` — passes unseen. The check also cannot fail a directive that
Chromium silently narrows rather than rejects outright, since nothing is printed for that either.
