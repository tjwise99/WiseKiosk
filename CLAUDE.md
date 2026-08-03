# Agent working rules — WiseKiosk

Working conventions for an AI agent in this repo. **Project facts are not here** — the index at
[`docs/README.md`](docs/README.md) is authoritative on which document holds what, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) is how a change gets made and merged. This file holds only the
rules layered on top, which is why it is short: a rule stated in one of those documents does not
belong here as well.

[`CONTRIBUTING.md`](CONTRIBUTING.md) is injected at session start by the `SessionStart` hook in
[`.claude/settings.json`](.claude/settings.json), so its review checklist is in context before the
change it governs is written. Nothing else delivers it — an instruction to go and read it does not
reliably fire.

**Where an obligation lives is decided by
[ADR 0011](docs/decisions/0011-requirement-or-convention.md)**, not by which document is convenient.

## Halt and ask

Where the spec is silent on something observable — an interface name, a payload shape, a config key,
a failure behaviour, a threshold, a new file or dependency — **halt and ask** rather than inventing
it. A plausible invention reviews as normal code while encoding a choice nobody made, which is what
makes this failure worth a rule of its own rather than care.

## Review independence

Code this session wrote cannot be reviewed by this session — independence comes from not having
written it. Delegate review of your own diffs to a fresh context, handed the diff and the spec, not
the narrative of what you did. Human-written code, or code from a session you had no part in, you may
review inline.
