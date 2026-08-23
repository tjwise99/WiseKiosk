# `check-image`

The inputs the image-tier harnesses under [`../image/`](../image/) have been run against, in both
directions — the six `check-image` runs, and `smoke.py`, which `smoke-image` runs once per
architecture. What the tier *guarantees* is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a
case is [`../README.md`](../README.md)'s.

Every case runs the harness from the tracked tree against an image, so the seed is an **image** rather
than a file: each failing row builds a throwaway image `FROM wisekiosk:citest` carrying the defect and
hands that ref to the harness, and the two rows whose subject is the harness's own input instead patch
a copy of the harness in a scratch directory. One row seeds nothing at all: a ref no image answers to
is what a leg that loaded nothing hands its harness. The passing rows are `wisekiosk:citest` itself, built
from the tracked tree at `fab3916` by `just check-image`. Docker 29.6.2, buildx 0.31.1, native amd64.

The `health_signal.py` rows were run at `30cb78c health signal`, script md5
`eea2db5dd1194bc636b2be76416c3dbf`, against `wisekiosk:citest` rebuilt there by `just check-image`.

The `no_deployment_content.py` rows were run at script md5 `ce85ce9f395149f9e758de41a3e9bb16`, the
harness carrying the schema-ranging arm, against `wisekiosk:citest` rebuilt by `just check-image`.

The `smoke.py` rows were run at `0636f95 the six image verification items`, script md5
`cbc077d2a78f3cfaf2a838548e861741`, against `wisekiosk:citest` rebuilt by
`just smoke-image linux/amd64` — one architecture, the host's, and the leg that reports the other is
CI's.

| Direction | Case | Input |
|---|---|---|
| Must fail | A container running as root | `nonroot_uid.py` against `FROM wisekiosk:citest` + `USER root` — `runs as uid 0 — the container process holds root` |
| Must fail | A Dockerfile declaring no user | a copy of `nonroot_uid.py` in a scratch tree whose `Dockerfile` is `FROM alpine:3.24` + `RUN adduser …` and no `USER` — `the Dockerfile's final stage declares no USER`. Seeded on the Dockerfile rather than the image because that half reads the committed file, so no image can exercise it |
| Must fail | A configuration baked into the image | `config_mount.py` against an image carrying `/srv/kiosk/config.json` — `/config.json answered 200 with no mount, expected 404 — the image serves 36 byte(s) of a default nobody deployed`. The mounted half still passes on that image: a bind mount shadows the baked file, which is why the unmounted half exists |
| Must fail | The same image, read for deployment content | `no_deployment_content.py` against it, with `ENV UPSTREAM_TOKEN_FILE=/run/secrets/upstream` added — two problems, one per surface: `/srv/kiosk/config.json exists in the image`, and `the image environment carries UPSTREAM_TOKEN_FILE` |
| Must fail | An image whose environment names something the configuration schema declares | `no_deployment_content.py` against `FROM wisekiosk:citest` + `ENV MODULES=weather` — `the image environment carries MODULES, which the configuration schema declares as modules`. The other two arms pass on that image, so the row measures the schema-ranging arm alone. Seeded in the spelling an environment actually uses: the comparison folds case, and the schema's own `ENV modules=weather` is reported the same way |
| Must fail | A schema declaring nothing to range over | a copy of `no_deployment_content.py` in a scratch tree whose `frontend/src/config/schema.json` is `{"type": "object"}` — `declares no property — this ranged over no declared name, so it cannot report an environment free of them`. Seeded on the harness's tree rather than the image because the schema is what the harness reads, not what the image carries |
| Must fail | An image declaring writable storage two instances could share | `two_instances.py` against `FROM wisekiosk:citest` + `VOLUME /srv/kiosk` — `declares volume(s) /srv/kiosk` |
| Must fail | Two instances given one configuration | a copy of `two_instances.py` whose call site passes `[fixtures[0], fixtures[0]]` — `instance 0 serves the other instance's configuration`, and the same for instance 1 |
| Must fail | A survivor whose declared healthcheck fails | `two_instances.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/false"]` — `the surviving instance failed its declared healthcheck`. The harness runs whatever `Config.Healthcheck.Test` names, so the seed moves the declaration rather than the binary |
| Must fail | A secret present only in a layer a later step deleted | `layer_secret_scan.py` against an image that copies in `db_password = "…"` and then `rm`s it — `blobs/sha256/421bed…!etc/leaked.conf matches secret-patterns.txt:38`. `ls /etc/leaked.conf` inside that image exits 1, so the flattened filesystem an export reads does not carry it and only the layer read reports it |
| Must fail | A scan that cannot see its own canary | a copy of `layer_secret_scan.py` beside a `secret-patterns.txt` with the AWS-prefix line removed — `the canary planted in /tmp/planted was not reported — this scan cannot see a secret in a layer, so its clean result on the real image says nothing` |
| Must fail | A health signal that cannot report unhealthy | `health_signal.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/true"]` — `the declared healthcheck exited 0 with nothing listening — the signal reports healthy in both states, so a healthy verdict from it means nothing`. The serving direction passes on that image, which is the whole reason the second direction exists |
| Must fail | A health signal that never reports healthy | the same, with `HEALTHCHECK CMD ["/bin/false"]` — `the declared healthcheck exited 1 () in a container answering /healthz` |
| Must fail | An image declaring no healthcheck | `HEALTHCHECK NONE` — `declares no CMD-form healthcheck (['NONE']) — this read no signal in either direction`, rather than a vacuous pass over a signal that is not there |
| Must fail | A healthcheck naming a binary the image does not carry | `HEALTHCHECK CMD ["/usr/local/bin/absent", "-health-check"]` — two problems, one being `could not be run on its own (127: …) — this judged nothing about the unhealthy direction`. Without that reserved-code guard, a vector the container never ran would read as a correctly reported failure |
| Must fail | A container that never serves | `ENTRYPOINT ["/bin/sleep", "300"]` — `no 200 from /healthz within 30s — this judged no serving container`, so the healthy direction is asserted against a container proven to be serving |
| Must fail | A ref naming no image | `smoke.py` against `wisekiosk:nosuchtag` — `` `docker image inspect …` exited 1 (No such image: wisekiosk:nosuchtag) — this judged no image ``. A leg whose build loaded nothing must not read as an architecture that was smoke-tested |
| Must fail | A container that runs and never serves | `smoke.py` against `FROM wisekiosk:citest` + `ENTRYPOINT ["/bin/sleep", "300"]` — `no 200 from /healthz within 30s — nothing this image was built for came up serving`, at the bound rather than hung |
| Must fail | A container serving, failing the healthcheck it declares | `smoke.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/false"]` — `the container failed the healthcheck the image declares: … exited 1`. The port half passes on that image, which is why the two are separate assertions |
| Must pass | The image built from the tracked tree | — |
| Must pass | The same image, smoke-tested on the architecture it was built for | `smoke.py` against `wisekiosk:citest` — `wisekiosk:citest (linux/amd64) came up, answered /healthz, and passed the healthcheck it declares` |

