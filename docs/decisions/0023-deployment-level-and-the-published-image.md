# 0023 — Draw the Deployment level, with the published image as a subject distinct from the container it becomes

**Status:** accepted
**Decided:** 2026-08-09 (C4 phase 4 design discussion, ticket #123 C4 phase 4 Deployment)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-09 — first written (#123 C4 phase 4 Deployment).

## Context

[ADR 0022 rev 1](0022-every-accepted-requirement-binds.md) obliges every accepted, active `SYS` or
`SRS` item to bind somewhere in the model, and where one cannot, obliges the model to grow to draw what
it obliges. It left two items deliberately unbound —
SRS020<!-- Non-root container user --> and SRS025<!-- No secret material in the published image --> —
and named this phase as the growth that binds them. Both oblige the published image, and no level
drawn had an element the image is.

The improvisation is older than that. [ADR 0021 rev 1](0021-component-earns-its-interface-and-framework-half-only.md)
put SRS018<!-- One generic published image --> on the operator's configuration edge because that was
the nearest observable thing to an image the model did not draw, and said so. Three items obliging one
artifact were split across one edge and nothing.

**What forces the decision now rather than the shape of it.** C4's deployment diagram maps containers
onto the infrastructure they run on. That much is settled by the notation. What is not settled is
whether the artifact those containers ship in is a subject at this level at all, and every one of the
three items above turns on the answer.

## Decision

**The Deployment level draws three kinds of subject: hosts, the processes on them, and the files placed
beside them.** Those three are the model's node kinds — `host`, `process`, `artifact` — so a
contributor adding a node chooses from the categories this record names rather than inventing one. The
running container and the browser are both processes; the published image, the configuration file and
the secret files are all artifacts. The nodes are a container host holding the operator's configuration
file, the secret files and the running container; a display host holding the browser; and the published
image. The Backend instance runs in the container, the Frontend instance in the browser.

**The published image is a subject, and it is not the running container.** The obligations on it are
obligations on the artifact as published, and the requirements say so in their own text:
SRS020<!-- Non-root container user -->'s `verification-justification` states that "a deployment can
override the user, and no property of the image prevents it", and
SRS025<!-- No secret material in the published image --> and
SRS018<!-- One generic published image --> are settled by exporting the image rather than by observing
anything running. Binding them to the running container would assert precisely what those items
disclaim.

**The configuration file and the secret files are nodes.**
[ADR 0020 rev 1](0020-two-containers-one-origin-and-dual-tier-tags.md) refused the configuration a
container element on the ground that a mounted file is not a running unit. That is a container-level
objection — a container is an execution context — and it does not reach a level whose subject is what
sits at the deployment site. Without them the level draws nothing the Container level does not, and
SYS003<!-- A deployment is parameterised from outside the image --> has no observable here.

**The level answers to `SRS`, and anything here also carries the `SYS` item it discharges observably at
this level** — the shape [ADR 0020 rev 1](0020-two-containers-one-origin-and-dual-tier-tags.md) gave
the Container level, for its reason: an obligation on a host or an artifact is `SRS`-shaped, and the
mount edges are where SYS003<!-- A deployment is parameterised from outside the image --> is watched
rather than argued.

**The provisioning tooling gains no element.**
[ADR 0019 rev 1](0019-boundary-at-what-deploys-and-tag-tier.md) said it would gain one "if and when it
acts on the running deployment". The test returns no: #71 release artifact set covers compose files, an
example configuration and a provisioning script automating the same steps — each read or run by an
operator to *create* a deployment, none of them acting on a running one (owner, 2026-08-09). The script
is named because it is the item most likely to trip the test, and it does not: bringing a deployment
into existence is not acting on one that is running. This is the existing test applied, not a new
deferral.

**One view, not one per node.** A view per host carries three boxes, and each view costs a generated
artifact and a splice marker in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

### Where the six items land

**SRS020<!-- Non-root container user -->, SRS025<!-- No secret material in the published image --> and
SRS018<!-- One generic published image --> bind on the published image.**
SRS018's<!-- One generic published image --> binding **moves** off the operator's configuration edge
rather than doubling: ADR 0021 rev 1 placed it there for want of an image, and a second home would
leave two subjects where the item has one.

**SRS019<!-- The backend runs on both supported architectures --> moves to the container host**, off
the Backend container. The 64-bit floor is the container runtime's rather than the backend's — no
32-bit image is published, and the backend is never run outside the container, so what the binary
itself targets is the image's business (owner, 2026-08-09). On that ground it is not a fact about that
container, so it does not split across two depths. **This is the one binding of the six that is open**
— the published image is a live rival for it, argued under *Alternatives considered* below, and the
tag stays here until the owner rules.

**SRS021<!-- Frontend runs on a Pi Zero-class browser host --> binds at both depths**, keeping its
Frontend container binding and gaining the display host. The bundle must be built for what that
device's browser and compatibility layers accept, which is a property of the Frontend; the device being
Pi Zero-class is a property of the deployment. That is ADR 0021 rev 1's composed-observable rule
applied, not widened.

**SRS035<!-- The masked edge band is the deployment's to declare --> binds on the configuration file.**
Its first clause obliges the deployment's configuration to supply the band depth, and that file is the
deployment supplying it. Its second clause — the page assuming no band where none is supplied — is a
Frontend observable, and #135 bind the mirror and legibility requirements places it if that ticket
judges the split real.

### The two hosts are roles

They have different floors, and one machine meeting both may carry both roles. In the configuration
being built for it cannot: the display host was read before this was argued — `armv6l`, one core,
432 MB, no container runtime — so it is below the container host's floor and the two are necessarily
separate machines there. ADR 0020 rev 1 said the frontend runs "potentially a separate machine of a
different architecture"; for at least one supported configuration that is stronger than *potentially*,
and the node descriptions carry it rather than the model asserting two machines as a rule.

## Alternatives considered

**Bind the three image items to the running container**, with a description saying it runs an instance
of the image, and draw no image node. The strongest rival: it keeps the level to things that run, which
is what a deployment diagram is usually taken to be. Rejected on the requirements' own text — the
sentence in SRS020<!-- Non-root container user --> quoted above exists precisely to say the running
process is not the subject. The description cannot carry the difference either: `check-arch-trace`
reads tags, so the model would assert the false claim and the check would agree. That is
ADR 0022 rev 1's named cheap failure — the plausible tag on an element that already exists — arrived
at by exactly the reasoning it predicted.

**Draw the image with its contents inside it**, a node each for the backend binary and the frontend
bundle, so that one image reaching two destinations is visible on the page rather than carried by edge
labels. Genuinely better at the one thing it was built to do, and it was built and rendered before
being rejected (owner, 2026-08-09). Rejected as clutter, and because structure drawn inside a thing
that does not run invites the node to grow into a packing list of the image — an inventory kept in step
by nothing, which is the failure [`../ARCHITECTURE.md`](../ARCHITECTURE.md) already argues against in
the other direction. What survives is the content: the image's `description` enumerates what it
carries.

**Leave SRS018<!-- One generic published image --> where ADR 0021 rev 1 put it**, on the configuration
edge, and give it no second home. Rejected: that placement's stated reason was the absence of an image
element, and the reason is gone. Keeping it would leave the record asserting a workaround as a
positive choice.

**Bind SRS019<!-- The backend runs on both supported architectures --> to the published image rather
than to the container host.** Recorded here without being settled, which is the one entry in this
section that is not closed. The item's own `rationale` closes: "Stated as an obligation on WiseKiosk
rather than as a fact about the host, because a host's capabilities are not ours to require; what is
ours is running on both" — and the tag sits on a node whose description states a host capability. Its
`verification-justification` settles it by "building for both architectures", and what is built for
both is the image. The clause above choosing the host ends "what the binary itself targets is the
image's business", which points at the image too. Against that stands the ground the choice was
actually made on: the 64-bit floor exists because a container runtime needs it, which is a fact about
where the thing runs (owner, 2026-08-09). It is also the only one of the six whose sole binding is now
outside the system boundary, where SYS007<!-- The declared minimum host, and staying within it -->
puts the hosts. **The tag stays on the container host until the owner rules**; this entry is where a
reversal attaches, and where an affirmation is already written down.

**Wait for #71 release artifact set to define what ships.** This ticket's own lead option, on the
ground that a level drawing what ships should not guess the set. Rejected: four of the five release
assets are things a release page lists rather than things that run anywhere, the level draws what runs
where, and the one real coupling — whether provisioning tooling appears — is decided by
ADR 0019 rev 1's test rather than by the artifact set. #71 is being worked in parallel.

## Consequences

**The model now carries a subject that does not run**, and a reader meeting the image node needs the
reason. It is in the node's `description` and in this record; nothing gates it.

**ADR 0021 rev 1 loses a sentence.** Its statement that SRS018<!-- One generic published image -->
"stays where what is observable of it is — the configuration arriving from outside" is false once the
image is drawn. Correcting it means revving that record, which under [`README.md`](README.md) moves
every citation of it — for text #124 merge the three C4 ADRs deletes, and that ticket already records
this correction by name among what it absorbs. It is that ticket's, as ADR 0022 rev 1 recorded for the
same reason.

**No lesser fix is available, and that is the rule working rather than a gap.** [`README.md`](README.md)
allows a correction to be a rev and forbids it being a block appended to the old text, so a pointer
added to that record without revving it is the thing the rule refuses — there is no cheap third option
to reach for. The stale sentence is confined to this integration branch:
#124 merge the three C4 ADRs dissolves ADR 0021 rev 1 into one record before the epic reaches `main`,
so what merges there never carries it.

**The Deployment level is where a host obligation goes, and that is a new pull.** SRS019<!-- The
backend runs on both supported architectures --> moved here on the ground that the width floor belongs
to the container runtime — a placement *Alternatives considered* records as still open, so this
paragraph describes the pull rather than resting on that one item. Future items naming a host, a mount
or an artifact now have somewhere to sit, and the pressure to bind them to a container is gone. The
opposite pressure arrives with it: an item genuinely about an execution context can now be parked on a
host because the host is the more concrete-sounding subject.
Nothing gates that either — `check-arch-trace`'s scope is resolution and completeness, and whether the
tagged subject is the one the requirement obliges is held by review, which is ADR 0021 rev 1's position
on this link rather than a new one.

**This record takes 0023, and #124 merge the three C4 ADRs will renumber it**, for the reason
ADR 0022 rev 1 records of itself: that slice merges three ADRs into one and returns two numbers to the
pool, leaving anything above the gap stranded against the contiguity rule [`README.md`](README.md)
states.

**`check-arch-trace` does not go green here.** This level binds three of the nine items the check
reports unbound; the other six are #135 bind the mirror and legibility requirements'. That check goes
green when this ticket and #135 have both landed, which is recorded on both tickets rather than left
to be discovered at the merge.

**The epic's merge to `main` waits on a third ticket as well.** #124 merge the three C4 ADRs is what
removes the ADR 0021 rev 1 sentence this record makes false, so the paragraph above resting on that
removal is a claim about what #124 does rather than a fact already true. Descoping or reordering that
ticket does not fail a check — nothing gates it — it leaves a merged record asserting a binding the
model does not hold.
