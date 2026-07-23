# Traceability

The generated need objects (from Doorstop's `docs/requirements/` tree — see
[`docs/requirements/README.md`](../requirements/README.md) and [ADR
0002](../decisions/0002-requirements-management-doorstop.md)) rendered as tables and a link graph.
This page is hand-authored (ADR 0004: the display of traceability is legitimate silo content,
distinct from the transform that produces the need objects it displays).

## System needs

```{needtable}
:types: sys
:columns: id, title, status, outgoing
```

## Software requirements

```{needtable}
:types: srs
:columns: id, title, status, incoming, outgoing
```

## Verification items

```{needtable}
:types: tst
:columns: id, title, status, incoming
```

## Full traceability matrix

Every need across all three documents, with both link directions, so a SYS -> SRS -> TST chain (or
a gap in one) is visible in one table.

```{needtable}
:columns: id, type, title, status, incoming, outgoing
```

```{note}
A `needflow` link graph is deliberately not included here: sphinx-needs' `needflow` directive
requires either PlantUML (a JVM dependency, ruled out by this toolchain) or Graphviz, and Graphviz
is not available on every machine this site is built on. Since `just check-site` must run the exact
recipe CI runs (no local/CI divergence), a graph that only rendered in CI would be unverified by any
local build — so it is left out. The tables above carry the same chains via their link columns.
```
