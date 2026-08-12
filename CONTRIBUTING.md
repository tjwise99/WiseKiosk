# Contributing to WiseKiosk

The human contributor entry point: how to run the checks and how a change gets merged. For **what
WiseKiosk is**, start at the [README](README.md); for **what it must do**, the specification is the
requirements tree, [`docs/requirements/`](docs/requirements/README.md). The index at
[`docs/README.md`](docs/README.md) names every document and the kind of fact each one guarantees.
Working rules for an AI agent are layered on top in [`CLAUDE.md`](CLAUDE.md).

## Before you build anything

This project is **design-first**: nothing is implemented that has not been written down first.

- A change with a real rejected alternative gets an [ADR](docs/decisions/README.md).
- Anything observable the tree does not already state — an interface name, a payload shape, a config
  key, a failure behaviour, a threshold — is written down as a requirement before it is built.
- A new module follows [`docs/contracts/module-contract.md`](docs/contracts/module-contract.md),
  which is the contract itself, and the test obligations in [`docs/TESTING.md`](docs/TESTING.md).
- Do not build generality against a case that does not exist — no plugin system, no abstraction
  without a second consumer, no transport chosen before the access pattern, no comment-enforced
  invariants, no denylist secret handling, no non-tunable config keys, no controls that do not
  function where deployed.

## Running the checks

Everything CI runs is available locally through [`just`](https://github.com/casey/just):

```sh
just              # list recipes
just verify       # run every check the PR gate runs
```

Once per clone, `just install-hooks` points git at the repo's hooks (`.githooks/`, plain sh +
grep — no toolchain needed): an advisory
`commit-msg` check and a `pre-push` branch check, so the process gates fire before CI does.

`just --list` is the gate roster: every check, with what it asserts beside the recipe that runs it.
What each gate is allowed to let through, and why, is [`docs/CI.md`](docs/CI.md); the review
fingerprint `check-reqs` can stamp is
[`docs/requirements/README.md`](docs/requirements/README.md).

## Tickets, branches, and titles

Enforced by the `process` CI check ([ADR 0006 rev 2](docs/decisions/0006-process-gates.md)):

- **Ticket first.** Open an issue from one of the templates before branching; the branch embeds
  its number.
- **Branch names** follow `type_number-snake_name`, e.g. `task_27-process_gates` — `type` is the
  issue-template set (`task`, `bug`, `design`, `module`), `number` the issue's number, the name
  lowercase snake_case. `main` and Dependabot branches are exempt.
- **PR titles are Conventional Commits** (`feat: …`, `fix(scope): …`) — the repo squash-merges, so
  the title becomes the commit on `main`. Branch commit messages are advised on locally by the
  `commit-msg` hook but not gated in CI.
- **The PR's Development field must link its ticket** — link the issue there (a `Closes #N` body
  keyword writes the same record on default-base PRs; on integration/epic bases link manually).
  The CI gate checks GitHub's recorded linkage on every open PR; the linked ticket closes when
  the work merges into `main`.

## Getting a change merged

- Size a change by what can be **read in one sitting**. A slice that cannot be reviewed has not been
  reviewed, whatever its size.
- Keep the diff scoped to intended files only.
- Verify via CI, not by trusting a local run.
- Walk the review checklist below against the diff.
- **Squash-merge, with the branch's commit messages concatenated into the body** —
  `git log --reverse --format='--- %h %s%n%b' <base>..<head>`. The squash is what makes the PR title
  the commit on `main`; without the bodies beneath it, the reasoning recorded per commit is
  unreachable by `git log -S` on the line it explains.

## Review checklist

Each question below is an obligation on the author that leaves no artifact, so no check decides it —
the reviewer is the mechanism ([ADR 0011 rev 1](docs/decisions/0011-requirement-or-convention.md)). The
[pull-request template](.github/pull_request_template.md) points here; it does not repeat the
questions.

**Cite a question by number *and* name** — `question 8, *Generality*`. The numbers shift whenever one
is inserted rather than appended, and a bare number then resolves silently to whatever now occupies
it, in documents no sweep reliably reaches: a citation whose number wrapped across a line break
already escaped one. The name is what a reader can still resolve when the number has moved.

**Documentation**

1. **Formalised prose.** Where the change turns a prose obligation into a requirement, does the prose
   cite that requirement instead of stating the obligation as independent normative text?
2. **Described code.** Where the change touches code or configuration that a canonical document
   describes, does it update that document, or declare in the change that no update is needed? The
   [documentation index](docs/README.md) says which document describes what.
3. **Temporal phrasing.** Does the prose state the timeless fact rather than a change — no *now*, *no
   longer*, *as of*? A sentence about what the repository used to do is stale as written.
4. **Architecture links.** Where an architecture element gains an implementation, does its model
   `link` point at the source that implements it?

**Comments**

5. **Mechanism, not reason.** Does each comment the change adds or edits state what the code or
   configuration does, or how it does it? Reason, history and evaluative judgement are authored in a
   documentation home and cited from the comment.
6. **Citation, not restatement.** Where a comment reaches rationale, strip the cited identifier out
   of it. If any assertion still stands on its own, the comment restates rather than cites.

**Code**

7. **Dependencies.** Does a new dependency do work the standard library cannot reasonably do — and
   what does it pull in with it: a native toolchain, a transitive tree, a runtime?
