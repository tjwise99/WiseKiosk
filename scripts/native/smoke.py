#!/usr/bin/env python3
"""The application comes up and serves natively on the architecture it was built for.

SRS019<!-- The backend runs on every supported architecture --> names an architecture the published
image does not carry, and what runs there is the application itself rather than a container: the
backend cross-compiled for the target, and the bundle it is pointed at. What a leg has to establish
about that pair is that the whole of it runs, three ways:

- **It answers on its port.** The binary is started with the bundle as its static root and asked for
  liveness until it answers or the bound elapses. A binary built for another architecture, or one
  that cannot start under the emulation a foreign leg runs on, never answers here.
- **It serves the bundle it was pointed at.** The page's own path is fetched. Liveness is answered by
  a route that never reads the served tree, so a static root naming a tree that is not there answers
  it perfectly well — asking for the page is what makes the bundle half of the artifact under test
  rather than an argument nothing reads.
- **It answers the liveness question it carries itself.** The binary's own `-health-check` flag, run
  as a second process against the serving one: the binary started again, on the architecture it was
  built for rather than this host's, asking the serving process the question a service manager asks.

**The architecture is the caller's.** This is handed a binary and a static root and nothing else, so
what architecture was smoke-tested is decided by the leg that built the binary; the ELF header's
machine is printed rather than asserted, there being nothing here to assert it against.

**The address is refused before it is used.** The binary compiles its address in and takes no flag
for it, so a process already holding that address answers all three questions above perfectly well
while the binary under test exits unnoticed on a bind it lost — every assertion passing against
something nobody built here. That reads exactly like a clean run, so a held address is reported as
having judged nothing rather than probed.

Deliberately not a re-run of the image tier beside it: what differs here is the artifact and the way
it is started, and the configuration, layer and isolation obligations are the published image's,
which this builds none of.

Usage: smoke.py <binary> <static-root>
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

# What an ELF header's machine field names, over the architectures a build of this repository is
# asked for. A value outside this is printed as its number rather than guessed at.
ELF_MACHINES = {0x03: "x86", 0x28: "arm", 0x3E: "x86-64", 0xB7: "aarch64"}

ELF_MAGIC = b"\x7fELF"


def fail(problems):
    print(f"{len(problems)} problem(s):", file=sys.stderr)
    for problem in problems:
        print(f"  {problem}", file=sys.stderr)
    return 1


class RunError(Exception):
    """A binary that could not be read, or could not be run."""


def machine(binary):
    """The architecture the binary's own ELF header declares, which is what a leg built."""
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
    return f"{width} {ELF_MACHINES.get(declared, hex(declared))}"


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
    if len(sys.argv) != 3:
        print(__doc__.strip().split("\n")[-1], file=sys.stderr)
        return 2
    binary, root = sys.argv[1], sys.argv[2]

    problems = []
    try:
        declared = machine(binary)
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
        f"{binary} ({declared}) came up serving {root}, answered {HEALTH_URL} and {PAGE_URL}, and "
        f"passed the liveness check it carries"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
