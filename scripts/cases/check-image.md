# `check-image`

The inputs the image-tier harnesses under [`../image/`](../image/) have been run against, in both
directions — the seven `check-image` runs, and `smoke.py`, which `smoke-image` runs once per
architecture. What the tier *guarantees* is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a
case is [`../README.md`](../README.md)'s.

Every case runs the harness from the tracked tree against an image, so the seed is an **image** rather
than a file: each failing row builds a throwaway image `FROM wisekiosk:citest` carrying the defect and
hands that ref to the harness, and the seven rows whose subject is the harness's own input instead run
a copy of the harness in a scratch directory carrying that input. One row builds its image from a patched copy of the
tracked tree instead, the defect it seeds being what the running handler serves rather than anything a
layer on top can carry. One row seeds nothing at all: a ref no image answers to is what a leg that
loaded nothing hands its harness. The passing rows are `wisekiosk:citest` itself, built from the
tracked tree at `fab3916` by `just check-image`. Docker 29.6.2, buildx 0.31.1, native amd64.

The `health_signal.py` rows were run at `30cb78c health signal`, script md5
`eea2db5dd1194bc636b2be76416c3dbf`, against `wisekiosk:citest` rebuilt there by `just check-image`.

The `no_deployment_content.py` rows were run at script md5 `ce85ce9f395149f9e758de41a3e9bb16`, the
harness carrying the schema-ranging arm, against `wisekiosk:citest` rebuilt by `just check-image`.

The byte-fidelity, served-tree, declared-root and layerless rows were run at
`b7bae6a a cleanup that fails is not the verdict`, `layer_secret_scan.py` at script md5
`9a7ebe9428a32cf15be763fb36632cc1`, against `wisekiosk:citest` rebuilt there by `just check-image`.

The `liveness_path.py` rows were run at `7676c45 the Image row names the third harness in the job`,
script md5 `4ed69ccaa8bad519671ef7fcd211526c`, against `wisekiosk:citest` rebuilt there by
`docker buildx build --load --tag wisekiosk:citest .`, and against seeded images each built
from a copy of the tracked tree at that commit — where `frontend/src/lib/liveness.ts`,
`backend/cmd/main.go` and the `Dockerfile` stand as they did at `a38f631`. Every row was re-run at
that md5: the polled-path pattern changed, so a row recorded against the previous one measured a
different reader.

The `smoke.py` rows were run at `0636f95 the six image verification items`, script md5
`cbc077d2a78f3cfaf2a838548e861741`, against `wisekiosk:citest` rebuilt by
`just smoke-image linux/amd64` — one architecture, the host's, and the leg that reports the other is
CI's.

