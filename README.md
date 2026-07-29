# WiseKiosk

A config-driven smart-mirror display. A full-screen browser page renders a fixed set of five
modules — `clock`, `compliments`, `OpenMeteo` weather, `AviationWeather` (CheckWX METAR/TAF), and
`DisneyWaitTimes` (themeparks.wiki) — from a handful of public APIs, running unattended on a display
behind one-way glass. The layout is fixed (SYS002, SRS017) and there is nothing to interact with:
it renders and it refreshes.
Shipped as one container image; each deployment is
independent, customised through configuration, never through a fork (SYS003). A sixth module is
added by the documented six-part contract in
[`docs/contracts/module-contract.md`](docs/contracts/module-contract.md).

**What WiseKiosk does not own.** The kiosk host lies outside the system: its operating system, its
browser, and whatever starts that browser on boot. WiseKiosk delivers a container image and the
recipe for running it; provisioning the machine that runs it is the operator's, and no requirement
in the tree reaches it.

**The operator is frequently not the author.** Deployments run at the author's house and at friends'
and family's houses — separate networks, separate configs, separate owners. This constraint outranks
every other requirement here: it is why a bad configuration must fail loudly and legibly rather than
as a blank screen (SYS001), and why a configuration must be validatable before deployment rather than
only at boot ([`tools/README.md`](tools/README.md)).

Nothing is inherited from any prior mirror framework, and there is no compatibility layer.

> **Status: bootstrapping (pre-code).** The specification is written; no application code exists yet.

## Stack

- **Backend:** Go — a thin, stateless REST proxy. See [ADR 0001](docs/decisions/0001-backend-language-go.md).
- **Frontend:** Svelte 5 + Vite, a static SPA.
- **Boundary:** one schema, both sides generated from it — no hand-maintained parallel types.

## Documentation

**The requirements tree is the specification.** Every obligation WiseKiosk is built against is a
numbered item in [`docs/requirements/`](docs/requirements/README.md) — system needs (`SYS`)
decomposed into testable "shall" statements (`SRS`), each traced to a verification item (`TST`), with
CI failing on a broken chain. If a statement is normative, it has an ID. The documents below mostly
explain, orient, and cite rather than oblige.

- [`docs/README.md`](docs/README.md) — the documentation index: which document guarantees which kind
  of fact, and what each one excludes. Read this before adding to any document.
- [`docs/requirements/`](docs/requirements/README.md) — the specification, and how the tree is gated
  ([ADR 0002](docs/decisions/0002-requirements-management-doorstop.md),
  [ADR 0005](docs/decisions/0005-traceability-gating.md)).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the living description of the system as built
  (a skeleton until code lands).
- [`docs/TESTING.md`](docs/TESTING.md) — the test architecture, written as a specification before any
  tests exist.
- [`docs/decisions/`](docs/decisions/README.md) — the decisions that carried a rejected alternative.
- [`docs/contracts/module-contract.md`](docs/contracts/module-contract.md) — the six-part contract
  for adding a display module.
- [`docs/CI.md`](docs/CI.md) — every check on the repository: what CI provides, what blocks a merge,
  and what each gate is allowed to let through. None of it is a requirement — it constrains the
  repository, not the running system.
- [`tools/README.md`](tools/README.md) — what ships alongside WiseKiosk to stand a deployment up:
  the validator, the generator, bring-up and upgrade. Separate programs an operator runs, so their
  obligations are here rather than in the tree.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — running the checks and getting a change merged.
