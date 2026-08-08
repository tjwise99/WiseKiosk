# 0017 — Authored language follows the artifact's audience: Go and TypeScript ship, Python checks the repository

**Status:** accepted
**Decided:** 2026-08-04 (#60 authored-language set, taken after
[ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) settled which authored checks survive at all)
**Rev:** 2

## Revisions

- **rev 2** — 2026-08-05 — names revving rather than amendment as the route a later decision takes; the language set is unchanged (#118 ADR revisions).
- **rev 1** — 2026-08-05 — revision tracking begins; text as merged (#118 ADR revisions).

## Context

The product's languages were decided. Go is [ADR 0001 rev 1](0001-backend-language-go.md); the frontend is
[ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md); the boundary types are generated into both by
[ADR 0008 rev 1](0008-boundary-contract-openapi-codegen.md). The languages the *repository* is written in were
never decided at all. Programs are authored here in POSIX sh, in Node ESM and in Python, none of
those by anyone's choice, and the next contributor could add a fourth without meeting an argument.

Two things make an unbounded set expensive rather than merely untidy.

**Each language is a standing obligation, not a one-off.** The comment-discipline gate `CI.md`
describes (#59 comment-discipline gate) decides which comments belong to a language's documentation
facility, which costs a classifier arm and a fixture suite per language, and its coverage registry
fails on a language that has neither. A set nobody bounded is an obligation nobody can size.

**One of the candidates is already owed and the other is not.** Python is unconditional here for
reasons that have nothing to do with checks: Doorstop ([ADR 0002 rev 1](0002-requirements-management-doorstop.md))
and Sphinx ([ADR 0004 rev 1](0004-docs-site-sphinx-needs.md)) both require it, and CI installs it for two jobs
whatever the check scripts are written in. Nothing obliges Node in the repository-checks layer at
all — all seven `.mjs` scripts import only `node:fs`, `node:child_process` and `node:path`, and five
carry a header comment recording that they deliberately scan plain text rather than reach for a
parser, three of them naming the YAML parser they avoid. Consolidating the checks on Python therefore
adds no toolchain and takes Node out of that layer; consolidating them on Node would keep both there
indefinitely. Node does not leave the repository either way — LikeC4
([ADR 0003 rev 1](0003-architecture-as-code-likec4.md)) and Vite
([ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md)) make it unconditional as an invoked toolchain. The
asymmetry is about which layer owes which interpreter, not about which language is present.

Symmetrically, every one of the six Python check scripts imports `doorstop` or `yaml`, so the split
at the time of this decision is exactly *reads the requirements tree* against *does not*. The Node
dependency is habit; the Python one is the Doorstop silo.

## Decision

**Language follows the artifact's audience.** What this decides is the languages a contributor
authors **programs** in.

| Artifact | Authored in |
|---|---|
| What ships to a user or an operator — the kiosk, and the tools an operator runs | Go, TypeScript, and the Svelte component format ([ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md)) |
| What checks this repository | Python, standard library only |

**Everything else present in the tree is derived, not enumerated.** A toolchain's own required input
format — its configuration, its model, the items it stores — is part of invoking that toolchain
rather than authoring in it. The workflow YAML, the Doorstop item files under `docs/requirements/`,
the `.likec4` models, a `lychee` TOML, a `commitlint` configuration and the Dockerfile a container
build will need are each that, and so is `docs/site/conf.py`, which is Python because Sphinx's
configuration format is Python. The `justfile` is the same thing for `just`, which is why
[`../CI.md`](../CI.md)'s no-shebang rule matters here: it is what keeps a recipe a list of commands
rather than a shell script wearing a recipe's clothes.

**A program embedded in a derived format is still an authored program**, and the rule above reaches
it: a workflow `run:` block or a hook `entry:` carrying control flow is authored sh whatever file it
sits in. Only the `justfile` leg of this has a check behind it; the rest is the reviewer's, under
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) review checklist item 12, and it is the one place
where this decision's reason for refusing a gate — that a new language is a new file extension, the
loudest thing in a diff — does not hold.

Nothing above needs revising when a tool arrives with a format not yet seen here — which is the
point, since [ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) adopts four such tools.

**Documentation, and the assets a documentation build serves, are not authored programs and this
decision does not reach them.**

**Node is an invoked toolchain and never an authoring language.** LikeC4
([ADR 0003 rev 1](0003-architecture-as-code-likec4.md)) and Vite are invoked; so is whatever an adopted hook
provisions for itself. The distinction is who wrote the code being run.

**POSIX sh authors nothing.** The rule that admitted it — sh only where no interpreter can be
assumed — had `.githooks/` as its entire population, and
[ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) retires those for `pre-commit`, which is
itself Python. A rule with no subject is not kept for the one file that predates it.

**TypeScript is product-only.** Extending it to repository tooling would leave the runtime, the
toolchain and the classifier arm exactly as they are, so the exclusion of JavaScript would become a
rule about file extensions.

**Scripts that read the requirements tree run in the Doorstop silo venv and may use its libraries.**
That is [`../CI.md`](../CI.md)'s tooling-siloed-with-the-feature rule reaching this decision, not a
carve-out from it: the silo is what makes `doorstop` and `yaml` available, and it is why a check that
reads the tree is a different artifact from one that reads the repository.

**The artifacts that did not conform when this was decided each carry a disposition rather than an
exemption:** `scripts/check-branch.sh` converts (#109 check-branch conversion); the four index, silo
and splice checks in Node convert (#110 Node check conversion); `scripts/check-verify-ci-parity.mjs`
waits on #101 CI invoking just recipes directly, because that ticket may delete it (#111 parity-check
conversion); and `scripts/validate-tree.sh` is **deleted rather than converted**, by #78 retire the
pending-TST-tier exception, which drops the wrapper and restores the bare `doorstop` call it stands
in for. Tree validation is not what goes; the exception is.

**#78 is committed but unscheduled, and that has a cost worth stating:** it fires when the first
`TST` item activates, so until then sh remains an authored language in this tree for one 34-line
file — a classifier arm and its fixtures, which is exactly the price the grandfathering alternative
was rejected for paying. The disposition is deletion rather than conversion because converting a
script another ticket deletes is the waste this decision's own sequencing avoids elsewhere; the cost
is accepted, not overlooked. The difference from grandfathering is that this ends, and #78 is where
it is decided that it has not — if that ticket stalls, conversion is the remedy and this record needs
no rev for it.

That list is a snapshot taken on the decision date, not a standing inventory — no check compares it
against the tree, and the rule above is what governs anything written after it.

**Nothing here is gated.** A language outside this set is a decision with a rejected alternative, so
it arrives as a rev of this record or an ADR superseding it, and the reviewer is the mechanism —
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) review checklist item 12, added with this record.
#59 comment-discipline gate's coverage registry is **not** this decision's enforcement: it exists so
that gate cannot go silently blind on a language it has no arm for, and it would fail-closed on an
unregistered language whatever this record said.

## Alternatives considered

- **Leave it unbounded — whatever language suits the job.** The status quo, and its argument is real:
  every script here is short, each was written in whatever fit, and no defect has been traced to the
  spread. Rejected because the cost is not in the writing. It is one classifier arm and fixture suite
  per language for #59 comment-discipline gate, a toolchain per language in CI and in any hook, and a
  reader who must know four languages to review a check. Those are paid per language, forever, by
  whoever comes next.
- **Bound the set but grandfather the existing sh and Node scripts.** The honest-sounding compromise,
  and the one the ticket expected: they work, they have recorded cases, and rewriting working gates
  to satisfy a policy is churn. Rejected on arithmetic. #59's registry resolves per *tracked file*, so
  a single grandfathered `.sh` still buys sh a classifier arm and its fixtures — the language's full
  price with none of the bound. Grandfathering saves the rewrite and forfeits the reason for it.
- **A carve-out for `scripts/splice-arch-diagrams.mjs`**, which runs only inside `check-arch` and so
  is siloed with the LikeC4 toolchain it serves — the same reasoning that admits the Doorstop venv
  above. Rejected by the arithmetic in the line above: it saves 79 lines of conversion and gives up
  the bound, because the language stays in the registry either way. The Doorstop exception survives
  the same test only because it is about *libraries a silo provides*, not about a second authoring
  language.
- **Enumerate every permitted format instead of deriving them.** Rejected: an enumeration would need
  revising the first time an adopted tool brings a configuration format, and
  [ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) adopts four tools that bring TOML and a
  JavaScript-or-JSON-or-YAML configuration between them. An ADR revved one ticket after it is written
  was written too early.
- **Gate the set with a check.** Machine-decidable, and [ADR 0011 rev 1](0011-requirement-or-convention.md)
  routes a machine-decidable convention to a check — which is why this was the drafted answer.
  Rejected: a new authored language usually arrives as a new file extension in a diff's file list,
  which is the loudest thing a review sees — the embedded case named in the Decision above is the
  exception, and it is a residue rather than the population — and
  [ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) had just ruled that one residual obligation
  does not earn a gate of its own. The two work in sequence rather than in parallel — the first sizes
  the case as a residue, which is the condition under which the second reaches it at all. The
  checklist question is what 0011 requires so the obligation is not a dead letter; a gate on top of it
  would be ceremony.

## Consequences

- **822 lines of working check convert** across #109, #110 and #111 — 145 in sh, 677 in Node. Each is
  verified by re-running the cases [`../../scripts/README.md`](../../scripts/README.md) records for
  the original, in both directions, because a conversion that is verified by inspection is a rewrite
  with a clean-looking diff.
- **`check-branch` loses `curl` and `jq` for `urllib` and `json`.** [ADR 0006 rev 2](0006-process-gates.md)'s
  *plain sh + curl + jq — no toolchain* property, already corrected by
  [ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) when `commitlint` and `pre-commit` were
  adopted, ends completely. What replaces it is a weaker but real property: the interpreter the gates
  need is one this repository already owes for its requirements tree and its documentation site.
- **A check that wants logic already written in TypeScript must reimplement it in Python or shell out
  to the frontend toolchain.** No check does; a configuration-schema check that wanted to
  reuse the validation engine of [ADR 0007 rev 2](0007-config-validation-allocation.md) would be the first, and
  it would be a real cost when it arrives.
- **#59 comment-discipline gate's registry gets a bounded population** — the authored languages above,
  plus formats that arrive derived rather than chosen, each of which needs an arm or a recorded
  exclusion under that gate's own rule. Bounded is the claim, not small: what the bound buys is that
  the population changes only by an ADR.
- **No requirement item states any of this.** The decision constrains the repository, and
  [ADR 0011 rev 1](0011-requirement-or-convention.md) makes a repository constraint a check or a checklist
  question, never a tree item.
- **The review checklist gains a twelfth question**, appended to its *Code* section rather than placed
  beside the dependency question it most resembles. Inserting it there would renumber the questions
  below it, and [ADR 0002 rev 1](0002-requirements-management-doorstop.md),
  [ADR 0003 rev 1](0003-architecture-as-code-likec4.md) and
  [ADR 0016 rev 3](0016-maintained-tools-for-standard-artifacts.md) each cite one by number with nothing gating
  the citation.

**Premise that would reopen this:** an artifact appears that neither audience covers — something that
must run where neither Python nor a shipped toolchain is reachable — or Python stops being
unconditional here, which means both Doorstop ([ADR 0002 rev 1](0002-requirements-management-doorstop.md)) and
Sphinx ([ADR 0004 rev 1](0004-docs-site-sphinx-needs.md)) leaving. A single script that would have been shorter
in another language is not that premise; it is the argument this decision rejected. Absent either, do
not relitigate.
