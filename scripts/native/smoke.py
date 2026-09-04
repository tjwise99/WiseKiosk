#!/usr/bin/env python3
"""The application comes up and serves natively on the architecture it was built for.

SRS019<!-- The backend runs on every supported architecture --> names an architecture the published
image does not carry, and what runs there is the application itself rather than a container: the
backend cross-compiled for the target, and the bundle it is pointed at. What a job has to establish
about that pair is that the whole of it runs, three ways:

- **It answers on its port.** The binary is started with the bundle as its static root and asked for
  liveness until it answers or the bound elapses. A binary built for another architecture, or one
  that cannot start under the emulation a foreign job runs on, never answers here.
- **It serves the bundle it was pointed at.** The page's own path is fetched. Liveness is answered by
  a route that never reads the served tree, so a static root naming a tree that is not there answers
  it perfectly well — asking for the page is what makes the bundle half of the artifact under test
  rather than an argument nothing reads.
- **It answers the liveness question it carries itself.** The binary's own `-health-check` flag, run
  as a second process against the serving one: the binary started again, on the architecture it was
  built for rather than this host's, asking the serving process the question a service manager asks.

**The architecture is named by the caller and asserted here.** The recipe that builds the binary says
what it built for, in the vocabulary its own build environment uses, and this reads the binary back
for both halves of that: the ELF header's machine field, and the `GOARM` setting the toolchain
records in the build information it embeds. A binary built for the host, or for 32-bit ARM at the
wrong revision, fails rather than coming up and reporting success on an architecture nobody asked
for — every question above is answerable by a binary of any architecture that starts at all.

**Why the header alone would not settle it.** `EM_ARM` is one value for every ARM32 variant, the Go
linker emits no `.ARM.attributes` section carrying the `Tag_CPU_arch` that separates the revisions,
and a `GOARM=6` and a `GOARM=7` build have identical `e_flags`. So the header reaches 32-bit ARM and
stops, and the recorded build setting is what carries the revision. Dropping `GOARM` from the build
fails here rather than passing quietly, because the toolchain then records its own default instead of
the revision that was asked for.

**The address is refused before it is used.** The binary compiles its address in and takes no flag
for it, so a process already holding that address would answer every question above in its place; a
held address is reported as having judged nothing rather than probed
(docs/CI.md § Native binary run).

Deliberately not a re-run of the image tier beside it: what differs here is the artifact and the way
it is started, and the configuration, layer and isolation obligations are the published image's,
which this builds none of.

Usage: smoke.py <binary> <static-root> <goarch>[/<goarm>]
"""

import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

# The address the binary compiles in. It is not a flag, so a caller cannot move it and this cannot
# either (ADR 0020 rev 2).
HOST = "127.0.0.1"
PORT = 8080
ADDRESS = f"{HOST}:{PORT}"

HEALTH_URL = "/healthz"
PAGE_URL = "/"

# How long the process is given to answer, and how often it is asked. A bound rather than a wait: a
# process that never answers must fail this rather than hang the gate.
READY_TIMEOUT = 30.0
READY_INTERVAL = 0.2

# How long the process is given to leave after it is asked to, before it is taken down harder.
STOP_TIMEOUT = 5.0

# What an ELF header's machine field names, spelled as the Go build environment spells it, so the
# observed value and the one the recipe built with are comparable without a translation between
# vocabularies. A value outside this is reported as its number rather than guessed at.
ELF_MACHINES = {0x03: "386", 0x28: "arm", 0x3E: "amd64", 0xB7: "arm64"}

# The build setting carrying the ARM revision, which the ELF header does not reach.
REVISION_SETTING = "GOARM"

ELF_MAGIC = b"\x7fELF"


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


class RunError(Exception):
    """A binary that could not be read, or could not be run."""


def machine(binary):
    """The width and architecture the binary's own ELF header declares."""
    try:
        with open(binary, "rb") as handle:
            header = handle.read(20)
    except OSError as error:
        raise RunError(f"{binary} could not be read ({error})") from error
    if len(header) < 20 or header[:4] != ELF_MAGIC:
        raise RunError(f"{binary} is not an ELF binary")
    width = {1: "elf32", 2: "elf64"}.get(header[4], f"class {header[4]}")
    order = "<" if header[5] == 1 else ">"
    declared = struct.unpack_from(f"{order}H", header, 18)[0]
    return width, ELF_MACHINES.get(declared, hex(declared))


def build_setting(binary, name):
    """A setting the Go toolchain recorded in the binary, read back from the file rather than run."""
    try:
        finished = subprocess.run(["go", "version", "-m", binary], capture_output=True)
    except OSError as error:
        raise RunError(f"go could not be run to read {binary}'s build settings ({error})") from error
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        raise RunError(f"`go version -m {binary}` exited {finished.returncode} ({detail})")
    for line in finished.stdout.decode(errors="replace").splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0] == "build" and fields[1].startswith(f"{name}="):
            return fields[1].split("=", 1)[1]
    raise RunError(f"{binary} records no {name} among its build settings")