8. **Generality.** Does the change introduce an interface or extension point with a single
   implementation and no second consumer?
9. **Secrets.** Does any output path the change adds — a response body, a response header, a log
   line — carry a secret's value rather than its name?
10. **Unjudged input.** Where the change adds or edits a check, what does it do with input outside
    the set it recognises — a value absent from its lookup, a directory entry it never stats, a file
    extension it does not glob? Skipping is the language's default and it is always wrong for a gate:
    the check shrinks its own population and then reports success over what is left.
11. **Narrowed guards.** Where the change narrows a check so it stops rejecting legal input, is the
    narrowing itself reachable by the defect the check exists to catch? An exemption written to
    prevent a false positive is the first place a bypass gets spelled, and the reasoning that
    produces one reads as caution.
12. **Languages.** Does the change author a program in a language outside the set
    [ADR 0017 rev 3](docs/decisions/0017-authored-language-set.md) states — and if so, has that language
    been through an ADR?
13. **Second enforcer.** Does the change add a second place that enforces a rule an ADR allocated to
    one — today, the configuration schema, validated in the page alone
    ([ADR 0007 rev 2](docs/decisions/0007-config-validation-allocation.md))? A second enforcer drifts
    from the first, and the divergence surfaces as one accepting what the other rejects. That instance
    is an example and not the subject: nothing enumerates the ADRs allocating a rule to one place, so
    a list here would be wrong as soon as another one does. This is the mirror of question 8,
    *Generality*, rather than a case of it — that one asks about a single implementation serving no
    second consumer, this one about a second implementation of one rule, and a change can pass either
    while failing the other.

**Requirements**

14. **Module universals.** Where the change adds or edits a module's requirements, does any of them
    state something already obliged of every module — failure rendering, secret delivery, caching,
    request rejection? A module's requirements carry what is true of that module and nothing else
    ([ADR 0012 rev 1](docs/decisions/0012-module-requirements-in-tree.md)).
15. **Named resources.** Does a requirement the change adds or edits name a file, endpoint, package
    or tool rather than stating the property the software must have? A requirement naming one has
    swallowed a design decision, which then cannot change without a specification change.

**Checks**

16. **Recorded cases.** Where the change adds or edits a check, does
    [`scripts/README.md`](scripts/README.md) record what it was run against, in both directions — the
    defect it must catch, and the legal input it must not reject? A check's own green run is not
    evidence it works, which is why that record exists. **Seed the defect and name the commit each
    case ran against.** A row pointing at what the tree happens to hold is true until the tree moves
    and then reads as a passing check that should fail, with nothing to say which.
17. **Defects the work surfaced.** Where the work exercised an existing check and found it **fails to
    catch what it exists to catch, admits what it exists to reject, or reports a result its input
    cannot support**, is that fixed here? A check is verified by whoever was placed to see it fail,
    and deferring that to a ticket separates the fix from the only context in which the defect was
    visible. You write the cases for a check as you write the check; a defect found in one is the
    same obligation arriving late. The three clauses are the floor: below them this is a licence to
    change anything nearby, which is the failure mode question 11, *Narrowed guards*, describes from the
    other side.

**Architecture**

18. **Tag placement.** Where the change adds, moves or removes a requirement tag in the architecture
    model, is the subject it sits on the one that requirement obliges, rather than an existing element
    the tag is merely plausible on? No check decides this, and both of them read as green either way: a
    tag renders nowhere, so `check-arch` compares artifacts a move leaves byte-identical, and
    `check-arch-trace` asks only that every accepted item is tagged somewhere
    ([ADR 0019 rev 4](docs/decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). An item that can
    bind nowhere is a level the model has not drawn, never a tag parked on the nearest subject that
    already exists. It is appended rather than placed beside question 4, *Architecture links*, which it
    most resembles, only to spare the renumbering — not because anything forbids inserting one.
    [ADR 0017 rev 3](docs/decisions/0017-authored-language-set.md) dropped that constraint: a citation
    carries the question's name beside its number, so a renumbered one still names what it meant.

**Prose**

Both of these are failures of sentences rather than of code, and both are invisible to every gate:
prose is compared to nothing. They are appended for the reason question 18 is.

19. **Counted claims.** Does a sentence the change adds state a count, a roster, or an absolute about
    the tree — *every*, *no*, *neither*, *three and five* — that nothing compares to the tree? Such a
    sentence is true when written and silently false afterwards. **The test is who falsifies it:** a
    claim ordinary work elsewhere breaks — adding a module, accepting a requirement, drawing an
    element — is the failure, because nobody doing that work opens the document they just made wrong.
    A claim about a gate or a tool is not, since changing that is work on the subject the sentence
    describes, done by someone reading it. Prefer the rule that decides the next case to an inventory
    of the current ones; where a count is the point, name the commit it was taken at, and say when a
    list is examples rather than the set.
20. **Untested premises.** Where the change accommodates a reason an existing document gives — a
    constraint it records, a limitation it accepts, a rejected alternative — has that reason been
    tested against the tree, or only read? Testing it is usually cheaper than the accommodation, and
    a stated reason that no longer holds is how a workaround gets written for a problem nobody has.
    A document's own reason is the last place a reader thinks to doubt, which is what makes this
    worth asking rather than trusting.
