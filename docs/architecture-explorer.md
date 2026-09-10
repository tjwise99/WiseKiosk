# Architecture model explorer

A full interactive rendering of the [LikeC4 architecture model](architecture/README.md) — every
element's description, technology and icon, its tags (the architecture → requirements links), and the
per-element relationships a merged edge in a static diagram collapses into one — built by `likec4
build` ([ADR 0003 rev 4](decisions/0003-architecture-as-code-likec4.md)). None of that is in the
[static diagrams](ARCHITECTURE.md) this same model also generates: those are gated for staleness and
rendered browser-free with Mermaid; this site is a second, ungated output published alongside it.

**Published, at [tjwise99.github.io/WiseKiosk/architecture/](https://tjwise99.github.io/WiseKiosk/architecture/),
current as of the last push to `main`.** It is rebuilt by the same `just arch-export` recipe run that
regenerates the static diagrams, so the two can never drift from each other, but neither is
staleness-checked against the model the way the static diagrams are — a broken or stale site is not
caught by any gate.

**Locally, `just arch-dev` is more current still**: a live dev server reading `model/` directly, so an
uncommitted edit shows immediately, with no `arch-export` step in between. It needs a browser, the
same as the published site, and is not a gate either — [`architecture/README.md`](architecture/README.md)
is its reference.
