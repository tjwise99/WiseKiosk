# Architecture model explorer

A full interactive rendering of the [LikeC4 architecture model](architecture/README.md), embedded
directly in this page — every element's description, technology and icon, its tags (the architecture →
requirements links), and the per-element relationships a merged edge in a static diagram collapses into
one — built by `likec4 codegen webcomponent` ([ADR 0003 rev 5](decisions/0003-architecture-as-code-likec4.md)).
None of that is in the [static diagrams](ARCHITECTURE.md) this same model also generates: those are
gated for staleness and rendered browser-free with Mermaid; the rendering below is a second, ungated
output, built by the same `just arch-export` recipe run and embedded here rather than published
separately, so the two can never drift from each other, but neither is staleness-checked against the
model the way the static diagrams are — a broken or stale rendering is not caught by any gate.

`index`, below, is the System Context view. Clicking into an element drills down: `wisekiosk` opens the
Container view, and each container opens its own Component view. `## Deployment`, further down, is a
separate view of the hosts, processes and files the containers run on.

The bundle loads IBM Plex Sans from jsdelivr at runtime — fonts only, the model itself is entirely
self-contained in the bundle below — and degrades to the system sans-serif if that request is blocked
or offline.

**Locally, `just arch-dev` is more current still**: a live dev server reading `model/` directly, so an
uncommitted edit shows immediately, with no `arch-export` step in between. It needs a browser, the same
as the rendering below, and is not a gate either — [`architecture/README.md`](architecture/README.md)
is its reference.

```{raw} html
<likec4-view view-id="index" style="display:block;height:75vh"></likec4-view>
<script src="_static/likec4/likec4-views.js"></script>
```

## Deployment

```{raw} html
<likec4-view view-id="deployment" style="display:block;height:70vh"></likec4-view>
```
