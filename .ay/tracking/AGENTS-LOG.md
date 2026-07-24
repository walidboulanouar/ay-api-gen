# Agents Log

| Date | Agent | Task | Action | Files | Duration |
|------|-------|------|--------|-------|----------|
| 2026-05-10 | claude | 1-15 | Built full MVP: parser, generators, runtime, auth, CI/CD, docs | 61 created | ~2h |
| 2026-05-10 | claude | 16 | Push initial repo to github.com/walidboulanouar/ay-api-gen | git history | <5m |
| 2026-05-11 | claude | 22, 25-29, 31, 18 | Feature drop: doctor, init, discover, diff, slim, filter, truncate, yaml-parser, dedupe fix | 9 src files modified/added | ~1.5h |
| 2026-05-11 | claude | docs | Comprehensive README + SETUP-REQUIREMENTS.html | 2 files | ~30m |
| 2026-05-21 | claude | report | Generated STANDING.html status report | 1 file | <10m |
| 2026-05-21 | claude | publish | Mirrored repo to liwala org (private) + gist-rendered preview | git remote + gist | <10m |
| 2026-05-21 | luisa | security | Authored THREAT-MODEL.md + ADR-006 RFC; opened PR #1 to liwala/ay-api-gen | 3 files, +916 lines | (external) |
| 2026-05-22 | walid (via claude) | review | Branch `rfc-responses-walid` with answers to OQ-1..OQ-6 and threat-model OQs; posted PR comment | 1 file, +332 lines | ~30m |
| 2026-05-24 | claude | framework | Reinstall AY framework on branch `ay-framework`; deep-fill .ay workspace | many | ~1h (this session) |
| 2026-07-25 | claude | S1-01..S1-07 | Implemented full S1 security-baseline sprint: JSDoc/template injection fix, truncate.js wiring, settings namespace, description sanitization, base-URL guard, private-IP deny-list, spec-linter. Found + fixed 3 bugs along the way (second CLI injection vector, truncate.js crash bug, IPv6 SSRF-check bypass). Pinned sdk dep. 38 new offline tests. | 14 src files, 1 test file, README, package.json, .npmrc | ~3h |
| 2026-07-25 | claude | S2-01..07, T-GEN-1, T-SET-2, gap closure | S2 sprint: two audits (T-GEN-1, T-SET-2) run as parallel forked subagents, findings fixed directly. Found + fixed 2 more CRITICAL injection sites in auth-codegen.js (shared by both generators, missed by S1's scope) + 1 LOW in env-generator.js. Fixed a dead interactive-prompt bug in settings-injector.js (T-SET-2). Closed the S1 known-gap (url-guard.js in cli-generator.js's generated CLI). Added 50 real CLI integration tests (doctor/init/discover/diff/slim/filter/audit) — hit and fixed an execFileSync-vs-in-process-server deadlock and a readline stdin-timing bug along the way. Added `audit --baseline` command + 13-case YAML adversarial mini-corpus. | 7 src files, 2 test files (1 new), 3 new fixtures, package.json | ~3h |

## Conventions

- Append-only. Don't rewrite history rows.
- One row per logical action, not per file edit.
- "Agent" is the persona that owned the decision, not necessarily the tool.
- Duration is wall-clock for the human-perceived span, not LLM compute.
