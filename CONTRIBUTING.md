# Contributing to WiseKiosk

The human contributor entry point: how to run the checks and how a change gets merged. **What
WiseKiosk is** is the [README](README.md); **what it must do** is the requirements tree,
[`docs/requirements/`](docs/requirements/README.md); which document holds which kind of fact is the
index at [`docs/README.md`](docs/README.md). Working rules for an AI agent are in
[`CLAUDE.md`](CLAUDE.md).

## Before you build anything

**Design-first: nothing is implemented that has not been written down first.** A change with a real
rejected alternative gets an [ADR](docs/decisions/README.md). Anything observable the tree does not
state — an interface name, a payload shape, a config key, a failure behaviour, a threshold — becomes a
requirement before it is built. A new module follows
[`docs/contracts/module-contract.md`](docs/contracts/module-contract.md) and the test obligations in
[`docs/TESTING.md`](docs/TESTING.md).

**Do not build generality against a case that does not exist** — no plugin system, no abstraction
without a second consumer, no transport chosen before the access pattern, no comment-enforced
invariants, no denylist secret handling, no non-tunable config keys, no controls that do not function
where deployed.

## Running the checks

```sh
just               # the gate roster: every check, beside what it asserts
just verify        # every check the PR gate runs that has a local form
pre-commit install  # once per clone: advisory hooks at commit and push (.pre-commit-config.yaml)
```

What each gate is allowed to let through, and why, is [`docs/CI.md`](docs/CI.md). `pre-commit
install` refuses while `core.hooksPath` is set — a clone carrying that config runs
`git config --unset core.hooksPath` first.

## Tickets, branches, and titles

Open an issue from a template first: the branch name is derived from it. Enforced by the `process` CI
check ([ADR 0006 rev 3](docs/decisions/0006-process-gates.md)). The `branch-shape` pre-push hook
from `pre-commit install` checks the shape only — not the issue conditions below — and only at push, when
the branch and its commits already exist. **Nothing checks the name at `git switch -c`**, which is
where it is chosen and where it goes wrong, so this section is in the file
[`.claude/settings.json`](.claude/settings.json) injects at session start.

```
design_119-c4_model_completion
└──┬──┘ └┬┘ └────────┬────────┘
   │     │           └─ lowercase snake_case
   │     └─ the issue's own number
   └─ task | bug | design | module — the issue's template, and its label
```

`main` and Dependabot branches are exempt. Every other branch must also satisfy all of:

- the issue is **open**, **milestoned**, and carries **exactly one** type label — a second one makes
  the branch type ambiguous ([ADR 0013 rev 3](docs/decisions/0013-work-tracking-invariants.md));
- its **parent matches the PR base** — a sub-issue's PR targets its integration branch, a top-level
  issue's targets `main`, and the gate asserts that in both directions;
- the PR's **Development field links the ticket**: `Closes #N` in the body writes that record on a
  default-base PR, an integration or epic base needs it linked by hand.

**PR titles are Conventional Commits** — the repo squash-merges, so the title becomes the commit
on `main`.

## Getting a change merged

Size a change by what can be **read in one sitting** — a slice that cannot be reviewed has not been,
whatever its size. Keep the diff to intended files. Verify via CI, not a local run. Walk the checklist
below against the diff.

**Squash-merge, with the branch's commit messages concatenated into the body** —
`git log --reverse --format='--- %h %s%n%b' <base>..<head>`. The squash makes the PR title the commit
on `main`; without the bodies beneath it, the reasoning recorded per commit is unreachable by
`git log -S` on the line it explains.

## Review checklist

Each question is an obligation on the author that leaves no artifact, so no check decides it — the
reviewer is the mechanism ([ADR 0011 rev 1](docs/decisions/0011-requirement-or-convention.md)). The
[pull-request template](.github/pull_request_template.md) points here rather than repeating them.

**Cite a question by number *and* name** — `question 8, *Generality*`. A bare number resolves silently
to whatever occupies it after a renumber, in documents no sweep reliably reaches. New questions are
appended for the same reason; inserting one is permitted
([ADR 0017 rev 5](docs/decisions/0017-authored-language-set.md)) and renumbers everything below.

**Documentation**

1. **Formalised prose.** Where the change turns a prose obligation into a requirement, does the prose
   cite that requirement rather than restate it as independent normative text?
2. **Described code.** Where the change touches code or configuration a canonical document describes,
   does it update that document, or say why none is needed? The [index](docs/README.md) says which
   document describes what.
3. **Temporal phrasing.** Does the prose state the timeless fact — no *now*, *no longer*, *as of*?
4. **Architecture links.** Where an architecture element gains an implementation, does its model
   `link` point at the source implementing it?

**Comments**

5. **Mechanism, not reason.** Does each comment state what the code or configuration does, or how?
   Reason, history and judgement are authored in a documentation home and cited from the comment.
6. **Citation, not restatement.** Strip the cited identifier out of a comment: if any assertion still
   stands on its own, it restates rather than cites.

**Code**

7. **Dependencies.** Does a new dependency do work the standard library cannot reasonably do — and
   what does it bring with it: a native toolchain, a transitive tree, a runtime?
8. **Generality.** Does the change add an interface or extension point with a single implementation
   and no second consumer?
9. **Secrets.** Does any output path the change adds — response body, header, log line — carry a
   secret's value rather than its name?
10. **Unjudged input.** What does a check the change touches do with input outside the set it
    recognises? Skipping is the language's default and always wrong for a gate: the check shrinks its
    own population, then reports success over what is left.