| Direction | Case | Input |
|---|---|---|
| Must fail | A container running as root | `nonroot_uid.py` against `FROM wisekiosk:citest` + `USER root` — `runs as uid 0 — the container process holds root` |
| Must fail | A Dockerfile declaring no user | a copy of `nonroot_uid.py` in a scratch tree whose `Dockerfile` is `FROM alpine:3.24` + `RUN adduser …` and no `USER` — `the Dockerfile's final stage declares no USER`. Seeded on the Dockerfile rather than the image because that half reads the committed file, so no image can exercise it |
| Must fail | A Dockerfile declaring root | the same scratch tree with `USER root` as its final stage's declaration — `the Dockerfile's final stage declares USER root, which is root`. Handed `wisekiosk:citest`, whose container runs as uid 10001, so the row measures the declaration alone: a declaration naming root and no declaration at all are separate problems the harness reports separately |
| Must fail | An image serving bytes that are not the mounted file's | `config_mount.py` against an image built from a copy of the tracked tree whose `staticserve` handler appends a byte to every file it serves — `/config.json served 69 byte(s) that are not the mounted fixture's 68 — the mounted configuration is not what reaches the page`. The unmounted half still passes on that image, so the row measures byte fidelity alone. Seeded in the source rather than on top of the image because a layer cannot alter what a handler does with a file the deployment mounts |
| Must fail | A configuration baked into the image | `config_mount.py` against an image carrying `/srv/kiosk/config.json` — `/config.json answered 200 with no mount, expected 404 — the image serves 36 byte(s) of a default nobody deployed`. The mounted half still passes on that image: a bind mount shadows the baked file, which is why the unmounted half exists |
| Must fail | The same image, read for deployment content | `no_deployment_content.py` against it, with `ENV UPSTREAM_TOKEN_FILE=/run/secrets/upstream` added — two problems, one per surface: `/srv/kiosk/config.json exists in the image`, and `the image environment carries UPSTREAM_TOKEN_FILE` |
| Must fail | An image whose environment names something the configuration schema declares | `no_deployment_content.py` against `FROM wisekiosk:citest` + `ENV MODULES=weather` — `the image environment carries MODULES, which the configuration schema declares as modules`. The other two arms pass on that image, so the row measures the schema-ranging arm alone. Seeded in the spelling an environment actually uses: the comparison folds case, and the schema's own `ENV modules=weather` is reported the same way |
| Must fail | A schema declaring nothing to range over | a copy of `no_deployment_content.py` in a scratch tree whose `frontend/src/config/schema.json` is `{"type": "object"}` — `declares no property — this ranged over no declared name, so it cannot report an environment free of them`. Seeded on the harness's tree rather than the image because the schema is what the harness reads, not what the image carries |
| Must fail | An image carrying no served tree at all | `no_deployment_content.py` against `FROM wisekiosk:citest` + `USER root` + `RUN rm -rf /srv/kiosk` — `the export holds nothing under /srv/kiosk/ — this read no served tree, so it cannot report what the served tree does not carry`. Nothing sits at the configuration path in that image either, which is the whole point: an export that reached no served tree must not read as an image free of deployment content |
| Must fail | An image declaring writable storage two instances could share | `two_instances.py` against `FROM wisekiosk:citest` + `VOLUME /srv/kiosk` — `declares volume(s) /srv/kiosk` |
| Must fail | Two instances given one configuration | a copy of `two_instances.py` whose call site passes `[fixtures[0], fixtures[0]]` — `instance 0 serves the other instance's configuration`, and the same for instance 1 |
| Must fail | A survivor whose declared healthcheck fails | `two_instances.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/false"]` — `the surviving instance failed its declared healthcheck`. The harness runs whatever `Config.Healthcheck.Test` names, so the seed moves the declaration rather than the binary |
| Must fail | A secret present only in a layer a later step deleted | `layer_secret_scan.py` against an image that copies in `db_password = "…"` and then `rm`s it — `blobs/sha256/421bed…!etc/leaked.conf matches secret-patterns.txt:38`. `ls /etc/leaked.conf` inside that image exits 1, so the flattened filesystem an export reads does not carry it and only the layer read reports it |
| Must fail | A scan that cannot see its own canary | a copy of `layer_secret_scan.py` beside a `secret-patterns.txt` with the AWS-prefix line removed — `the canary planted in /tmp/planted was not reported — this scan cannot see a secret in a layer, so its clean result on the real image says nothing` |
| Must fail | An image saved with no layer to open | `layer_secret_scan.py` against `FROM scratch` + `ENV WISEKIOSK=layerless` — two problems, one being `saved with no layer this could open — this read no layer`. The other is the canary: a layerless image carries neither a passwd file nor a shell, so the throwaway build cannot run, and both halves report having judged nothing rather than a clean image |
| Must fail | A health signal that cannot report unhealthy | `health_signal.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/true"]` — `the declared healthcheck exited 0 with nothing listening — the signal reports healthy in both states, so a healthy verdict from it means nothing`. The serving direction passes on that image, which is the whole reason the second direction exists |
| Must fail | A health signal that never reports healthy | the same, with `HEALTHCHECK CMD ["/bin/false"]` — `the declared healthcheck exited 1 () in a container answering /healthz` |
| Must fail | An image declaring no healthcheck | `HEALTHCHECK NONE` — `declares no CMD-form healthcheck (['NONE']) — this read no signal in either direction`, rather than a vacuous pass over a signal that is not there |
| Must fail | A healthcheck naming a binary the image does not carry | `HEALTHCHECK CMD ["/usr/local/bin/absent", "-health-check"]` — two problems, one being `could not be run on its own (127: …) — this judged nothing about the unhealthy direction`. Without that reserved-code guard, a vector the container never ran would read as a correctly reported failure |
| Must fail | A container that never serves | `ENTRYPOINT ["/bin/sleep", "300"]` — `no 200 from /healthz within 30s — this judged no serving container`, so the healthy direction is asserted against a container proven to be serving |
| Must fail | The route the mux registers renamed alone | `liveness_path.py` against an image built from a copy of the tracked tree whose `healthPath` is `/livez` — `the bundle polls /healthz and the container answered 404 — the page would report the backend unreachable against a backend that is serving`. This is the defect the harness exists for, and every other gate is green on that tree: the render tier mocks the route from the frontend constant and the backend tests assert the mux from the Go one |
| Must fail | The constant the page polls renamed alone | the same shape with `LIVENESS_URL = '/livez'` — `the bundle polls /livez and the container answered 404 …`. The shipped-bundle half passes on that image, the renamed constant reaching the script it ships, so the row measures the seam alone |
| Must fail | A polled path the served tree answers | the same shape with `LIVENESS_URL = '/'` — `/ answered the served index rather than liveness — the polled path reaches the static tree, not the handler the mux registers liveness at`. A status alone would read as agreement here |
| Must fail | An image shipping no script | `liveness_path.py` against `FROM wisekiosk:citest` + `USER root` + `RUN rm -f /srv/kiosk/assets/*.js` — `the export holds no .js under /srv/kiosk/ — this read no shipped bundle, so it cannot report what the bundle polls`. That container still answers `/healthz`, so the row measures the shipped-bundle half alone |
| Must fail | A frontend that computes its liveness URL | a copy of `liveness_path.py` in a scratch tree whose `frontend/src/lib/liveness.ts` reads `export const LIVENESS_URL = BASE + '/healthz'` — `declares no LIVENESS_URL string literal — this read no polled path, and cannot decide what a computed URL asks for`. Seeded on the harness's tree rather than the image because the constant is what the harness reads |
| Must fail | The same URL assembled by interpolation instead | the same scratch tree, the constant instead interpolating that base into a template literal — the same problem line. A backtick literal with nothing interpolated is read like either other quote, so the arm refusing this one refuses `$` rather than the backtick; without the row, "a template literal is rejected" would rest on the pattern reading as if it did |
| Must fail | A ref naming no image, for the polled path | `liveness_path.py` against `wisekiosk:nosuchtag` — `` `docker create wisekiosk:nosuchtag` exited 1 (…) — this judged no image `` |
| Must fail | A container that runs and never serves, for the polled path | `liveness_path.py` against `FROM wisekiosk:citest` + `ENTRYPOINT ["/bin/sleep", "300"]` — `no 200 from / within 30s — this judged no serving container, so it read no answer to the polled path`, at the bound rather than hung. Readiness is the served index and not the path under test, which is what keeps a renamed route a 404 rather than a container that never came up |
| Must pass | Both sides renamed together | `liveness_path.py` against an image built from a copy of the tracked tree with `healthPath` and `LIVENESS_URL` both `/livez` — `wisekiosk:seed-both ships /livez in 1 of 1 script(s) under /srv/kiosk/, and a container answers it 200 with something other than the served index`. The legal input spelled differently: the path is the two sides' own convention and nothing published rests on which string it is |
| Must pass | The constant carrying a type annotation | a copy of `liveness_path.py` in a scratch tree whose `frontend/src/lib/liveness.ts` reads `export const LIVENESS_URL: string = '/healthz'` — `wisekiosk:citest ships /healthz in 1 of 1 script(s) under /srv/kiosk/, and a container answers it 200 with something other than the served index`. Legal and behaviour-preserving: before the annotation was read, this input was reported as a file declaring no literal, about a file that plainly declares one |
| Must fail | A ref naming no image | `smoke.py` against `wisekiosk:nosuchtag` — `` `docker image inspect …` exited 1 (No such image: wisekiosk:nosuchtag) — this judged no image ``. A leg whose build loaded nothing must not read as an architecture that was smoke-tested |
| Must fail | A container that runs and never serves | `smoke.py` against `FROM wisekiosk:citest` + `ENTRYPOINT ["/bin/sleep", "300"]` — `no 200 from /healthz within 30s — nothing this image was built for came up serving`, at the bound rather than hung |
| Must fail | A container serving, failing the healthcheck it declares | `smoke.py` against `FROM wisekiosk:citest` + `HEALTHCHECK CMD ["/bin/false"]` — `the container failed the healthcheck the image declares: … exited 1`. The port half passes on that image, which is why the two are separate assertions |
| Must pass | The image built from the tracked tree | — |
| Must pass | The same image, smoke-tested on the architecture it was built for | `smoke.py` against `wisekiosk:citest` — `wisekiosk:citest (linux/amd64) came up, answered /healthz, and passed the healthcheck it declares` |

