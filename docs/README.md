# Documentation index

Every fact about WiseKiosk has exactly one canonical home: a document that guarantees it. Every other
document may cite or summarize that fact, but never restates it as independent content. This table is
that referenceable definition, and [`CI.md`](CI.md)'s documentation-integrity gates hold it to that:
a citation resolves, and the index's row set agrees with the tracked canonical-document list.

The scope is facts *about WiseKiosk*. How a particular piece of code works is a fact about that code,
not about the product — it has no home in this table and belongs beside the code it explains.
Rationale is the part that may not live in a source artifact;
[`CONTRIBUTING.md`](../CONTRIBUTING.md)'s review checklist is where that is caught — whether a
comment states mechanism rather than reason, and whether a citation restates what it cites.

| Document | Guarantees | Excludes |
|---|---|---|
| [`../README.md`](../README.md) | The product definition and orientation: what WiseKiosk is, the module roster, who operates it and why that constraint outranks the others, the minimum specs, and the entry point to every other document. Cites the SYS items that make each claim normative | A testable "shall" obligation (the requirements tree); a decision's rejected alternative (an ADR); as-built structure (`ARCHITECTURE.md`) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The as-built structural description of the system, and its generated diagrams | The intended shape of a component before code lands (the requirements tree); decision rationale with a rejected alternative (an ADR) |
| [`TESTING.md`](TESTING.md) | The test architecture — tiers, standing obligations, coverage stance, review cadence — written as a specification before tests exist, and the rationale for those choices | Individual test implementations; per-requirement traceability (the requirements tree); a test-strategy decision with a rejected alternative (an ADR) |
| [`CI.md`](CI.md) | **Every check on the repository**: what CI provides, what blocks a merge, what each gate is allowed to let through, and the reasoning for each stance. The canonical home for a repository-facing check — it constrains the repository, so no requirement states it | An obligation on the running software (the requirements tree); a check a machine cannot decide (`../CONTRIBUTING.md`'s review checklist); which tier a test belongs to (`TESTING.md`) |
| [`decisions/`](decisions/README.md) | A decision with a rejected alternative, numbered chronologically, immutable once merged | A decision with no real alternative considered (belongs in a commit message); an obligation on the running software (the requirements tree) |
| [`requirements/`](requirements/README.md) | **The specification.** Every testable "shall" obligation the system is built against; SYS→SRS→TST traceability; verification-reference gating (Doorstop); each item's own `rationale` for why that obligation exists | Product orientation and prose rationale *narrative* (the documents above); presentation or browsing (the docs site) |
| [`../tools/README.md`](../tools/README.md) | **Every tool that ships alongside WiseKiosk**: what each one must do and what asserts it — the validator, the generator, the bring-up procedure. The canonical home for an obligation on a program an operator runs rather than on the kiosk itself | An obligation on the running software (the requirements tree); a check CI runs (`CI.md`); a decision with a rejected alternative (an ADR) |
| [`contracts/`](contracts/module-contract.md) | The canonical, self-contained statement of a contract an author follows by hand: what its parts are, what adding one involves, and the shapes it does not fit — the six-part module contract | A testable "shall" obligation (the requirements tree); the per-module test obligations (`TESTING.md`); a decision with a rejected alternative (an ADR) |
| [`site/`](site/README.md) | A browsable, click-through presentation of the documents above, plus traceability views (needtables, matrices) | Being a source of truth — a generated view only, never original content |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How a change gets made and merged, and **the design-first rule**: nothing is implemented that has not been written down first. The canonical home for that rule — it governs the process, so no requirement states it | What the system must do (the requirements tree); what WiseKiosk is (`../README.md`); working rules specific to an AI agent (`../CLAUDE.md`) |
| [`../SECURITY.md`](../SECURITY.md) | The threat model and how to report a vulnerability | Product or deployment truth (`../README.md`); the security obligations themselves (the requirements tree) |
| [`../CLAUDE.md`](../CLAUDE.md) | Working rules layered on top for an AI agent — review independence, halt-and-ask, verification discipline | Any fact about WiseKiosk (every document above); a testable obligation (the requirements tree) |
