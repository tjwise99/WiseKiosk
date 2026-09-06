# `check-vulns-image` (`scripts/vulns/check_vulns.py --scope image`)

The inputs this check has been run against, in both directions. What it *asserts* is
[`docs/CI.md`](../../docs/CI.md) § *Image vulnerabilities*'s and § *The exception register*'s;
how to run a case is [`../README.md`](../README.md)'s.

**No fixture is committed** — [ADR 0010 rev 2](../../docs/decisions/0010-runtime-materialised-gate-fixtures.md)
forbids a resolvable vulnerable artifact in the tracked tree. Every row below is a throwaway image
built at record time, run through the production script (`python3 scripts/vulns/check_vulns.py --scope
image --image <tag> --register <register>`) with `--image` pointed at it. Trivy 0.74.0 (the version
`scripts/vulns/check_vulns.py`'s `TRIVY_IMAGE` pins), against the local Docker daemon. The seed:

```
FROM alpine:3.10@sha256:451eee8bedcb2f029756dc3e9d73bab0e7943c1ac55cff3a4861c52a0fdd3e98
```

built with `docker buildx build --load --tag <seed-tag> <dir>`. That digest of `alpine:3.10` carries
one finding, `CVE-2021-36159` in `apk-tools` at `2.10.6-r0` (`Fixed Version: 2.10.7-r0`) — an OpenSSL-
era `apk` archive-handling out-of-bounds read, `CRITICAL`. The register rows below are the same seed
image with the register argument changed; nothing about the image itself varies.

| Direction | Case | Input |
|---|---|---|
| Must fail | The seed image, unregistered | the seed above, empty register (`[]`) — exits 1: `CVE-2021-36159 (apk-tools (2.10.6-r0)) is unregistered — trivy reports it` |
| Must pass | The seed image, every observed finding registered under scope `image` | `[{"advisory": "CVE-2021-36159", "scope": "image", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "2026-10-01"}]` — exits 0; `register=registered (CVE-2021-36159)` |
| Must fail | An orphan entry | `[{"advisory": "CVE-9999-9999", "scope": "image", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "2026-10-01"}]`, an id Trivy does not report against the seed — exits 1: `register entry ('CVE-9999-9999') is an orphan — no image finding this run reports matches it`, and `CVE-2021-36159` still fails unregistered |
| Must fail | An expired `review_by` | `[{"advisory": "CVE-2021-36159", "scope": "image", "no_fix_because": "t", "no_alternative_because": "t", "review_by": "2020-01-01"}]` — exits 1: `register entry ('CVE-2021-36159'): review_by 2020-01-01 has passed (today is 2026-09-06)`, and the finding itself still fails, unregistered |
| First run\* | `wisekiosk:citest`, built from this branch's own head, empty register | `docker buildx build --load --tag wisekiosk:citest .` (`just check-image`'s own build step), then the production script against it — see note below |

\* **This is not a pass/fail row.** It is the first time this scope ran against a real build, and the
image (base `alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b`,
digest-pinned in the `Dockerfile`) carries 20 findings: 10 distinct CVEs (`CVE-2026-14456`,
`CVE-2026-14457`, `CVE-2026-18798`, `CVE-2026-54874`, `CVE-2026-63072`, `CVE-2026-63073`,
`CVE-2026-63074`, `CVE-2026-63075`, `CVE-2026-63076`, `CVE-2026-75803`), each in both packages
`libcrypto3` and `libssl3` at `3.5.7-r0` (1 `HIGH`, 4 `MEDIUM`, 5 `LOW`) — exit 1, none registered.
Per the owner's ruling on #265, a first real run finding something reports rather than blocks: the
`image-tests` step carries `continue-on-error: true` until
[#293 clear the first-run image vulnerability findings and make the Trivy step blocking](https://github.com/tjwise99/WiseKiosk/issues/293)
registers or fixes them; see [`../../docs/CI.md`](../../docs/CI.md) § *Image vulnerabilities*.

**The population above moves with Trivy's own vulnerability database**, downloaded fresh on every
run (no cache, per the owner's ruling on #265) — like `check-vulns-go`'s standard-library baseline,
this is the live tree rather than a fixed count, and a later run against the same digests can report
more or fewer findings as the database is updated.
