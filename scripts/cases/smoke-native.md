# `smoke-native`

The inputs the native smoke harness under [`../native/`](../native/) has been run against, in both
directions. What the tier *guarantees* is [`docs/TESTING.md`](../../docs/TESTING.md)'s; how to run a
case is [`../README.md`](../README.md)'s.

A seed here is a **build**, not a file edited in place: each row hands the harness a binary built with
the setting it is about, an expectation spelled the way it is about, or a root naming a tree that is
not a bundle. The rows were run at `247ca8e assert the architecture instead of printing it`, harness
sha256 `ad4b451f2c911f2b3cdc5392af1dd2b9d5494dddda68eb4f0e96d52fcbc5bfcf`, against binaries built from
that tree with `go build -C backend ./cmd` under the environment each row names, and the bundle
`just check-build` emits. Go 1.26.5.

The binary compiles its listen address in, so all but two rows run inside a private network namespace
— `unshare -rn`, unprivileged, `lo` brought up — giving the case that address to itself. The
held-address row needs the opposite, and the argument-count row starts nothing.

Each failing row names **which assertion fired**, because one over-broad assertion could produce
several of these failures and still look correct.

| Direction | Case | Fires on | Input |
|---|---|---|---|
| Must pass | A build for the architecture asked for, with the bundle it was pointed at | — | the `amd64` build, `frontend/dist`, `amd64` — `(elf64, built for amd64) came up serving frontend/dist, answered /healthz and /, and passed the liveness check it carries` |
| Must fail | A build for another architecture entirely | machine | the `amd64` build handed `arm/6` — `is an amd64 build and this asked for arm — the ELF header's machine is not the architecture the binary was to be built for`. Asserted before the process starts, so a binary this host could not execute is reported as the wrong build rather than as one that would not run |
| Must fail | A build at the wrong ARM revision | buildinfo | `GOARM=7` handed `arm/6` — `records GOARM=7 and this asked for 6 — the header reaches arm and no further, so the recorded setting is what carries the revision`. The machine half passes on that binary, which is why the recorded setting is read at all |
| Must fail | A build with the revision left to the toolchain | buildinfo | `GOARM` unset handed `arm/6` — the same line, `GOARM=7`. `GOARCH=arm` defaults to `GOARM=7`, so dropping the setting is invisible in the header and in `e_flags` |
| Must fail | An expectation naming no revision for an architecture that records one | expectation | the `armv6` build handed `arm` — `arm names no GOARM — an arm build records one, so this would accept any revision`. Rejected before any file is read |
| Must fail | The same, spelled with an empty revision | expectation | handed `arm/` — the same line. This is the spelling the recipe produces if its revision setting is emptied, so `arm` alone is not the only shape that has to fail |
| Must fail | An expectation naming a revision for an architecture that records none | expectation | the `amd64` build handed `amd64/6` — `amd64/6 names a GOARM — only an arm build records one, so no binary satisfies this` |
| Must fail | A static root naming no bundle | page | the `amd64` build, `/nonexistent/bundle`, `amd64` — `/ answered 404, expected 200 — the process is serving, and what it was pointed at (/nonexistent/bundle) is not a bundle it can serve`. Liveness still answers 200 on that root, which is why the page is fetched at all |
| Must fail | A file that is not a binary | header | `justfile` — `is not an ELF binary — this judged no binary` |
| Must fail | A binary that exits before answering | liveness | `sleep`, which rejects the harness's own `-static-root` flag — `the process exited 1 before answering /healthz — nothing this binary was built for came up serving (… invalid option -- 's' …)`, the process's own stderr carried through rather than a bare exit code |
| Must fail | A process alive and unreachable | liveness | the `amd64` build in a namespace with `lo` left **down** — `no 200 from /healthz within 30s — nothing this binary was built for came up serving`, measured at 30.2s wall, at the bound rather than hung |
| Must fail | The compiled-in address already held | address | the `amd64` build run on the host, outside a namespace, with `:8080` already served by another process — `something is already listening on 127.0.0.1:8080, the address … compiles in — every question below would have been answered by that process — this judged no binary`, exit 1 |
| Must fail | `go` absent from `PATH` | toolchain | the `armv6` build handed `arm/6` with a `PATH` carrying `python3` and no `go` — `go could not be run to read …'s build settings ([Errno 2] No such file or directory: 'go') — this judged no binary`. A tool that cannot run is a failed check, never a skipped assertion |
| Must fail | Too few arguments | — | the binary and a root with no expectation — the usage line, exit **2** rather than 1, so a mis-wired call is not a failed check |

**Three rows exist because the harness passed when it should not have.** Its first draft had no
address guard and **passed twice** while asserting nothing: another process held `:8080` on the
development host, the binary under test died on the bind it lost, and liveness, the page and the
binary's own `-health-check` were all answered by the survivor. The architecture was then parsed and
used only in the success line, so an `amd64` build passed an armv6 check. The expectation rows are the
third of the same kind: an expectation naming no revision skipped the revision assertion entirely,
which the recipe reaches by emptying one variable.

**Why the revision is read with `go version -m` rather than searched for.** A substring search is not
parsing. Measured on the `armv6` build by walking the section header table: `.go.buildinfo` spans
`0x600000`–`0x600120`, and `GOARM=` occurs at `0x3caefe` — inside `.rodata` — and at `0x600101`, inside
the section. A forward scan reads the `.rodata` copy first, 2.3 MB before the field the assertion is
about. Both copies carried the same value in every build made here (`6`, `7`, and the flag omitted),
so a search would return the right value by provenance rather than by reading the right thing. Anyone
can re-derive this by parsing the section headers at `e_shoff` and locating each hit's containing
section.

**Legal input this rejects.** Nothing found. `amd64` passes and `amd64/6` is refused, which is the
rule rather than an exception: an architecture carries a revision exactly where the toolchain records
one.

**Known gaps.**

- **No row here executes an `armv6l` binary.** This host registers no binary-format handler for one —
  `/proc/sys/fs/binfmt_misc/` is empty, there is no `qemu-arm`, and buildx offers only `linux/amd64` —
  and no handler was installed. The serving rows all run the host's own `amd64` build, so what they
  establish is that the harness fails on a process that does not come up, not that the `armv6l` build
  comes up. **That verdict is the `native-arch` job's**, under the emulation the runner registers
  (TST067<!-- Native armv6l build and smoke test -->), and no row here stands in for it.
- **The `-health-check` direction is not seeded.** That flag runs the same binary against the address
  the row before it has just proven answers, so making it fail needs a patched binary rather than a
  build setting or a wrong argument. No row reports what a broken self-check looks like.
- **The revision is the toolchain's own record, not the instructions.** What is compared is the
  `GOARM` the toolchain wrote into the binary. A build that recorded one revision and emitted another
  would pass, and nothing here disassembles anything.
- **Nothing here runs on a board.** Emulation decides that the binary is a 32-bit ARM binary the
  toolchain built for ARMv6 and that it starts and serves; instruction timing, memory pressure and
  real peripherals are outside every row, and are named as unproven by the item the harness serves.
