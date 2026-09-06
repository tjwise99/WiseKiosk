# `check-bringup`

The inputs `bring_up.py` has been run against, in both directions. What it *asserts*, and why, is
[`docs/CI.md`](../../docs/CI.md)'s § *Deployment and bring-up*; how to run a case is
[`../README.md`](../README.md)'s.

Run against release `v0.1.0` (latest, non-pre-release), digest
`sha256:27ff2637c52fe1e389a23693bb0c5fd8dcce175e9219c49006884ad46d3e589a`. Script md5
`d637a9fe8679bd38dbde24fc9821f97e` at `ca7d796 feat(ci): parse and run the documented bring-up
procedure`. A seed edits a scratch copy of `docs/DEPLOYMENT.md`'s fenced block and is run with
`bring_up.py --doc <copy> v0.1.0 <digest>`, which reaches the real release's assets and the real
image; the tracked `docs/DEPLOYMENT.md` and `deploy/compose.yaml` are never edited.

**Three rows below could not be run against the real recipe locally**, which binds host port 8080:
a container from an unrelated, longer-running task held that port on this worktree's runner for the
whole of this branch's work, and is not this branch's to stop. They are recorded as **predicted,
not yet observed** — grounded in `backend/internal/staticserve/staticserve.go`'s own handling (a
path that resolves to a directory, or that `os.Open` refuses, both fall through to the same
`http.NotFound`) and in the flag's own documented equivalence, rather than in a run of the harness.
The must-pass row for the recipe as committed **was** run, in CI rather than locally, for the same
reason (Docker 29.6.2, Compose v2 (5.1.4) on the runner) — a real run, not a prediction, of the case
that matters most: [run 34000590390, job `bring-up-ci-confirm`](https://github.com/tjwise99/WiseKiosk/actions/runs/34000590390/job/101398633749),
container start to reported success in 31s, well inside the 120s deadline the image's declared
healthcheck derives.

| Direction | Case | Input |
|---|---|---|
| Must pass | The block as committed | run in CI against `v0.1.0` (above) — `the documented bring-up procedure at v0.1.0 reaches a serving deployment` |
| Must fail | `latest` resolving to a digest other than the one this run was handed | passed 64 zeros as the expected digest — ``ghcr.io/tjwise99/wisekiosk:latest resolved to 'sha256:27ff2637…589a' after 60s, expected sha256:000…0 — latest has not propagated to the digest this release published`` |
| Must fail | The `docker compose up -d` line removed | seeded via `--doc`; no container ever starts — `` `docker compose ps -q kiosk` found no container () `` |
| Must pass — **predicted, not yet observed** | `docker compose up -d` spelled `docker compose up --detach` | the same flag, long form (discovery brief §6); expected to reach a serving deployment identically to the committed block |
| Must fail — **predicted, not yet observed** | The `cp config.example.json config.json` line removed | Docker creates an empty directory at the missing bind-mount source, so `/srv/kiosk/config.json` is a directory inside the container; `staticserve.go`'s handler resolves a directory to its `index.html`, finds none, and answers 404 like any other missing path — expected `` `/config.json answered 404, expected 200` `` |
| Must fail — **predicted, not yet observed** | `chmod 644` spelled `chmod 600` | the image's user is uid 10001, which does not own the file `cp` creates; a 600 file denies it read access, and `staticserve.go` does not distinguish a permission error from a missing file — expected the same `` `/config.json answered 404, expected 200` `` |

**Known gap.** Removing the `chmod 644` line is not seeded: `cp` preserves the tracked 644 mode of
`config.example.json` on the runner, so the line is redundant there and its absence is not a defect
this check can see (owner, 2026-09-04).

**The `bring-up` job's teardown step is unverified.** `docker compose down --volumes` under
`if: always()` in `.github/workflows/publish.yml` is outside `bring_up.py` and outside every row
above: it did not run locally (the same port-8080 conflict) and the CI run cited for the
committed-block row had no teardown step of its own to exercise it. It is unobserved rather than
predicted from source, unlike the three rows above, and stays that way until the first real
release's job runs it.
