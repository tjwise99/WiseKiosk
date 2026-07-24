# Architecture decision records

An ADR captures a decision **with a rejected alternative** — the "why not the other way" is the whole
point of writing one down. A decision with no real alternative considered is a changelog entry and
belongs in a commit message, not here. New ADR: copy [`TEMPLATE.md`](TEMPLATE.md), number it one past
the highest below, and add it to the table.

**Numbers are chronological and immutable.** Once an ADR is merged its number never changes, even if
it is later superseded: mark the old one `superseded by NNNN` and write a new one. Each entry carries
a **Decided** date — when the choice was *taken*, not when the work merged.

Immutability protects the argument, not the pointers. Where a cited document is retired or its
content moves, an ADR's citations may be retargeted to wherever the claim now lives; its reasoning,
decision, and rejected alternatives stay as written.

| # | Decided | Decision |
|---|---|---|
| [0001](0001-backend-language-go.md) | 2026-07-21 | Backend in Go; the frontend/backend boundary contract is generated from one schema |
| [0002](0002-requirements-management-doorstop.md) | 2026-07-21 | Requirements tracked and V&V-gated with Doorstop (SYS→SRS→TST tree) |
| [0003](0003-architecture-as-code-likec4.md) | 2026-07-22 | Architecture modeled as code with LikeC4; browser-free Mermaid codegen, staleness-gated |
| [0004](0004-docs-site-sphinx-needs.md) | 2026-07-22 | Documentation site built with Sphinx + MyST + sphinx-needs; traceability rendered by sphinx-needs, deployed to GitHub Pages |
| [0005](0005-traceability-gating.md) | 2026-07-22 | All work traces to the requirements tree via four in-repo gates; per-test attribution, derived verification status, tree as backlog |
| [0006](0006-process-gates.md) | 2026-07-22 | Process gates: branches named type_number-snake_name, typed by ticket template and linked to an open issue; Conventional-Commit PR titles |
| [0007](0007-config-validation-allocation.md) | 2026-07-23 | Config validation is frontend-owned: one TS engine runs in the page and as the desk CLI; the backend is config-blind |
| [0008](0008-boundary-contract-openapi-codegen.md) | 2026-07-23 | Boundary contract: one OpenAPI schema (3.0.3 now, 3.1 later), Go + TypeScript types generated from it, CI drift-gated; frontend types-only |
