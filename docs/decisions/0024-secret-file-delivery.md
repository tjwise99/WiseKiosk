# 0024 — Deliver every secret as the file named by `<NAME>_FILE`, and by no other path

**Status:** accepted
**Decided:** 2026-07-23 (#35 secrets-handling domain — the `_FILE`-only delivery choice, taken there
superseding an env-var fallback sketch; this ADR is where it is finally recorded)
**Rev:** 1

## Revisions

- **rev 1** — 2026-08-15 — first written (#73 record the secret delivery mechanism).

## Context

SYS003<!-- A deployment is parameterised from outside the image --> obliges every deployment's secrets
to come from the deployment environment and appear nowhere else. *How* a secret reaches the backend —
the delivery mechanism — is not stated by that need, and deliberately so: `<NAME>_FILE` is one answer
among several (a bare environment variable, a fixed mount path, Docker secrets, a manager SDK), and a
mechanism is not a want. The `SRS` pass of #69 removed on that ground the two pre-rebuild items that
had stated it — one obliging resolution by reading the file named by `<NAME>_FILE` with trailing
whitespace stripped, the other obliging a re-read on each resolution, never cached — leaving the want
at the need tier and the mechanism without a requirement. (Those two identifiers were reused by the
rebuild for unrelated items and are deliberately not named here.)

**The removal exposed that secrets never had an ADR.** The `_FILE` decision was taken on #35 and
recorded *inside a requirement*, because there was nowhere else — the tree absorbing an architecture
decision that had no phase to live in, which is the growth [ADR 0011 rev 1](0011-requirement-or-convention.md)
exists to prevent. The mechanism survives today only by presumption:
SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> names `<NAME>_FILE` and
"empty after trailing-whitespace stripping" inside its *failure* clause, and
TST014<!-- Pending: secret-resolution unit tests --> asserts the read and the bare-`<NAME>`
exclusion, and TST017<!-- Pending: unresolvable-secret failure-path test --> exercises the
unresolvable-secret failure path over it — but no document states the positive delivery rule, the
exclusion of every other path, or
the substitutability the choice buys. Those checks verify an obligation nobody stated. This ADR is its
home. It is the *delivery* record; [ADR 0023 rev 1](0023-secret-output-containment.md) is its
*containment* counterpart, and already names #73 as this half.

## Decision

**A secret is delivered as a file, named by an environment variable, and by no other path.** For a
secret identified as `<NAME>`, the backend resolves it by reading the file whose path is the value of
the `<NAME>_FILE` environment variable. The resolved value is the file's contents with trailing
whitespace stripped. Resolution happens when handling a request for the source that needs the secret,
never at boot and never cached for the process lifetime — so a rotated file takes effect on the next
cache-missing resolution with no restart. No other delivery path is honoured; in particular a bare
`<NAME>` environment variable carrying the secret *value* is ignored, so a file and an environment
variable can never both claim to be the secret.

**What stays in the tree, and what is specified here.** Under
[ADR 0011 rev 1](0011-requirement-or-convention.md), the *observable obligations* remain requirements:
SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> obliges per-request
resolution and the legible per-source failure when a secret is unresolvable, and
SRS008<!-- No secret value in any backend output --> obliges that no value leaks into output. The
*mechanism* those obligations presume — that the path is named by `<NAME>_FILE`, the trailing-
whitespace rule, and the exclusion of every other delivery path — is a structural choice, not a want,
and is specified **here**. No requirements-tree edit is made, mirroring the division
[ADR 0023 rev 1](0023-secret-output-containment.md) drew for the secret type. The pending
secret-resolution tests (TST014<!-- Pending: secret-resolution unit tests -->,
TST017<!-- Pending: unresolvable-secret failure-path test -->,
TST028<!-- Pending: secret rotation-without-restart test -->) hang off
SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> and verify the mechanism
this ADR now states.

## Alternatives considered

**A bare `<NAME>` environment variable carrying the value.** The env-var fallback sketch #35
superseded. Rejected: a file path and an environment variable for the same secret can both be present,
and resolution would then have to choose between them — shadowing that makes "where did this secret
come from" ambiguous and its answer environment-dependent. One delivery path keeps resolution
unambiguous. An environment variable holding the value directly also tends to leak more readily — into
child-process environments, crash dumps, and `/proc` — than a file the process opens on demand.

**A fixed mount path the image imposes** (e.g. a hardcoded `/run/secrets/<name>`). Rejected: it moves
the path from the deployment into the image, so the deployment cannot relocate the secret without an
image change — the opposite of SYS003<!-- A deployment is parameterised from outside the image -->'s
"parameterised from outside the image". Naming the path through `<NAME>_FILE` leaves the location the
environment's to choose.

**Docker secrets, or a secrets-manager SDK, resolved through a platform API.** Rejected: it couples
the backend to one provisioning platform's API and defeats substitutability. Reading a file path named
by an environment variable is what every container platform and secrets manager can already satisfy —
Docker and Kubernetes both present a secret as a file, and a manager can write one to a tmpfs — so the
file interface subsumes them all without importing any of their SDKs.

## Consequences

- **Provisioning is substitutable with no application-code change.** Because the backend only ever
  reads a file path named by an environment variable and knows nothing of how the file arrived, the
  provisioning side — a Docker secret, a Kubernetes secret volume, a bind-mounted file, a manager that
  writes to tmpfs — can be swapped freely. This is the obligation that had no home; it lives here now.
- **A rotated secret takes effect without a container restart.** Per-resolution reading — the
  surviving half of the removed re-read requirement, now carried by
  SRS006<!-- Unresolvable secret surfaces as that source's upstream failure --> and verified by
  TST028<!-- Pending: secret rotation-without-restart test --> — means a changed file is picked up on
  the next cache-missing resolution.
- **The exclusion and the whitespace rule are now stated, not merely asserted in a check.**
  TST014<!-- Pending: secret-resolution unit tests --> and
  TST017<!-- Pending: unresolvable-secret failure-path test --> assert that a bare `<NAME>` is ignored
  and that the value is trailing-whitespace-stripped; those assertions now verify an obligation this
  ADR states rather than one presumed nowhere.
- **No requirements-tree growth.** A later reader asking "what is the delivery mechanism?" is sent
  here by the failure clause of SRS006<!-- Unresolvable secret surfaces as that source's upstream
  failure -->, not to a requirement that restates the mechanism — the
  [ADR 0011 rev 1](0011-requirement-or-convention.md) division working as intended. What would reopen
  this record is a change to that division, or a deployment target the file interface cannot serve.
- **This is the delivery half of a two-part secrets story.**
  [ADR 0023 rev 1](0023-secret-output-containment.md) is the containment half: this ADR decides how a
  secret *arrives*, that one decides how it is kept out of output once it has.
