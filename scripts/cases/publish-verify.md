# The `verify` job's release checks (`scripts/publish/sbom_attest.py`, `verify_metadata.py`, `verify_release.py`)

The inputs these checks have been run against, in both directions. What they *assert*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s § *Publishing and provenance*; how to run a case is
[`../README.md`](../README.md)'s. `scripts/publish/verify_permissions.py` (the no-write-scope gate)
has its own file, [`check-publish-permissions.md`](check-publish-permissions.md).

**Tools, pinned as run:** cosign v3.1.3 (`sigstore/cosign-installer`, `cosign-release: v3.1.3`); syft
v1.51.1 (`anchore/sbom-action/download-syft`, `syft-version: v1.51.1`); `check-jsonschema==0.38.0`
(`pipx run`, pinned in `scripts/publish/verify_release.py` rather than in the workflow, since that is
where the invocation lives); `gh` and `docker buildx imagetools inspect` at whatever version the
runner or this host provides — neither is pinned, matching this repository's existing convention for
those two tools elsewhere.

## What is verified here, against measured and synthetic data

No release has been published from this workflow yet — the `verify` job's first live run is the
`v0.0.1 --prerelease` exercise scheduled for after this PR merges (§ *Sequencing*, WI4). Everything
below was exercised against real tool output measured for this ticket (a throwaway image built from
this repository's own `Dockerfile`, pushed to a local `registry:2` container, scanned with the pinned
syft and inspected with `docker buildx imagetools inspect`, measured during implementation and not
separately retained) and against realistic synthetic fixtures built from that measured shape. The
**reviewer-runnable seeds** section below is what a reviewer (or WI4's
exercise) runs against a real published digest once one exists.

**`sbom_attest.py` (publish job, per-child SBOM generation and attestation).** `read_children`
(`scripts/publish/common.py`) parsed a real two-entry `docker buildx imagetools inspect --format
'{{json .Manifest}}'` output (one real platform child plus a docker-generated attestation-manifest
descriptor at `platform: {"architecture":"unknown","os":"unknown"}`, produced when a test build did
not disable provenance/sbom) into `[{"digest": ..., "platform": "linux/amd64"}]` pairs — verified
against a mocked two-child fixture directly (`{'digest': 'sha256:aaa', 'platform': 'linux/amd64'},
{'digest': 'sha256:bbb', 'platform': 'linux/arm64'}`), matching the two-platform shape production
always builds (`platforms: linux/amd64,linux/arm64`) with `provenance: false, sbom: false`, which
never produces the spurious third entry.

**`verify_metadata.py` (2d, annotations and labels).** Exercised against a real image pushed to a
local registry with `--annotation`/`--label` flags:

| Direction | Case | Result |
|---|---|---|
| Must fail | Two of nine keys set, seven missing, on `index`, `manifest` and `manifest-descriptor` levels | lists the seven missing keys per surface, by name |
| Must fail | All nine keys set everywhere, wrong `COMMIT` env | `.revision` binding fails on every surface and on the labels, each with the surface named |
| Must fail | `DOCKER_METADATA_ANNOTATIONS_LEVELS: index,bogus-level` | `unrecognised annotation level 'bogus-level'`, and `index` is still checked |
| Must fail | A single real platform, but `CHILDREN`/index has more than one child | `.Image is a single config but the index has N platform child(ren)` — the degenerate single-platform `.Image` shape (no platform-keyed map) is asserted rather than silently mismatched |
| Must pass | All nine keys set on `index`, `manifest`, `manifest-descriptor` and labels, matching commit | `3 annotation level(s), 3 surface(s), 1 child config(s): the nine keys are present and bound to <commit>` |

**Gap, unverified locally.** The genuinely multi-platform case — two *real* platform children, where
`imagetools inspect --format '{{json .Image}}'` returns a platform-keyed map (`{"linux/amd64": {...},
"linux/arm64": {...}}`) rather than the bare single-platform struct above — could not be produced in
this environment: `docker run --rm --privileged tonistiigi/binfmt --install arm64` (and `--install
all`) registered the emulator, but both the default `docker`-driver builder and a fresh
`docker-container` builder failed the arm64 leg with `exec format error` on the base image's `apk add`
step. `check_labels`'s platform-keyed branch is written to this documented, stable `buildx` behaviour
but has not been exercised against a real two-platform push. Worth confirming on WI4's pre-release
exercise.

**`verify_release.py`'s pure logic (2a signature parsing, 2b provenance field checks, 2c SBOM content
assertions) — unit-tested directly**, since the surrounding `cosign`/`gh` calls need a real signed
digest this PR cannot produce:

