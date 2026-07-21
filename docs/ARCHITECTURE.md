# Architecture

How the pieces of WiseKiosk actually fit together — the living structural description of the system
**as built**. It grows with the code.

> **Status: skeleton.** No code exists yet. Until a component is built, the *intended* shape lives in
> [`FOUNDATIONS.md`](FOUNDATIONS.md) §3 (day-one architecture), which is a design hypothesis, not a
> description of running code. This document records what is actually implemented, and structural
> rationale that is real but not weighty enough for an [ADR](decisions/README.md). Each section below
> is filled in as its part of the system lands.

## System shape

One published container image serving a full-screen, config-driven smart-mirror display. A Go backend
proxies a handful of public APIs and serves the built frontend; a Svelte SPA renders modules into
regions of the page. See [`FOUNDATIONS.md`](FOUNDATIONS.md) §1 for the product and §3 for the intended
architecture until this section describes the built one.

## Backend

_To be documented as it is built._ Language and boundary-contract decision:
[ADR 0001](decisions/0001-backend-language-go.md). Intended shape: stateless REST proxy with a
TTL response cache, config schema validation, and static file serving (FOUNDATIONS §3).

## Frontend

_To be documented as it is built._ Svelte 5 + Vite static SPA; payload types generated from the
boundary schema, never hand-declared (FOUNDATIONS §4, §6).

## The boundary contract

_To be documented once the codegen mechanism is chosen (open question 2)._ One schema definition,
both sides generated from it. This is the load-bearing structural constraint of the whole system —
see [ADR 0001](decisions/0001-backend-language-go.md).

## Config and secrets

_To be documented as it is built._ Frontend owns `config.json`; the backend owns no config file and
validates-then-serves it verbatim. Secrets delivered via `<NAME>_FILE`/`<NAME>`, never through config
(FOUNDATIONS §3).

## Deployment

_To be documented as it is built._ Container image, bind-mounted config, `_FILE` secrets, fixed-port
healthcheck, `unless-stopped` (FOUNDATIONS §3).
