# `smoke-native`

The inputs the native smoke harness under [`../native/`](../native/) has been run against, in both
directions. What the tier *guarantees* is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a
case is [`../README.md`](../README.md)'s.

Every case runs the harness from the tracked tree against a **binary and a served tree**, so a seed is
a build rather than a file edited in place: each row hands the harness a binary built with the setting
it is about, or a root naming a tree that is not a bundle. The rows were run at
`5800463 assert the architecture instead of printing it`, harness sha256
`c31a06701cbc6995fd72e7e474a33387a544891d09800ded306c4b10a85c58de`, against binaries built from that
tree with `go build -C backend ./cmd` under the environment each row names, and the bundle
`just check-build` emits.

The binary compiles its listen address in, so all but one row runs inside a private network namespace
— `unshare -rn`, unprivileged, with `lo` brought up — giving the case that address to itself. The
one exception is the held-address row, which needs the opposite.

| Direction | Case | Input |
|---|---|---|
| Must pass | A build for the architecture asked for, with the bundle it was pointed at | the `amd64` build, `frontend/dist`, `amd64` — `(elf64, built for amd64) came up serving frontend/dist, answered /healthz and /, and passed the liveness check it carries` |
| Must fail | A build for another architecture entirely | the `amd64` build handed `arm/6` — `is an amd64 build and this asked for arm — the ELF header's machine is not the architecture the binary was to be built for`. Asserted before the process is started, so a binary the host could not execute is reported as the wrong build rather than as one that would not run |
| Must fail | A build at the wrong ARM revision | `GOARM=7` handed `arm/6` — `records GOARM=7 and this asked for 6 — the header reaches arm and no further, so the recorded setting is what carries the revision`. The header half passes on that binary, which is why the recorded setting is read at all |
| Must fail | A build with the revision left to the toolchain | `GOARM` unset handed `arm/6` — the same line. `GOARCH=arm` defaults to `GOARM=7`, so dropping the setting from the recipe is silent in the header and in `e_flags`, and only the recorded setting reports it |
| Must fail | A static root naming no bundle | the `amd64` build, `/nonexistent/bundle`, `amd64` — `/ answered 404, expected 200 — the process is serving, and what it was pointed at (/nonexistent/bundle) is not a bundle it can serve`. Liveness still answers 200 on that root, which is the whole reason the page is fetched |
| Must fail | A file that is not a binary | `justfile` — `is not an ELF binary — this judged no binary` |
| Must fail | A binary that exits before answering | `sleep`, which rejects the harness's own `-static-root` flag — `the process exited 1 before answering /healthz — nothing this binary was built for came up serving (… invalid option -- 's' …)`, the process's own stderr carried through rather than a bare exit code |
| Must fail | A process alive and unreachable | the `amd64` build in a namespace with `lo` left **down** — `no 200 from /healthz within 30s — nothing this binary was built for came up serving`, measured at 30.2s wall, at the bound rather than hung |
| Must fail | The compiled-in address already held | the `amd64` build run on the host, outside a namespace, with `:8080` already served by another process — `something is already listening on 127.0.0.1:8080, the address … compiles in — every question below would have been answered by that process — this judged no binary` |
| Must fail | Too few arguments | the binary and a root with no architecture — the usage line, exit **2** rather than 1, so a mis-wired call is not a failed check |

**The held-address row is why the check exists at all.** The harness's first draft had no such guard
and **passed twice** while asserting nothing: another WiseKiosk process held `:8080` on the
development host, the binary under test died on the bind it lost, and liveness, the page and the
binary's own `-health-check` were all answered by the survivor. The wrong-static-root row passed the
same way. Both rows above fail only because the address is now refused before anything is probed.

**The architecture rows are the same defect one level up.** The harness parsed the ELF header from its
first version and used the result only in its success line, so it asserted nothing about the
architecture it is named for, and the `amd64` must-pass row above was originally the *only* thing the
header influenced. Reading the recorded `GOARM` beside it is what closes the narrower case the header
cannot reach.

**Legal input this rejects.** An architecture that records no revision must be named on its own
(`amd64`), not with one appended; `amd64/6` would be reported as a missing `GOARM` on a binary that
correctly has none.

**Known gaps.**

- **The armv6l binary is not executed by any row here.** This host registers no binary-format handler
  for it — `/proc/sys/fs/binfmt_misc/` is empty, there is no `qemu-arm`, and buildx offers only
  `linux/amd64` — and no handler was installed to change that. So the serving rows above all run the
  host's own `amd64` build, and what they establish is that the harness fails on a process that does
  not come up, not that the armv6l build comes up. **The armv6l verdict is the `native-arch` job's**,
  built and run under the emulation the runner registers
  (TST067<!-- Native armv6l build and smoke test -->), and no row here stands in for it.
- **The `-health-check` direction is not seeded.** That flag runs the same binary against the address
  the row before it has just proven answers, so making it fail needs a patched binary rather than a
  build setting or a wrong argument. No row here reports what a broken self-check looks like.
- **The revision is trusted to the toolchain's own record.** What is compared is the `GOARM` the Go
  toolchain wrote into the binary, not the instructions the binary contains. A build that recorded one
  revision and emitted another would pass, and nothing here disassembles anything.
- **Nothing here runs on a board.** Emulation decides that the build is for the right architecture and
  that it starts and serves; instruction timing, memory pressure and real peripherals are outside every
  row, and are named as unproven by the item the harness serves.