| Function | Case | Result |
|---|---|---|
| `check_sbom_content` | A clean predicate: Go module present, one `distro=alpine-3.24.1` qualifier, describing package `versionInfo` matches the child digest, purl `arch=amd64` matches the platform | no problems |
| `check_sbom_content` | No package carries a `distro=` qualifier at all | `no package carries a purl 'distro=' qualifier` |
| `check_sbom_content` | Cross-wired binding: describing package's `versionInfo` is the *other* child's digest, everything else (Go module, distro) correct | fails only `describing package versionInfo '...' does not equal the child digest '...'` — the Go-module and distro assertions do not also fire, proving the binding fails by name rather than by accident (criterion 11) |
| `check_sbom_content` | Wrong distro name (`debian` against a Dockerfile whose final `FROM` is `alpine`) | `distro name 'debian' does not match the Dockerfile's final FROM image 'alpine'` |
| pair-set comparison (inline, `attested_pairs != regenerated_pairs`) | One package's `versionInfo` altered between the attested and regenerated sets (version drift) | set inequality detected, with the differing pair named on each side |
| `extract_predicate` | A synthetic DSSE envelope (`{"payload": base64(json), ...}`) matching `cosign verify-attestation`'s documented output shape | round-trips to the original predicate exactly |
| `check_provenance_fields` | A realistic `--format json` entry matching the plan's measured shape (`buildSignerURI`, `sourceRepositoryURI`, `sourceRepositoryDigest`, `statement.subject[0].digest.sha256`, `predicateType`) | no problems |
| `check_provenance_fields` | Wrong `sourceRepositoryDigest` | fails only the `sourceRepositoryDigest` assertion |
| `check_provenance_fields` | Wrong `subject[0].digest.sha256` | fails only the subject-digest assertion |
| `check_provenance_fields` | Two entries instead of one | `expected exactly one attestation entry, got 2` |
| `go_module_name`, `dockerfile_final_from`, `purl_qualifier` | Run against this repository's own `backend/go.mod` and `Dockerfile`, and against `pkg:apk/alpine/alpine-baselayout@3.7.2-r1?arch=x86_64&distro=alpine-3.24.1` (a real apk purl measured with syft v1.51.1 against this repository's own image) | `github.com/tjwise99/WiseKiosk/backend`; `('alpine', '3.24')`; `alpine-3.24.1` / `x86_64` respectively — all match the measured values exactly |

**The vendored SPDX 2.3 schema** (`scripts/publish/spdx-schema-2.3.json`, from
https://github.com/spdx/spdx-spec/blob/v2.3/schemas/spdx-schema.json at tag `v2.3`) validated a real
syft-generated SBOM (`ok -- validation done`) and rejected the same document with `spdxVersion`
deleted (`'spdxVersion' is a required property`), via `check-jsonschema==0.38.0`.

## Reviewer-runnable seeds, against any real published digest

Once a real release exists (WI4's pre-release exercise, or any later release), each of these can be
run directly and is expected to fail for the reason given. None of these mutate the release; each
either targets a deliberately wrong identity/digest/workflow, or a throwaway copy pushed under a
mismatched digest.

- **Signature, wrong identity.** `cosign verify --certificate-identity-regexp
  '^https://example\.invalid/' --certificate-oidc-issuer https://token.actions.githubusercontent.com
  <ref>@<digest>` — exits non-zero, printing `none of the expected identities matched`.
- **Provenance, wrong signer workflow.** `gh attestation verify oci://<ref>@<digest> --repo
  tjwise99/WiseKiosk --signer-workflow tjwise99/WiseKiosk/.github/workflows/checks.yml` — exits
  non-zero, printing `Error: verifying with issuer "sigstore.dev"`.
- **Provenance, flipped digest.** The same command against `<ref>@sha256:<the real hex, reversed>` —
  exits non-zero, printing the same literal text as the wrong-signer-workflow case; this is the
  observed non-discrimination criterion 3 records — the message does not say which of the two failed,
  which is why the positive `--format json` field assertions above are what actually bind the check.
- **Provenance, registry-copy `--bundle-from-oci`, absent or wrong digest.** Push a throwaway copy of
  the image under a mismatched digest (or strip the bundle), never the real release, and run `gh
  attestation verify oci://<that ref>@<that digest> --repo tjwise99/WiseKiosk --signer-workflow
  tjwise99/WiseKiosk/.github/workflows/publish.yml --bundle-from-oci` — must fail.
- **SBOM, version-drift predicate.** Take a real attested SPDX predicate, alter one package's
  `versionInfo`, feed it in place of the regenerated document — must fail the `(name, versionInfo)`
  pair comparison (not the binding assertion).
- **SBOM, cross-wired predicate.** Feed one child's real SBOM predicate in place of the other's — the
  two children's pair sets differ only in the describing package's own `(name, versionInfo)` entry, so
  this must fail the binding assertion specifically, not the pair comparison.
- **`verify_permissions.py` fail-closed guards**, against throwaway `publish.yml` copies (not the
  committed one): `packages: write` added under `verify`; the `verify` job renamed. Both covered fully
  in [`check-publish-permissions.md`](check-publish-permissions.md).
- **`verify_metadata.py`'s unknown-level guard**, against a throwaway `publish.yml` copy declaring
  `DOCKER_METADATA_ANNOTATIONS_LEVELS: index,bogus-level` — already exercised above against a real
  pushed image; reproducible against any digest.

**Fallibility is recorded once here, against throwaway copies; no standing meta-gate re-tests it**
([`docs/CI.md`](../../docs/CI.md) § *Generated boundary contract* states that convention).

## Known gaps, per the owner

Each needs a deliberately broken release and is unseeded, by the owner's own ruling that seeding a
broken release was skipped for #269 publish verification: a missing release asset; a missing
attestation (no SBOM, no signature, or no provenance attached to a child); a dropped annotation key;
an empty annotation or label value; a wrong `.revision` on one surface only (the others correct).

## Fail-direction in CI

Not yet exercised — the first release is the first run. Back-filled with run IDs, `cosign tree`'s
observed child headings, and `gh`'s observed positive JSON, by the docs-only follow-up PR after the
pre-release exercise (§ *Sequencing*, WI4), not by a commit inside this PR.
