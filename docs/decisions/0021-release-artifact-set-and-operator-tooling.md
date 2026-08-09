# 0021 — A release is an image in the registry and two files on a tag, and carries no operator tooling program

**Status:** accepted
**Decided:** 2026-08-09 (design discussion, #71 release artifact set)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-09 — first written (#71 release artifact set).

## Context

A requirement deleted in the tree rebuild (#69 tree rebuild) enumerated the artifacts the project
delivers and forbade delivering any host provisioning. It went for two reasons: the enumeration was a
table of contents for unrelated things that each had obligations already, and it traced to no clause
of the need above it. Its prohibition was struck separately, on the ground that it forbade a case the
owner could foresee wanting. Nothing replaced either half, so the specification neither describes what
a release consists of nor rules on what may ship beside it.

An enumeration returned as a check rather than a requirement — [`../CI.md`](../CI.md) asserts a
release asset set and fails an undeclared asset — but a check asserting the set is what it says does
not decide what the set should be, and that section named this decision as the thing that would.

**Two premises the question had been asked under turned out to be false.**

The first is that a release is a set of downloadable files. Three of the five things the check
enumerated — the SBOM, the signature, the build-provenance attestation — are referring artifacts
attached to an image digest in the registry, which is where `../CI.md`'s verification job already
looks. A fourth, the image reference, is not a file at all. One sentence therefore described three
different queries against two APIs while reading as one assertion.

The second is that a tooling bundle had somewhere to go. The project publishes to a container
registry and to a documentation site, and nothing else; every option the ticket contemplated — a
provisioning bundle, a distributed helper — presumed a channel that did not exist. What the ticket
asked was where such tooling should live, and the answer was that there was nowhere to put it.

Underneath both sat a question nobody had answered: what a provisioning helper would do. Installing a
container runtime is per-host work the project does not want; configuring the display host to render
the page depends on particulars of an operator's network that no shipped script can know. What
remained — pull the image, bind a configuration, run it under a restart policy — is what a compose
file is.

## Decision

**A release occupies three locations, and only two of them carry it.**

| Where | What |
|---|---|
| The registry, at the image digest | the image, with its SBOM, signature and build-provenance attestation attached to that digest as referring artifacts |
| The release tag | the deployment recipe, and an example configuration file |
| The documentation site | nothing. It tracks the default branch and is deliberately not versioned |

The release notes name the digest, which is what ties the tag to the registry.

**The image reference is not an asset.** It is a pointer — the thing the registry-side material
describes and the thing the recipe resolves. Listing it beside four files is what made one sentence
stand for three assertions.

**Releases on a tag are adopted as a third channel.** They cost a workflow step and give the
documented procedure a stable retrieval URL, and they are what makes the asset-set claim in
[`../CI.md`](../CI.md) something a check can decide rather than a description of a release form the
project does not produce.

**No operator tooling program ships as part of a release**, and the release carries an example
configuration file instead.
A generator that checked its own output would be the second enforcer
[ADR 0007 rev 2](0007-config-validation-allocation.md) forbids by name; one that did not check it would
not answer the difficulty it exists for, which is authoring a configuration without knowing what the
schema offers. The page already renders the full validation report without a valid configuration
(SRS004<!-- Page renders a legible error state for every configuration failure class -->) and the
apply floor is a page reload
(SRS003<!-- A configuration change applies no later than the next page load -->), so what an operator
lacks is a starting point rather than a verdict, and a starting point is a file.

**The image declares a `HEALTHCHECK`.** Nothing acts on its status: a single-host container runtime
restarts a container whose process exits, not one reporting unhealthy, and what tells anyone the
kiosk is broken is
SRS026<!-- The display says when the backend is gone -->, on the screen in the room. It is declared
because it is an oracle three automated checks read, and because an operator wanting a health status
in a container listing would otherwise write the declaration into their own recipe — the same
avoidable step the recipe's restart policy exists to remove.

**The recipe is a sample carrying opinionated defaults.** What ships is a starting point an operator
edits, so a default costs one line to override and its absence costs knowing to add it. The obligation
is on what ships and never on what runs.

## Alternatives considered

**A tooling bundle as a release asset**, which is the shape #71 release artifact set was filed
expecting. Rejected because the work it would automate dissolved on inspection: the runtime install is
out of scope, the display host is out of reach, and the remainder is a compose file. A bundle carrying
one compose file and one example configuration is those two files with an archive around them.

**A compiled binary attached to the release tag.** It fits the language rule for what an operator runs
([ADR 0017 rev 3](0017-authored-language-set.md)) as written and needs no runtime on the host, so it was
the strongest form of a shipped helper. Rejected with the helper itself, and independently by the
single-enforcer rule above: the only thing it could usefully do is emit a configuration, and it cannot
check what it emits.

**A second published image, holding the tooling.** Attractive on the channel argument — one registry,
one publish workflow, the same signature and provenance as the kiosk image for free. Rejected on two
costs. It carries a second supply-chain surface through every scanning, signing and exception-register
gate `../CI.md` describes. And a tool whose output is a file on the host must bind-mount a directory
and match a uid to write it, which is an incantation an operator needs *before* their first deployment
exists. It would also leave
SRS018<!-- One generic published image --> with two referents for a definite article that has one.

**An OCI artifact pushed beside the image**, retrieved with `oras`. It keeps everything on one channel
and inherits the image's provenance. Rejected: it requires a tool nobody has installed to solve a
problem an HTTP client solves.

**Versioning the documentation site per release.** Rejected as more machinery than the drift justifies,
but the drift is real and is recorded below rather than left to be discovered.

**A configuration editor served as a second frontend bundle.** Not rejected — deferred. It is the only
form of a configuration tool that can validate what it produces, because it runs where the one engine
runs, and it would be version-locked to the image serving it. It costs a second HTML entry, which
[ADR 0018 rev 1](0018-frontend-svelte-vite-static-spa.md) and `../CI.md`'s static-bundle gate both fix at
one. Nothing here forecloses it: ADR 0007 rev 2 already states that a live-apply path is not designed
out.

## Consequences

**One asset-set sentence becomes three assertions.** Verifying referring artifacts against a digest,
enumerating files on a tag, and asserting the release notes name the digest are separate queries
against separate APIs, and #67 security and supply-chain gates inherits them as such.

**The container build inherits a constraint from the healthcheck.** A declared `HEALTHCHECK` needs
something inside the image able to reach the service over HTTP. A distribution base carries one; a
minimal base does not, and the check then needs a self-check path in the backend binary.
[ADR 0015 rev 2](0015-container-toolchain-and-image-annotations.md) leaves the base image undecided, so
#54 container build and publish takes this cost with that choice rather than meeting it as a surprise.

**An operator on an older digest reads a procedure describing the default branch.** The site is
continuously deployed and the release is not, so the two drift by construction. Accepted: the remedy is
versioning the site, and this is the record that the exposure was chosen rather than overlooked.

**The tooling document dissolves**, and only half of that follows from an existing rule. Every
assertion about a check goes to [`../CI.md`](../CI.md), which is
[ADR 0011 rev 1](0011-requirement-or-convention.md)'s. The remainder does not: that record's table is
closed over the requirements tree, `CI.md` and the review checklist, and an obligation on what ships
beside the image is none of the three. It goes to [`../DEPLOYMENT.md`](../DEPLOYMENT.md), which claims
deploying rather than tooling — **an allocation taken here rather than inherited**, and the gap it
fills predates this record, since the tooling document sat outside that table too.

**#70 configuration generator loses its delivery channel, not its ticket.** What is decided here is
what a release carries, and a tooling program is barred from it; whether a generator should exist at
all is that ticket's to rule. The argument against one does reach it — the page renders the report,
the apply floor is a page reload, and a generator cannot check its own output without becoming the
second enforcer [ADR 0007 rev 2](0007-config-validation-allocation.md) forbids — and it is the same
argument that retired the desk configuration validator. Its obligation left with the tooling document
and returns rewritten if that ticket rules the generator survives, since what the document stated was
a program this record bars from the release.

**How secrets reach a deployment is not decided here.**
SYS003<!-- A deployment is parameterised from outside the image --> obliges them to come from the
deployment environment, and the recipe must carry whatever channel that turns out to be, but the
mechanism is #73 secret delivery mechanism and #74 keeping secrets out of client output. The recipe
ships incomplete in that respect until they land.

**Premise that would reopen this:** a helper appears with work to do that a compose file cannot
express — which today means the display host becoming reachable by a shipped script, or a
configuration surface large enough that a starting file stops being a starting point. A wish for a
more convenient install is not that premise.
