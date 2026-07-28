# Tooling

What ships alongside WiseKiosk to make a deployment easier to stand up, and what each tool must do.

**None of this is a requirement.** A requirement obliges WiseKiosk itself. These are separate programs
an operator runs from a clone of this repository — they are not part of the running system, and a
deployment that never uses them is still a correct deployment. The product's obligations live in
[`../docs/requirements/`](../docs/requirements/README.md)
([ADR 0011](../docs/decisions/0011-requirement-or-convention.md)). Adding or retiring a tool is an
edit here, not a specification change.

**None of it is built yet.** Each tool names its ticket. That is how this project records scoped work
([ADR 0005](../docs/decisions/0005-traceability-gating.md)).

## The configuration validator

Owned by #8, alongside the schema it checks against.

Checks a configuration file against the configuration schema without starting the application. It
reports every validation error in operator language — what is wrong, where, and what to change — and
exits non-zero for an invalid configuration, zero for a valid one.

*Asserted by* a CLI test: a known-good configuration accepted with exit zero, a known-bad one rejected
with a non-zero exit and operator-language errors, neither starting the application.

**One obligation here does stay in the tree.** The validator and the page's own validation must run
the same implementation, so a configuration cannot pass one and fail the other. That constrains
WiseKiosk, not the tool, and it is stated by `SRS008` under
[ADR 0007](../docs/decisions/0007-config-validation-allocation.md).

## The configuration generator

Owned by #70.

Produces, from a template or from prompted input, a configuration that the validator accepts without
manual edits.

*Asserted by* a test that runs generator output through the validator and requires it to pass
unedited.

## Bring-up

Owned by #71, with the provisioning scripts that ship with the release.

A deployment reaches a working state on a clean host from the published artifact and the documented
procedure alone — the executable form of *nothing required is missing*. If a clean environment can
deploy by following only in-repo documentation, the documentation is sufficient.

*Asserted by* a check that executes the bring-up commands the documentation states, in a clean
container, and asserts the service serves. It fails if a documented step does not run, or if the
sequence completes without a serving deployment. No human in the loop.

## What is not here

**What the kiosk does.** Rendering, configuration handling at run time, upstream fetching and failure
behaviour are obligations on the running software and live in the requirements tree.

**Repository checks.** Lint, scanning, publishing and gate wiring are in
[`../docs/CI.md`](../docs/CI.md). A tool here is something an operator runs; a check there is
something CI runs.
