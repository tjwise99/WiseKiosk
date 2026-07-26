# Documentation index

Every fact about WiseKiosk has exactly one canonical home (SYS011): a document that guarantees it.
Every other document may cite or summarize that fact, but never restates it as independent content
(SRS075). This table is that referenceable definition.

The scope is facts *about WiseKiosk*. How a particular piece of code works is a fact about that code,
not about the product — it has no home in this table and belongs beside the code it explains.
Rationale is the part that may not live in a source artifact; SYS011 and SRS087 state that obligation
and the homes it routes to.

| Document | Guarantees | Excludes |
|---|---|---|
| [`../README.md`](../README.md) | The product definition and orientation: what WiseKiosk is, the module roster, who operates it and why that constraint outranks the others, the deployment model, and the entry point to every other document. Cites the SYS items that make each claim normative | A testable "shall" obligation (the requirements tree); a decision's rejected alternative (an ADR); as-built structure (`ARCHITECTURE.md`) |
| [`FOUNDATIONS.md`](FOUNDATIONS.md) | The settled decisions, each with the premise that would reopen it. Standalone rationale for choices taken before the tree existed | Product definition (`../README.md`); as-built structure (`ARCHITECTURE.md`); a decision with a rejected alternative worth preserving (an ADR); a testable "shall" obligation (the requirements tree) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The as-built structural description of the system, and its generated diagrams | The intended shape of a component before code lands (the requirements tree); decision rationale with a rejected alternative (an ADR) |
| [`TESTING.md`](TESTING.md) | The test architecture — tiers, standing obligations, coverage stance, review cadence — written as a specification before tests exist, and the rationale for those choices | Individual test implementations; per-requirement traceability (the requirements tree); a test-strategy decision with a rejected alternative (an ADR) |
| [`decisions/`](decisions/README.md) | A decision with a rejected alternative, numbered chronologically, immutable once merged | A decision with no real alternative considered (belongs in a commit message); restated settled-decision prose (`FOUNDATIONS.md` cites these, never restates them) |
| [`requirements/`](requirements/README.md) | **The specification.** Every testable "shall" obligation the system is built against; SYS→SRS→TST traceability; verification-reference gating (Doorstop); each item's own `rationale` for why that obligation exists | Product orientation and prose rationale *narrative* (the documents above); presentation or browsing (the docs site) |
| [`contracts/`](contracts/module-contract.md) | The canonical, self-contained statement of a contract an author follows by hand: what its parts are, what adding one involves, and the shapes it does not fit — the six-part module contract | A testable "shall" obligation (the requirements tree); the per-module test obligations (`TESTING.md`); a decision with a rejected alternative (an ADR) |
| [`site/`](site/README.md) | A browsable, click-through presentation of the documents above, plus traceability views (needtables, matrices) | Being a source of truth — a generated view only, never original content |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How a change gets made and merged, and **the design-first rule**: nothing is implemented that has not been written down first. The canonical home for that rule — it governs the process, so no requirement states it | What the system must do (the requirements tree); what WiseKiosk is (`../README.md`); working rules specific to an AI agent (`../CLAUDE.md`) |
| [`../SECURITY.md`](../SECURITY.md) | The threat model and how to report a vulnerability | Product or deployment truth (`../README.md`); the security obligations themselves (the requirements tree) |
| [`../CLAUDE.md`](../CLAUDE.md) | Working rules layered on top for an AI agent — review independence, halt-and-ask, verification discipline | Any fact about WiseKiosk (every document above); a testable obligation (the requirements tree) |