11. **Narrowed guards.** Where the change narrows a check so it stops rejecting legal input, is the
    narrowing reachable by the defect the check exists to catch? An exemption is the first place a
    bypass gets spelled, and the reasoning that produces one reads as caution.
12. **Languages.** Four things `check-languages` states it cannot reach
    ([ADR 0017 rev 5](docs/decisions/0017-authored-language-set.md)), each one yours. Does the change
    author a program for the wrong audience — a repository check in TypeScript passes on a declared
    extension? Is any file's content something other than the kind its path declares? Does it author
    control flow inside a derived format, a workflow `run:` block or a hook `entry:`, where no
    extension changes at all? And does a new entry in that check's declared **or grandfathered** set
    arrive with the revision of that record deciding it? The grandfather list is the cheaper of those
    two, needing no new extension at all.
13. **Second enforcer.** Does the change add a second place enforcing a rule an ADR allocated to one —
    today the configuration schema, validated in the page alone
    ([ADR 0007 rev 2](docs/decisions/0007-config-validation-allocation.md))? Two enforcers drift, and
    the divergence surfaces as one accepting what the other rejects. That instance is an example:
    nothing enumerates the ADRs allocating a rule to one place, so a list here would be wrong as soon
    as another one does.

**Requirements**

14. **Module universals.** Does a module requirement the change adds or edits state something already
    obliged of every module — failure rendering, secret delivery, caching, request rejection? A
    module's requirements carry what is true of that module and nothing else
    ([ADR 0012 rev 2](docs/decisions/0012-module-requirements-in-tree.md)).
15. **Named resources.** Does a requirement name a file, endpoint, package or tool rather than the
    property the software must have? Naming one swallows a design decision into the specification,
    where it cannot change without a specification change.

**Checks**

16. **Recorded cases.** Does that check's file under [`scripts/cases/`](scripts/README.md) record what it was
    run against, in both directions — the defect it must catch, and the legal input it must not
    reject? Seed the defect and name the commit each case ran against: a row pointing at what the tree
    happens to hold reads as a passing check that should fail, the moment the tree moves.
17. **Defects the work surfaced.** Where the work found an existing check **fails to catch what it
    exists to catch, admits what it exists to reject, or reports a result its input cannot support**,
    is that fixed here? Deferring it separates the fix from the only context the defect was visible
    in. Those three clauses are the floor, not a licence to change anything nearby — which is
    question 11, *Narrowed guards*, from the other side.

**Architecture**

18. **Tag placement.** Where the change adds, moves or removes a requirement tag in the architecture
    model, is the subject it sits on the one that requirement obliges, rather than an element the tag
    is merely plausible on? Both gates read green either way: a tag renders nowhere, so `check-arch`
    compares artifacts a move leaves byte-identical, and `check-arch-trace` asks only that every
    accepted item is tagged somewhere
    ([ADR 0019 rev 5](docs/decisions/0019-boundary-at-what-deploys-and-tag-tier.md)). An item that can
    bind nowhere is a level the model has not drawn.

**Prose**

19. **Counted claims.** Does a sentence the change adds state a count, a roster or an absolute about
    the tree that nothing compares to the tree? **The test is who falsifies it.** A claim that
    ordinary work elsewhere breaks — adding a module, accepting a requirement — is the failure,
    because nobody doing that work opens the document they just made wrong; a claim about a gate is
    not, since changing one is work on the subject, done by someone reading the sentence. Prefer the
    rule that decides the next case, and where a count is the point, name the commit it was taken at.
20. **Untested premises.** Where the change accommodates a reason an existing document gives — a
    constraint it records, a limitation it accepts — has that reason been tested against the tree, or
    only read? Testing it is usually cheaper than the accommodation, and a stated reason that no
    longer holds is how a workaround gets written for a problem nobody has.
21. **Rev reach.** Where the change revs an ADR, has each citation the sweep re-pinned **without
    touching the sentence around it** been read against what that rev actually changed?
    The `pre-push` hook prints them, per file and line, whenever a branch revs one; `just rev-reach`
    is the same list on demand. `just check-adr-revs` holds the pin and decides nothing about the
    claim. A rev that does not touch what a citation asserts is the ordinary case, so most of that
    list is sound — the failure is answering from having run the sweep rather than from having read
    it. **Separately, and whether or not the change revs anything: has a reflow left a citation split
    across a line break?** Both checks match within one line, so a citation wrapped after its keyword
    is invisible to each — permanently, not until the next sweep. Treat one as an unbreakable token
    when rewrapping a paragraph. Both splits found here were introduced by prose passes that revved
    no ADR at all, which is why this question does not sit behind the condition above.
22. **One home.** Is each fact the change states in prose stated in the document that guarantees it?
    The [index](docs/README.md) decides: a *Guarantees* cell is what a document may state, an
    *Excludes* cell is what it must cite instead. **The test is question 6 read one level up** — strip
    the citation out of the sentence, and if what remains still asserts what the cited document
    asserts, it restates rather than cites. Summarizing and citing is permitted; a second independent
    statement is what goes stale in one copy while the other stays right, with nothing comparing them.

**Decisions**

23. **Attributed decisions.** Does each decision the change records as settled — in an ADR's
    alternatives, a `rationale`, or prose — carry its owner attribution, or a direct quote where the
    owner ruled it? An unattributed decision reads as an owner ruling but may be a session's
    invention — the marker is [`docs/decisions/README.md`](docs/decisions/README.md)'s.

**Deletions**

24. **Orphaned names.** Where the change removes a recipe, check, or workflow step, does any
    operator-facing reference to its name survive that no gate reaches — a justfile `[doc()]`, a
    workflow step `name:`, `--help` text?
