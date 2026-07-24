# Documentation index

Every fact about WiseKiosk has exactly one canonical home (SYS037): a document that guarantees it.
Every other document may cite or summarize that fact, but never restates it as independent content
(SRS doc-taxonomy-table). This table is that referenceable definition.

| Document | Guarantees | Excludes |
|---|---|---|
| [`FOUNDATIONS.md`](FOUNDATIONS.md) | Product definition, settled decisions, day-one architecture (a design hypothesis), the module contract, non-goals. Standalone rationale. | As-built structure (`ARCHITECTURE.md`); a decision's rejected alternative (an ADR); a testable "shall" obligation (the requirements tree) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The as-built structural description of the system, and its generated diagrams | The intended/hypothetical architecture before code lands (`FOUNDATIONS.md` §3); decision rationale with a rejected alternative (an ADR) |
| [`TESTING.md`](TESTING.md) | The test architecture — tiers, standing obligations, coverage stance, review cadence — written as a specification before tests exist | Individual test implementations; per-requirement traceability (the requirements tree) |
| [`decisions/`](decisions/README.md) | A decision with a rejected alternative, numbered chronologically, immutable once merged | A decision with no real alternative considered (belongs in a commit message); restated settled-decision prose (`FOUNDATIONS.md` §2 cites these, never restates them) |
| [`requirements/`](requirements/README.md) | Testable "shall" obligations; SYS→SRS→TST traceability; verification-reference gating (Doorstop) | Prose rationale narrative (the documents above); presentation or browsing (the docs site) |
| [`site/`](site/README.md) | A browsable, click-through presentation of the documents above, plus traceability views (needtables, matrices) | Being a source of truth — a generated view only, never original content |
