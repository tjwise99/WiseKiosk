# 0001 — Backend in Go, with a generated boundary contract

**Status:** accepted
**Decided:** 2026-07-21 (WiseKiosk bootstrap — the one open architectural decision from the
foundations spec)

## Context

The frontend is settled: Svelte 5 + Vite, a static SPA. The backend is a thin, stateless REST proxy —
route handlers, an HTTP client, response shaping, a TTL response cache, config schema validation, and
static file serving. A few hundred lines, no exotic requirements. Every candidate language does this
trivially, so capability is not the deciding factor.

Two things decide it. First, **learning value is an explicit goal** of this project. Second, and
pulling the other way, the frontend is TypeScript, so any backend language that is *not* TypeScript
loses shared types across the frontend/backend boundary — and a value that must agree on both sides of
a boundary with no shared definition and nothing enforcing agreement is the worst defect class this
design is built to avoid. It fails silently and is untestable by construction.

## Decision

**Go.** And, forced by that choice: the frontend/backend **boundary contract must have exactly one
definition, with a mechanism that regenerates both sides from it** (an OpenAPI schema with client
generation, or equivalent). That mechanism must exist **before the second module is built** — it is an
up-front cost, not a retrofit. Choosing Go without it is not on the table.

## Alternatives considered

- **TypeScript on Node** — the safe option. One shared type definition type-checks both sides of the
  boundary for free, so the worst defect class is eliminated with no extra machinery. Rejected because
  its learning value is essentially zero (already familiar) and it carries a Node runtime image plus a
  toolchain/lockfile split for the frontend build, all to run a service that gains nothing from them.
- **Deno (TypeScript)** — genuinely strong: keeps the shared boundary types for free *and* compiles to
  a single self-contained binary, with batteries-included tooling and no lockfile split. Rejected
  because the learning goal here is specifically a different language and paradigm, and Deno's learning
  is "a new runtime," not "a new language." Recorded deliberately: it dominates Node, and it is the
  pre-analysed fallback if the Go boundary-codegen cost proves not worth its return.
- **Rust (axum)** — highest learning ceiling and strongest type system; `typeshare` can generate TS
  types from Rust structs, a decent boundary story. Rejected as over-engineered — async and
  borrow-checker friction for a ~300-line service, and the slowest path to a first working module.
- **C#** — dismissed: familiar, so nothing is gained.

## Consequences

- **Smallest deploy.** A static binary on `scratch`/distroless, near-zero third-party dependencies,
  `net/http` a direct fit. No backend runtime image, no lockfile or musl/glibc toolchain split.
- **The boundary contract becomes a hard, up-front obligation.** A schema→codegen mechanism must be
  chosen and stood up before the second module (this is open question 2 in the foundations spec), and
  it becomes the Boundary tier of the test architecture — CI must verify the generated code is in sync.
  Under Node this would have been nearly free; under Go it is paid work, done knowingly.
- **Response shaping is more verbose** than TypeScript — explicit struct definitions per payload.
- **Learning value is realised** — the stated goal — at the price above.

**Premise that would reopen this:** the boundary-contract codegen mechanism proves unsustainable in
practice, or the backend grows a requirement Go serves badly. In the first case, Deno is the
pre-analysed fallback that removes the codegen requirement entirely. Absent either, do not relitigate.
