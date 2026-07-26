# Security policy

## Threat model

WiseKiosk runs on a **single trusted LAN**, one instance per deployment, with no user accounts,
sessions, or authentication. There is no multi-tenancy and no untrusted client. Security comes from
the network boundary, not from the application; one instance serves exactly one
configuration and shares no runtime state with any other (SYS005, SRS045).

The controls that are structural, not vigilance-based:

- **API keys resolve server-side only** and never reach the browser by construction — no code path
  carries a secret toward a client, and confinement is never a stripping step (SYS003).
- **Secrets are delivered by the deployment environment**, never stored in the image, the
  repository, or the configuration (SYS003, SRS015).
- **No secret transits through config delivery**, so there is no secret-stripping step to forget —
  the configuration schema offers no secret-bearing key (SRS017).
- **CI holds no credentials**; verification needing a live key runs outside CI (SYS003, SRS019).
- **The browser enforces the page's posture**: a same-origin content-security policy and the
  standard hardening headers (SYS006, SRS065, SRS066).

## Reporting a vulnerability

Report privately via GitHub's **[Private vulnerability reporting](https://github.com/tjwise99/WiseKiosk/security/advisories/new)**
(Security → Advisories → Report a vulnerability). Please do not open a public issue for a security
report. A fix or triage response is aimed for within a week.