**Every failing row above is a different assertion**, and the three seeded onto the harness rather
than the image are the three whose subject is what the harness was handed: an image cannot carry "the
same configuration mounted twice", an image cannot carry a blind pattern set, and an image cannot
carry a schema that declares nothing.

**The seeding found a defect in the pattern set.** The first spelling of the assignment pattern was
`(?i)\b(?:…|password|passwd)\b["']?\s*[=:]…`, and the seeded image carrying `db_password = "…"` scanned
**clean**: `_` is a word character, so `\bpassword` does not match `db_password`, which is how the name
is almost always spelled. The pattern reads as if it works and matches nothing anyone writes. The
leading boundary is gone; without it the pattern still matches nothing in `wisekiosk:citest`, where the
broader `(?i)(?:…|secret|token|…)=…` it was measured against matches twice, both in `sbin/apk`.

**Why no entropy pattern.** Measured over the five layers of `wisekiosk:citest` at `fab3916`,
`\b[0-9a-f]{64}\b` matches 47 times and `\b[0-9A-Za-z+/]{40,}={0,2}\b` 8718 times — every one a content
digest, a certificate body or binary noise. A pattern that cannot pass on a clean image is not a check,
which is why [`../image/secret-patterns.txt`](../image/secret-patterns.txt) reaches entropy only through
a name.

**Legal input `health_signal.py` rejects.** A `HEALTHCHECK CMD-SHELL …` declaration is one string
rather than an argument vector, and is reported as no `CMD`-form healthcheck. The vector has to run
both inside a running container and as a container's own entrypoint, and only the exec form does;
handling the other would add a path no row here exercises.

**Known gaps.**

- **The status docker maintains is not read.** `health_signal.py` runs the declared vector itself, in
  each direction. The aggregated `.State.Health.Status` is docker's own scheduling of that same
  command — its interval, retries and start period are unexercised, and no row here says what a
  container listing would show.
- **One architecture.** Every row above runs the native amd64 image, `smoke.py`'s included: what they
  establish is that the harness fails on an image that does not come up, not that the arm64 image
  comes up. The arm64 verdict is the `image-arch` matrix's own leg, built and run under emulation in
  CI (TST007<!-- Multi-arch build and smoke test -->), and no row here stands in for it.
- **A secret this cannot decode is not seen.** Layer bytes are read as latin-1, so a value written
  UTF-16, compressed inside a file, or encrypted is invisible to every pattern. A layer written in a
  compression `tarfile` cannot open is the same case one level up, and the canary is what reports it:
  the canary is planted in a layer, so a scan that cannot open layers fails the run.
- **A declared name reworded is not seen.** The image environment is read for the schema's property
  names with case folded, so `modules` and `MODULES` are both reported; `KIOSK_MODULES` and
  `MODULE_LIST` are not. The predicate is the schema's vocabulary, not a paraphrase of it.
- **The pattern set bounds the predicate.** A secret whose shape no line describes passes. That is
  SRS025<!-- No secret material in the published image -->'s own recorded limit, not a hole this
  record closes.
- **Nothing here asserts what an operator does at run time.** A deployment can override the image's
  user, point two containers at one bind mount, or mount a configuration the process cannot read;
  each is named as unproven by the item the harness serves.