**Every failing row above is a different assertion**, and the seven whose seed is a file the harness
reads rather than an image handed to it are the seven whose subject is that file: an image cannot
carry "the same configuration mounted twice", it cannot carry a blind pattern set, it cannot carry a
schema that declares nothing, it cannot carry a frontend constant that is not a literal — two rows,
one per way a URL is assembled — and it cannot carry the `USER` another tree's Dockerfile declares,
two rows again, one per way that declaration fails.

**Three liveness-path rows seed a copy of the tracked tree rather than a layer on top.** Which path
the mux registers and which path the shipped script asks for are decided in the source and baked by
the build, so no `FROM wisekiosk:citest` layer can move either.

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

**Legal input `liveness_path.py` rejects.** A liveness URL assembled rather than declared — a base
joined to a suffix, or that base interpolated into a template literal — is legal TypeScript polling
the same path, and is reported as no literal. A backtick literal with nothing interpolated into it is
read like either other quote, as is a type annotation on the constant; what the backtick arm refuses
is `$`, since what is captured has to be the whole path. The alternative is executing the module to
find out what it asks for, which is the render tier's job and not a harness's.

**Known gaps.**

- **A consistent rename passes this and fails its siblings.** `smoke.py`, `health_signal.py`,
  `config_mount.py` and `two_instances.py` each restate `/healthz` to poll it, so the "both sides
  renamed together" row above passes `liveness_path.py` and would fail those four. Their probes are
  the tier's own, not the seam under test; what this contributes is the path printed in the success
  line, so the sibling failure is legible rather than mysterious.
- **A third spelling is not read.** `frontend/tests/render/harness.ts` mocks the route as
  `**/healthz`. It decides what the render tier's page sees and reaches no shipped artifact, so
  nothing here judges it, and a rename of both product sides leaves that mock stale until the render
  tier fails on it.
- **The path is judged, not the polling.** That the page asks at all, at its interval, and reports
  the outage it should, is the unit and render tiers'; this decides only that what the bundle asks
  for is what the mux answers.

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