def check_architecture(binary, observed, expected, problems):
    """The binary is a build for the architecture, and revision, the caller asked for.

    `expected` is the build environment's own spelling: an architecture, optionally followed by the
    revision that architecture records, as `arm/6`. An architecture that records no revision is
    named on its own, and nothing beyond the header is read for it.
    """
    goarch, _, goarm = expected.partition("/")
    if observed != goarch:
        problems.append(
            f"{binary} is an {observed} build and this asked for {goarch} — the ELF header's machine "
            f"is not the architecture the binary was to be built for"
        )
        return
    if not goarm:
        return
    recorded = build_setting(binary, REVISION_SETTING)
    if recorded != goarm:
        problems.append(
            f"{binary} records {REVISION_SETTING}={recorded} and this asked for {goarm} — the header "
            f"reaches {observed} and no further, so the recorded setting is what carries the revision"
        )


def address_held():
    """Whether something is already listening where the binary is about to bind."""
    with socket.socket() as probe:
        probe.settimeout(1)
        return probe.connect_ex((HOST, PORT)) == 0


def start(binary, root, output):
    """The binary, running detached, serving root as the bundle, its output collected in a file."""
    try:
        return subprocess.Popen([binary, "-static-root", root], stdout=output, stderr=output)
    except OSError as error:
        raise RunError(f"{binary} could not be run ({error})") from error


def said(output):
    """Whatever the process wrote before it stopped, as one line."""
    output.seek(0)
    return " ".join(output.read().decode(errors="replace").split()) or "and said nothing"


def fetch(path):
    """The status of a GET, with a 404 reported as a status rather than raised."""
    try:
        with urllib.request.urlopen(f"http://{ADDRESS}{path}", timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def wait_ready(process, output, problems):
    """Poll liveness until the process answers, or report that it never did."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        if process.poll() is not None:
            problems.append(
                f"the process exited {process.returncode} before answering {HEALTH_URL} — nothing "
                f"this binary was built for came up serving ({said(output)})"
            )
            return False
        try:
            status = fetch(HEALTH_URL)
        except OSError:
            time.sleep(READY_INTERVAL)
            continue
        if status == 200:
            return True
        time.sleep(READY_INTERVAL)
    problems.append(
        f"no 200 from {HEALTH_URL} within {READY_TIMEOUT:.0f}s — nothing this binary was built for "
        f"came up serving"
    )
    return False


def check_page(root, problems):
    """The served tree answers for the page, so the bundle is part of what came up."""
    try:
        status = fetch(PAGE_URL)
    except OSError as error:
        problems.append(f"{PAGE_URL} could not be reached ({error}) though {HEALTH_URL} answered")
        return
    if status != 200:
        problems.append(
            f"{PAGE_URL} answered {status}, expected 200 — the process is serving, and what it was "
            f"pointed at ({root}) is not a bundle it can serve"
        )


def check_health_flag(binary, problems):
    """The binary's own liveness flag, run against the serving process."""
    try:
        finished = subprocess.run([binary, "-health-check"], capture_output=True)
    except OSError as error:
        problems.append(f"{binary} -health-check could not be run ({error})")
        return
    if finished.returncode != 0:
        detail = finished.stderr.decode(errors="replace").strip().split("\n")[-1]
        problems.append(
            f"the process failed the liveness check its own binary carries: -health-check exited "
            f"{finished.returncode} ({detail})"
        )


def stop(process):
    """Ask the process to leave, and take it down harder if it does not."""
    process.terminate()
    try:
        process.wait(timeout=STOP_TIMEOUT)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def check_serving(binary, root, problems):
    """The binary answers on its port, serves the bundle, and answers its own liveness flag."""
    with tempfile.TemporaryFile() as output:
        process = start(binary, root, output)
        try:
            if not wait_ready(process, output, problems):
                return
            check_page(root, problems)
            check_health_flag(binary, problems)
        finally:
            stop(process)


def main():
    if len(sys.argv) != 4:
        print(__doc__.strip().split("\n")[-1], file=sys.stderr)
        return 2
    binary, root, expected = sys.argv[1:4]

    problems = []
    try:
        width, observed = machine(binary)
        # Asserted before anything is started: a binary for the wrong architecture is not something
        # to then ask questions of, and under emulation it may not start at all.
        check_architecture(binary, observed, expected, problems)
        if problems:
            return fail(problems)
        if address_held():
            raise RunError(
                f"something is already listening on {ADDRESS}, the address {binary} compiles in — "
                f"every question below would have been answered by that process"
            )
        check_serving(binary, root, problems)
    except RunError as error:
        return fail([f"{error} — this judged no binary"])

    if problems:
        return fail(problems)
    print(
        f"{binary} ({width}, built for {expected}) came up serving {root}, answered {HEALTH_URL} "
        f"and {PAGE_URL}, and passed the liveness check it carries"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
