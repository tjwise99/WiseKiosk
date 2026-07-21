# WiseKiosk

A config-driven smart-mirror display. A full-screen browser page renders a fixed set of modules —
clock, compliments, weather, aviation METAR/TAF, theme-park wait times — from a handful of public
APIs, running unattended on a display behind one-way glass. Shipped as one container image; each
deployment is independent, customised through configuration, never through a fork.

> **Status: bootstrapping (pre-code).** The foundations are written; no application code exists yet.

## Stack

- **Backend:** Go — a thin, stateless REST proxy. See [ADR 0001](docs/decisions/0001-backend-language-go.md).
- **Frontend:** Svelte 5 + Vite, a static SPA.
- **Boundary:** one schema, both sides generated from it — no hand-maintained parallel types.

## Documentation

Start with the foundations spec; it is standalone and everything else hangs off it.

- [`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md) — what WiseKiosk is, who operates it, the settled
  decisions, the day-one architecture, what must not be built, and the module contract.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the living description of the system as built
  (a skeleton until code lands).
- [`docs/TESTING.md`](docs/TESTING.md) — the test architecture, written as a specification before any
  tests exist.
- [`docs/decisions/`](docs/decisions/README.md) — architecture decision records.
