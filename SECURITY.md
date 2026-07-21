# Security policy

## Threat model

WiseKiosk runs on a **single trusted LAN**, one instance per deployment, with no user accounts,
sessions, or authentication. There is no multi-tenancy and no untrusted client. Security comes from
the network boundary, not from the application — see [`docs/FOUNDATIONS.md`](docs/FOUNDATIONS.md) §3.

The controls that are structural, not vigilance-based:

- **API keys resolve server-side only** and never reach the browser by construction.
- **No secret transits through config delivery**, so there is no secret-stripping step to forget.
- **CI holds no credentials**; key-dependent checks run locally.

## Reporting a vulnerability

Report privately via GitHub's **[Private vulnerability reporting](https://github.com/tjwise99/WiseKiosk/security/advisories/new)**
(Security → Advisories → Report a vulnerability). Please do not open a public issue for a security
report. A fix or triage response is aimed for within a week.
