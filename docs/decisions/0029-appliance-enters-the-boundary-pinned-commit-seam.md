# 0029 — The kiosk appliance enters WiseKiosk's requirements tree and architecture model; the repos stay separate, coupled by a pinned commit

**Status:** accepted
**Decided:** 2026-09-02 (owner ruling 2026-08-25, transcribed on #202 the appliance enters the system
boundary)
**Rev:** 1

## Revisions

- **rev 1** — 2026-09-02 — first written (#202 the appliance enters the system boundary).

## Context

`README.md` states a boundary this record reverses in one named part: "The kiosk host lies outside
the system: its operating system, its container runtime, its browser, and whatever starts that
browser on boot. Provisioning that machine is the operator's, and no requirement in the tree reaches
it." [ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md) draws the same line at the
architecture-model layer: "The boundary is what deploys — the published container image and what it
serves. The provisioning material shipped beside it falls outside," reinforced by "the provisioning
tooling gains no element." TST018<!-- Pending: emulated Pi Zero-class host, and performance bounds
--> records the consequence for verification: "Emulation is the accepted evidence for the Zero-class
claim (owner decision 2026-07-29). A run on physical hardware happens when a deployment is stood up
and is obliged by nothing — not by this item, not by TESTING.md, not by a review checklist."

That is an unowned hole by construction, and it is load-bearing rather than theoretical: a real
appliance exists in `tjwise99/meta-wisekiosk` — it is built and OTA-updated — and nothing in this
tree can fail it: no requirement names it, no test exercises it on device, and the architecture model
draws no element for it. The owner's ruling (2026-08-25) is to reverse the exclusion: the appliance
becomes first-class in the sense that matters to this repository, which is the requirements tree and
the architecture model, while the two repositories stay separate.

SYS007<!-- The declared minimum host, and staying within it --> is the nearest existing obligation on
a host WiseKiosk runs on, and its own rationale reads "the hosts themselves lie outside the system,
which README.md states; what is inside is WiseKiosk's obligation to fit them" — a sentence this
record makes false for the appliance case without editing the sentence itself.
SRS021<!-- Frontend runs on a Pi Zero-class browser host --> is the claim a real appliance makes
verifiable on physical hardware rather than only under emulation.

## Decision

**The boundary moves in exactly two places: the requirements tree and the architecture model.**
Nothing else. The two repositories are not merging, WiseKiosk gains no new publishing channel, and
the operator-facing container path is untouched.

**Two deploy models exist side by side.**

- **Operator model, unchanged.** WiseKiosk publishes a multi-arch container image to GHCR
  (`publish.yml`, the Dockerfile's `web` stage running `vite build`); an operator runs it with
  `docker compose up -d`. This is [ADR 0020 rev 2](0020-release-artifact-set-and-operator-tooling.md)'s
  decision, cited here and left wholly as it stands — no rev of it, no edit to it.
- **Appliance model, new.** `meta-wisekiosk` pins a WiseKiosk **commit hash** and builds the whole
  application in-layer, from source, at image build time. It does not consume the GHCR image: the
  display host sits below the floor for running the published container image at all, per
  [ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md)'s own Deployment-level reasoning
  about that host's resource class. A commit hash is the seam the two repositories share, and it is
  the whole of the coupling: `meta-wisekiosk` reads no other WiseKiosk-owned artifact, and WiseKiosk
  ships nothing new to be read.

This is a second WiseKiosk-owned image only if the layer built one; it builds the application into
its own rootfs instead, so no second image, no second publishing channel, and no second supply-chain
surface exist — the same reasoning
[ADR 0020 rev 2](0020-release-artifact-set-and-operator-tooling.md) gives for refusing a second
published image for operator tooling applies here for the same reason: a second image would carry a
second scanning, signing and exception-register surface with no consumer the pinned-commit seam does
not already serve more cheaply.

**How the appliance's image is built, delivered to the device, and updated in the field is
`meta-wisekiosk`'s, not this repository's.** This record does not defer that question as WiseKiosk's
own unfinished business — it states plainly that it is not WiseKiosk's question to answer.
Update delivery, image assembly and device provisioning are out of this repository's universe by the
same boundary this record draws: WiseKiosk owns the requirements and the architecture diagram, full
stop.

**This amends [ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md) in one named part.**
The appliance-exclusion clause — "the provisioning material shipped beside it falls outside," and
"the provisioning tooling gains no element" — does not hold for the appliance case: the appliance
exchanges something with the system in the sense that record's own corollary tests for, being the
running instance of what the system is. The boundary-is-what-deploys principle and the tag-tier rule
stand untouched; only the named exclusion clause is reversed.
[ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md) is the rev that records this, per
[`README.md`](README.md)'s supersession mechanism — a named-part reversal, `Status:` left `accepted`.

**`README.md`'s exclusion paragraph and `TST018`'s rationale are named superseded by this record.**
Both assert the same premise this record reverses, from different angles — a human-facing
restatement of the boundary and a test-tier rationale built on it — and both are superseded rather
than merely inconsistent. The edit to `README.md`'s prose lands in the same pull request as this
ADR. The edits to `SYS007`'s rationale and `TST018`'s YAML do not: they are deferred to child ticket
#203, which reparents both against the new `SYS` item that ticket writes, so the tree-suspicion
cascade (`SYS007 → SRS021 → TST018`) is not opened by a doc-only PR that carries no new tree item to
resolve it against.

## Alternatives considered

**Keep the exclusion.** The status quo, and the alternative this record must reject with its
reasons. It leaves the appliance an operator concern verified nowhere, which is tenable only where
no appliance exists to be failed against. A real, built, OTA-updated appliance exists in
`tjwise99/meta-wisekiosk`, and an unowned hole with a real occupant is a gap this tree cannot
disclaim.

**Merge the repositories (monorepo).** Rejected on CI cadence, not on principle. WiseKiosk's CI runs
in minutes; a Yocto image build runs in hours, and `meta-wisekiosk`'s own `guards.yml` already
refuses to build a rootfs on the commit path for exactly that reason. One gate cannot serve both
cadences, and forcing them under one repository would either slow WiseKiosk's commit-path CI to the
image build's pace or split the repository's own CI into two classes that a merge was supposed to
avoid needing. The two repositories stay separate; the display host's resource class, per
[ADR 0019 rev 7](0019-boundary-at-what-deploys-and-tag-tier.md), already forces a
consume-a-pinned-artifact coupling between them regardless of repository boundary, so the separation
costs nothing a merge would have bought back.

## Consequences

**Child ticket #203 does the requirements-tree and architecture-model work this record only names.**
The new `SYS`/`SRS` items ("host boots and self-hosts"), the device-tier `TST`s that replace or
reparent `TST018`, and the appliance's element in the LikeC4 model are #203's, not this record's. This
ADR records the decision and the boundary it moves; it authors no `SYS`/`SRS`/`TST` and draws no
model element.

**`SYS007`'s rationale and `TST018`'s rationale read as superseded prose sitting on unedited YAML
until #203 lands.** A reader of either file meets a rationale this record has already overtaken; the
files are not wrong to trust once #203 reparents them, but between this PR and that one they describe
a boundary this record has moved.

**No rev of [ADR 0020 rev 2](0020-release-artifact-set-and-operator-tooling.md).** It is cited, not
changed: the operator model it decides is untouched by the appliance model existing beside it, and
nothing here asks a citer of ADR 0020 rev 2 to re-decide anything.

**hawkBit, RAUC, and any other update-delivery mechanism are not a WiseKiosk concern by this record's
own boundary**, not a deferred one — a later ADR taking up delivery would be `meta-wisekiosk`'s to
write, not a rev of this one, unless the boundary this record draws changes.

**Premise that would reopen this:** `meta-wisekiosk` needing to consume something from WiseKiosk
other than a pinned commit hash — a published artifact, a generated file, a second channel — at which
point the "repos stay separate" half of this decision is what is back on the table, not the boundary
move itself.
