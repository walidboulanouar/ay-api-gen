# Project Metrics

> Updated 2026-07-25. All numbers verified against current `ay-framework` state unless noted.

## Code

| Metric | Value | Source |
|--------|-------|--------|
| Source files (src/ + src/runtime/) | 21 .js files | `find src -name '*.js'` |
| Source files at v0.1.0 | 13 | git history |
| Source delta (v0.1.0 → v0.1.1) | +5 files, +~535 LOC | doctor, init-wizard, discover, diff, slim, filter, truncate, yaml-parser |
| Source delta (v0.1.1 → S1 security baseline) | +3 files (`desc-sanitize.js`, `url-guard.js`, `spec-linter.js`), 11 files modified | See CHANGELOG "Added (S1 sprint)" |
| Test files | 2 (`run.js`, `edge-cases.json`) | |
| Tests passing | 66 / 66 (30 pre-existing + 36 new S1 security tests) | `node test/run.js`, run 2026-07-25 |
| Test coverage of v0.1.1 features | **0%** | doctor/init/discover/diff/slim/filter still not covered — separate from S1's security-hardening tests |
| Test coverage of S1 security fixes | 100% of the 7 S1 tasks have ≥1 offline regression test | `testSecurityHardening()` in `test/run.js` |
| Doc files (docs/) | 4 (.md) + 2 root .md + 2 .html | ARCHITECTURE, PRIMITIVES, PATTERNS, DEPLOYMENT, README, CLAUDE.md, SETUP-REQUIREMENTS.html, STANDING.html |
| Security doc files | 3 | THREAT-MODEL.md, ADR-006…, RFC-RESPONSES-walid.md |
| CI workflows | 3 | (CI, NPM release, weekly API regen) |
| Deploy configs | 3 | Dockerfile, docker-compose.yml, Fly config |
| Fixture APIs (`.ay/apis/`) | 16 directories + `registry.json` | parser + integration fixtures |

## Velocity

| Window | Commits | Notes |
|--------|---------|-------|
| 2026-05-10 (MVP day) | 4 | tasks 1–16 |
| 2026-05-11 (feature day) | 2 | tasks 22, 25–29, 31, 18 |
| 2026-05-21 (security day) | 3 | STANDING, threat model PR, RFC responses |
| All-time (master) | 8 | small repo, fast cycles |
| Branches active | 4 | master, ay-framework, security-threat-model, rfc-responses-walid |
| Open PRs | 1 | #1 (security RFC) |

## Security posture (per THREAT-MODEL.md)

| Severity | Count | With current mitigation |
|----------|-------|------------------------|
| Critical | 2 (T-RUN-3, T-RUN-4) | **mitigated** — description cap + boundary markers (T-RUN-3), asMcpContent truncation + boundary markers (T-RUN-4/T-RUN-6), landed 2026-07-25 |
| High | 7 (T-ING-1, T-ING-2, T-SET-1, T-SET-2, T-RUN-1, T-API-1, T-GEN-2*) | T-ING-1, T-ING-2, T-SET-1, T-RUN-1, T-API-1 **mitigated** 2026-07-25. T-SET-2, T-GEN-2 still open — see S2-04, S2-03. |
| Medium | 8 | varies; T-API-2 (sensitive path param) now has a spec-linter check |
| Low | 3 | adequate |

\* T-GEN-2 severity is M in threat model but could become Critical in Mode B if confirmed exploitable.

## Sprint health (S1 — security baseline)

| Metric | Value |
|--------|-------|
| Sprint goal | Close all High/Critical with implementable fix; unblock ADR-006 Acceptance |
| Tasks in sprint | 8 (S1-01..S1-08) |
| Estimated effort | ~12–16 engineer-hours total |
| Critical-path tasks | S1-01..04 (block ADR-006 Acceptance) |
| Sprint window | 2026-05-24 → 2026-06-07 (2 weeks) |
| Blockers count | 0 active for S1 work itself |

## Tracking / process

| Metric | Value |
|--------|-------|
| ADRs total | 12 (5 Accepted, 7 Proposed) |
| Open threat IDs in threat model | 20 |
| Open RFC questions | 6 (OQ-1..OQ-6) — answers proposed in RFC-RESPONSES-walid.md |
| AY tracking files filled | 7 of 7 |
| Task files in .ay/tasks/ | (will be filled in S1 setup) |

## Historical (sprint 0 — MVP)

| Metric | Value |
|--------|-------|
| Tasks completed | 15 |
| Total commits | 2 (initial + AY-populated) — original tracking |
| Health score | 29/29 tests passing |
| Blockers hit | 2 (Zod schema requirement, template literal escaping) |
| Deviations | 0 |
