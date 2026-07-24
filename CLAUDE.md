# Agent working rules — WiseKiosk

Working conventions for an AI agent in this repo. **Project facts are not here.** The specification is
the requirements tree, [`docs/requirements/`](docs/requirements/README.md) — every normative
obligation is a numbered SYS/SRS/TST item there. Product definition lives in the
[README](README.md), settled decisions and their reopen premises in
[`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md), as-built structure in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), test strategy in [`docs/TESTING.md`](docs/TESTING.md),
and decisions with a rejected alternative in [`docs/decisions/`](docs/decisions/README.md); the index
at [`docs/README.md`](docs/README.md) is authoritative on which holds what. This file holds only the
rules layered on top.

## Non-negotiables

- **Design before implementation.** Nothing is implemented that is not written down first. If the
  spec is silent on something observable (an interface name, a payload shape, a config key, a failure
  behaviour, a threshold, a new file or dependency), **halt and ask** rather than inventing it — a
  plausible invention reviews as normal code while encoding a choice nobody made.
- **The boundary contract has exactly one definition.** The Go backend and Svelte frontend share no
  types; every value crossing the boundary is **generated from one schema**, never hand-declared on
  both sides. This is the single worst defect class this design guards against — see
  [ADR 0001](docs/decisions/0001-backend-language-go.md). CI fails on stale generated code.
- **Do not build generality against a case that does not exist** — no plugin system, no abstraction
  without a second consumer, no transport chosen before the access pattern, no comment-enforced
  invariants, no denylist secret handling, no non-tunable config keys, no controls that do not
  function where deployed.
- **Keep the docs standalone.** No reference points outside this repository. Every relative Markdown
  link resolves inside the repo (`just check-links`).

## Review independence

Code this session wrote cannot be reviewed by this session — independence comes from not having
written it. Delegate review of your own diffs to a fresh context, handed the diff and the spec, not
the narrative of what you did. Human-written code, or code from a session you had no part in, you may
review inline.

## Verify, don't assume

Run `just verify` before proposing merge; confirm green via CI, not a local pass.
