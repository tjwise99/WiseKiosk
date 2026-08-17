# 0023 — Confine a secret to a type that cannot be emitted, and prove it at the edge with a canary

**Status:** accepted
**Decided:** 2026-08-15 (#74 secret output containment, the phase-2 decision the `SRS` pass of #69
deferred rather than default to a canary)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-15 — first written (#74 secret output containment).

## Context

SRS008<!-- No secret value in any backend output --> obliges the backend to keep every secret *value*
out of its HTTP responses and its logs, naming a secret rather than showing it where output must refer
to one at all. [`../../SECURITY.md`](../../SECURITY.md) rests on that rule.
What was left open is *how the obligation is proven*, and the `SRS` pass of #69 recorded the opening
deliberately: the mechanism is a milestone-2 decision and **must not default to a canary test**. The
candidate table then had nowhere to live but the pending note of
TST022<!-- Pending: canary-secret leak test -->, an `active: false` item Doorstop skips entirely, so
the record sat in a field nothing reads. This ADR is the decision that note was waiting for. #73
records the secret *delivery* mechanism; this is its *containment* counterpart.

**The tree already presumes half the answer.** [`../CI.md`](../CI.md) § *Module and framework
structure* — checks that live outside the requirements tree under
[ADR 0011 rev 2](0011-requirement-or-convention.md) — asserts that *no exported shaping function's
parameters include the secret type*. That check names a **distinct secret type** as a thing it can
refer to, but no document specifies the type or gives it a home. The live question is therefore two
halves: whether that type should be specified anywhere, and which mechanism proves that obligation
end to end.

**Four candidates, each with a gap.** An **import boundary** (the package producing client output
cannot import the resolver) is total and needs no sampling, but is silent about a secret that arrives
from upstream rather than from resolution. **Type confinement** (a distinct secret type that cannot
be formatted or serialised) is equally total for a locally-held secret, and carries the same blind
spot for one that was never a local secret-typed value. **Taint analysis** — the CodeQL-class scan
[`../CI.md`](../CI.md) § *First-party source scanning* already runs over first-party Go — reasons over
the whole call graph rather than exercised paths, but yields false negatives through reflection and
interface indirection. A **canary** — plant a known secret, assert it absent from every response and
captured log — proves behaviour only on the paths it exercises, but its one distinctive catch is an
upstream error echoed verbatim, where the secret was never a local variable and none of the three
structural mechanisms ever sees it.

## Decision

**Compose type confinement (structural, primary) with a canary (behavioural, the falsifiable edge).**
Neither proves the obligation alone; each closes the other's gap.

**A secret is a distinct type that cannot be emitted.** Its underlying value is unexported; it exposes
no exported field; its `String()` and `GoString()` return a fixed redaction rather than the value; it
implements neither `json.Marshaler` nor `encoding.TextMarshaler`, so the standard `encoding/json` and
text-encoding paths cannot reach the value; and the sole call site that unwraps it to the raw value is
guarded by a lint, so an unwrap is explicit and reviewable rather than incidental. A secret held as
this type therefore cannot be formatted into a response, serialised into a body, or interpolated into
a log line without a reviewer seeing the unwrap. This is the type the [`../CI.md`](../CI.md) § *Module and framework structure*
checks already name: the shaping packages are pure by construction and no exported shaping function
takes the secret type, so a secret cannot travel into the code that shapes client output in the first
place.

**Where the type is specified — the narrowed question, answered.** Under
[ADR 0011 rev 2](0011-requirement-or-convention.md), *"there is a distinct secret type"* is a
structural convention a machine settles — the existing check — not an obligation on what the running
software does, so it is **not a new requirement**, and adding one would reintroduce the tree growth
that ADR removed. **This ADR is the type's specification**; [`../CI.md`](../CI.md) § *Module and
framework structure* is its enforcement. The requirement stays sole: it states the observable
obligation — no secret value in output — which the canary verifies. No requirements-tree edit is made.

**The canary is the falsifiable edge, not the proof.** TST022<!-- Pending: canary-secret leak test -->
plants a known secret value through the delivery path and asserts that value appears in no response
body, header, or log line across every route — including the unresolvable-secret failure paths, where
an upstream error is most likely to be echoed. That echoed-upstream-error case is exactly where a
secret was never held as the confined type and structure cannot see it; the canary is what turns the
structural claim into something that can fail. It lands with the backend skeleton (#9) and is
activated and given a `references` entry then. Structure proves the leak cannot happen on the paths a
secret is a local value; the canary proves it does not happen on the paths that carry upstream
material to the client.

## Alternatives considered

**Import boundary — the client-output package may not import the resolver.** Rejected as the primary
mechanism. It is coarser than type confinement, which confines the *value* wherever it travels rather
than partitioning packages, and it carries the same upstream blind spot without the reviewable-unwrap
property. It also duplicates a cut the tree already makes: [`../CI.md`](../CI.md) § *Module and
framework structure* already forbids building an upstream URL outside a module's shaping library and
keeps shaping packages pure, so the resolver-to-output partition is present without a second check
asserting it a different way.

**Taint analysis (CodeQL) as the proof.** Rejected as *the* mechanism, kept as a backstop. Its
false negatives through reflection and interface indirection make it unsound to rest the obligation
on — a soundness the requirement needs and a whole-graph scan of this shape cannot give. The
first-party source scan (#67, [`../CI.md`](../CI.md) § *First-party source scanning*) runs over
first-party Go and fails on any finding at any severity, so it stands as a general net whether or not
this obligation exists; the obligation does not depend on it, and this decision neither extends it to
a secret-specific source-to-sink configuration nor treats its silence as evidence of absence. Were #67
to descope the Go scan, the rejection would stand unchanged — the mechanism above is type confinement
and the canary, not this scan.

**Canary alone.** Rejected, and the #69 pass rejected it first: it is behavioural, exercises only the
paths a test drives, and offers no structural totality, so a leak on an unexercised route passes
unseen. It is the complement here, never the primary.

**Type confinement alone.** Rejected: it is blind to the echoed-upstream-error path, where the secret
was never held as the confined type. That path is precisely the canary's distinctive value, which is
why the two are composed rather than either chosen.

## Consequences

- **The secret type becomes load-bearing across the backend.** Its value is what type confinement
  costs: every place a secret travels must hold it as this type, and the one unwrap site must stay
  singular and linted for the structural claim to hold. The [`../CI.md`](../CI.md) § *Module and
  framework structure* check that names the type is what keeps a shaping function from quietly
  accepting it.
- **The type and its unwrap-site lint are built with the backend skeleton (#9), and are unbuilt until
  then.** The type-parameter exclusion has an owning [`../CI.md`](../CI.md) check; the single-unwrap
  lint does not yet, and needs a check row or ticket when #9 lands the type — until it exists, review
  is the control for the unwrap property, as it is for the other structure checks this record leans on.
- **The obligation is proven, not merely asserted.** The requirement gains a mechanism with a structural half
  that cannot be sampled around and a behavioural half that can fail — the falsifiable edge #69 asked
  for without pre-choosing.
- **The canary test activates against a settled design.** When it lands with #9 it is a canary by
  decision rather than by default, and its known limit — a secret emitted after transformation, a hash
  or a key prefix that would not match the planted value — is the same limit the requirement's own
  `verification-justification` already records, not a new gap this introduces.
- **The type's shape is specified here and nowhere in the tree.** A later reader asking *"what is the
  secret type?"* is sent to this ADR by the check that names it, not to a requirement — which is the
  [ADR 0011 rev 2](0011-requirement-or-convention.md) division working as intended, and the thing that
  would reopen this record is a change to that division or a secret shape the confined type cannot
  carry.
