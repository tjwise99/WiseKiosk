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

## The deployment recipe

Owned by #54, published with the image as part of the asset set #67 declares.

The committed recipe — a compose file or run manifest — carries restart policy `unless-stopped`, so a
deployment that comes back after a host reboot is what an operator gets by following the documented
procedure, rather than something they have to know to add.

*Asserted by* a scripted check over the committed recipe, failing if the policy is absent.

The obligation is on what ships, not on the running system. An operator who edits the recipe, or
deploys without it, has made their own choice, and WiseKiosk has no way to override it.

## The health signal

Owned by #54, with the image build.

The image declares a `HEALTHCHECK` against the constant service port: healthy while the backend is
serving, unhealthy when it is not, including when the process is alive but wedged.

*Asserted by* an integration test running the image and reading the reported status in both states.

This exists for the checks above, which need a machine-readable *is it serving yet* rather than a
scraped log line. It is not a monitoring feature and nothing acts on it: Docker and Compose restart a
container whose process exits, not one reporting unhealthy, so an unhealthy kiosk stays unhealthy
until somebody intervenes. What tells an operator the kiosk is broken is the kiosk — `SRS029` obliges
the display to say so, on the screen in the room.

## Establishing what you pulled

Owned by #71, against the material #67 publishes.

An operator who pulls an image is trusting a stranger's build. The documented procedure therefore
includes a verification step, run before the image runs: the operator checks the digest against its
signature and provenance using the material described in
[`../docs/CI.md`](../docs/CI.md), and the commands to do so ship with the procedure rather than
having to be reconstructed.

*Asserted by* the bring-up check below, which executes the documented steps in order — a procedure
whose verification step does not run, or does not fail on a digest that fails verification, fails the
check. That CI verifies its own published output is a separate assertion, and it is in `CI.md`.

## Upgrade

Owned by #71, against the images #54 publishes.

Moving a deployment from one published digest to the next is a scripted act. The operator supplies
the same mount arguments they already use; nothing asks them to read a diff, edit code, or rebuild.

*Asserted by* a test that runs published digest A with a mounted configuration and secret directory
and asserts it is healthy and serving that configuration; stops and removes it; runs digest B with
byte-identical mount arguments and asserts it is healthy, serving the same configuration, and
reporting a changed version — with no builder invoked at any point.

## What is not here

**What the kiosk does.** Rendering, configuration handling at run time, upstream fetching and failure
behaviour are obligations on the running software and live in the requirements tree.

**Repository checks.** Lint, scanning, publishing and gate wiring are in
[`../docs/CI.md`](../docs/CI.md). A tool here is something an operator runs; a check there is
something CI runs.
