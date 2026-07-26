# Foundations — WiseKiosk

The decisions WiseKiosk is built on that are **settled**, each recorded with the premise that would
reopen it. Nothing here is an obligation: every testable "shall" lives in the
[requirements tree](requirements/README.md), which is the specification.

This document once carried the product definition, the day-one architecture, the module contract and
the test architecture as a design hypothesis, written before any code. All of it has graduated — the
product definition to the [README](../README.md), the intended architecture and the constraints into
the requirements tree, the module contract to
[`contracts/module-contract.md`](contracts/module-contract.md), the test architecture to
[`TESTING.md`](TESTING.md), and the resolved questions to their ADRs and tickets. What remains is the
decision record. [`README.md`](README.md) states which document holds which kind of fact.

The section number below is retained because other documents cite this section by number.

---

## 2. Settled decisions

These are settled. **Do not relitigate them** — reopen one only if the stated premise stops being
true. Where a decision carries a rejected alternative worth preserving, it graduates to an ADR in
[`decisions/`](decisions/README.md).

| Decision | Premise that would reopen it |
|---|---|
| Call upstream REST APIs directly; no heavyweight client packages | An upstream API becomes complex enough that a client library earns its dependency cost |
| Secrets resolve server-side only; a key never reaches the browser **by construction** | Never. This is structural, not a policy |
| Config is the single source of truth; **fail fast**, no defaults merge, no silent degradation | Never — and it is stronger here, since the operator may not be technical |
| CI holds no API keys; key-dependent checks run locally | A secrets manager makes key-bearing CI genuinely safe *and* something needs it |
| Frontend is Svelte 5 + Vite, a static SPA | A frontend requirement appears that Svelte serves badly |
| **No SSR, no routing, no meta-framework** — follows from a display that renders a fixed module set and never navigates | The product grows a genuine multi-page or SEO requirement (it will not) |
| **Backend is Go**, with a generated boundary contract — see [ADR 0001](decisions/0001-backend-language-go.md) | The boundary-contract codegen mechanism proves unsustainable, or the backend grows a requirement Go serves badly |

Dependency-footprint discipline generalises: **prefer the standard library and a direct HTTP call
over a package**, and treat any dependency pulling a native build toolchain as disqualified unless
nothing else will do. → SYS010 / SRS073 / SRS074.

**Dev tooling is siloed with the feature it serves, not dropped at the repo root.** A tool's
dependency manifest, lockfile, and virtual environment live in that feature's directory, and its
Dependabot ecosystem points there — so the requirements tool's `requirements-dev.txt` and venv sit
under [`requirements/`](requirements/README.md), not `/`. This keeps each tool's footprint legible
and removable as a unit, and stops the root filling with unrelated manifests as tooling accretes.
→ SYS010 / SRS072.
