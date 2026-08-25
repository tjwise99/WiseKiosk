#!/usr/bin/env python3
"""PreToolUse self-check on Edit/Write/MultiEdit.

Not a permission gate and not a hard block — it injects a reminder into the acting model's
own context (main loop or subagent) at the moment a design surface is touched, so the
design-intent / scope question always fires and can never be silently skipped. The model
answers it and only bubbles up to the owner when the answer is "this doesn't fit". Ordinary
code and everything else is silent.
"""
import json
import re
import sys

# Generated — regenerate, don't hand-edit; the reminder names how.
GENERATED = [
    (r"\.gen\.go$", "just codegen"),
    (r"frontend/src/lib/boundary/client\.ts$", "just codegen"),
    (r"docs/architecture/generated/", "just check-arch (regenerates the diagrams)"),
]

# Design/decision surfaces — a decision lives here, not an implementation byproduct.
DESIGN = [
    r"docs/requirements/",              # SYS/SRS/TST items
    r"docs/decisions/",                 # ADRs
    r"docs/contracts/",                 # module + styling contracts
    r"boundary/openapi\.yaml$",         # the one boundary schema
    r"docs/architecture/model/",        # the likec4 model
]


def reminder(path: str):
    for pat, how in GENERATED:
        if re.search(pat, path):
            return (
                f"SELF-CHECK — {path} is a GENERATED artifact. Regenerate it with `{how}` rather "
                "than hand-editing; a hand-edit drifts from its schema and a check-* gate will reject it. "
                "If you meant to change what it generates, edit the schema/model source, not this file."
            )
    for pat in DESIGN:
        if re.search(pat, path):
            return (
                f"SELF-CHECK — {path} is a DESIGN/DECISION surface (requirement / ADR / contract / "
                "boundary / model). Before proceeding, answer honestly: does this edit match a DECIDED "
                "design intent and THIS ticket's scope? If it invents an interface nobody decided, defines "
                "another ticket's deliverable (a module's failure state and its spec belong to "
                "#76 module-spec procedure and #12 first module end-to-end), or folds "
                "something in to make a gate pass — STOP and bubble it up to the owner instead of proceeding. "
                "If it is decided and in scope, proceed. (CONTRIBUTING § design-first, CLAUDE.md § halt-and-ask.)"
            )
    return None


def main():
    try:
        data = json.load(sys.stdin)
        path = (data.get("tool_input") or {}).get("file_path", "") or ""
    except Exception:
        return  # fail-open: never interfere on a parse error
    note = reminder(path)
    if note is None:
        return
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": note,
        }
    }))


if __name__ == "__main__":
    main()
