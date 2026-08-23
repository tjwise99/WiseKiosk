# `check-image`

The inputs the five image-tier harnesses under [`../image/`](../image/) have been run against, in both
directions. What the tier *guarantees* is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a
case is [`../README.md`](../README.md)'s.

Every case runs the harness from the tracked tree against an image, so the seed is an **image** rather
than a file: each failing row builds a throwaway image `FROM wisekiosk:citest` carrying the defect and
hands that ref to the harness, and the two rows whose subject is the harness's own input instead patch
a copy of the harness in a scratch directory. The passing rows are `wisekiosk:citest` itself, built
from the tracked tree at `fab3916` by `just check-image`. Docker 29.6.2, buildx 0.31.1, native amd64.

| Direction | Case | Input |
|---|---|---|
| Must fail | A container running as root | `nonroot_uid.py` against `FROM wisekiosk:citest` + `USER root` — `runs as uid 0 — the container process holds root` |
| Must fail | A Dockerfile declaring no user | a copy of `nonroot_uid.py` in a scratch tree whose `Dockerfile` is `FROM alpine:3.24` + `RUN adduser …` and no `USER` — `the Dockerfile's final stage declares no USER`. Seeded on the Dockerfile rather than the image because that half reads the committed file, so no image can exercise it |
| Must fail | A configuration baked into the image | `config_bind_mount.py` against an image carrying `/srv/kiosk/config.json` — `/config.json answered 200 with no mount, expected 404 — the image serves 36 byte(s) of a default nobody deployed`. The mounted half still passes on that image: a bind mount shadows the baked file, which is why the unmounted half exists |
| Must fail | The same image, read for deployment content | `no_deployment_content.py` against it, with `ENV UPSTREAM_TOKEN_FILE=/run/secrets/upstream` added — two problems, one per surface: `/srv/kiosk/config.json exists in the image`, and `the image environment carries UPSTREAM_TOKEN_FILE` |
| Must fail | An image declaring writable storage two instances could share | `two_instances.py` against `FROM wisekiosk:citest` + `VOLUME /srv/kiosk` — `declares volume(s) /srv/kiosk` |
| Must fail | Two instances given one configuration | a copy of `two_instances.py` whose call site passes `[fixtures[0], fixtures[0]]` — `instance 0 serves the other instance's configuration`, and the same for instance 1 |
| Must fail | A survivor whose declared healthcheck fails | `two_instances.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/false"]` — `the surviving instance failed its declared healthcheck`. The harness runs whatever `Config.Healthcheck.Test` names, so the seed moves the declaration rather than the binary |
| Must fail | A secret present only in a layer a later step deleted | `layer_secret_scan.py` against an image that copies in `db_password = "…"` and then `rm`s it — `blobs/sha256/421bed…!etc/leaked.conf matches secret-patterns.txt:38`. `ls /etc/leaked.conf` inside that image exits 1, so the flattened filesystem an export reads does not carry it and only the layer read reports it |
| Must fail | A scan that cannot see its own canary | a copy of `layer_secret_scan.py` beside a `secret-patterns.txt` with the AWS-prefix line removed — `the canary planted in /tmp/planted was not reported — this scan cannot see a secret in a layer, so its clean result on the real image says nothing` |
| Must pass | The image built from the tracked tree | — |

**Every failing row above is a different assertion**, and the two seeded onto the harness rather than
the image are the two whose subject is what the harness was handed: an image cannot carry "the same
configuration mounted twice", and an image cannot carry a blind pattern set.

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

**Known gaps.**

- **One architecture.** Every row runs the native amd64 image. That the image is the same on another
  architecture is TST007's<!-- Pending: multi-arch build and smoke test --> and is not asserted here.
- **A secret this cannot decode is not seen.** Layer bytes are read as latin-1, so a value written
  UTF-16, compressed inside a file, or encrypted is invisible to every pattern. A layer written in a
  compression `tarfile` cannot open is the same case one level up, and the canary is what reports it:
  the canary is planted in a layer, so a scan that cannot open layers fails the run.
- **The pattern set bounds the predicate.** A secret whose shape no line describes passes. That is
  SRS025<!-- No secret material in the published image -->'s own recorded limit, not a hole this
  record closes.
- **Nothing here asserts what an operator does at run time.** A deployment can override the image's
  user, point two containers at one bind mount, or mount a configuration the process cannot read;
  each is named as unproven by the item the harness serves.
