# Project Metrics

> Updated 2026-07-25. All numbers verified against current `ay-framework` state unless noted.

## Code

| Metric | Value | Source |
|--------|-------|--------|
| Source files (src/ + src/runtime/) | 21 .js files | `find src -name '*.js'` |
| Source files at v0.1.0 | 13 | git history |
| Source delta (v0.1.0 → v0.1.1) | +5 files, +~535 LOC | doctor, init-wizard, discover, diff, slim, filter, truncate, yaml-parser |
| Source delta (v0.1.1 → S1 security baseline) | +3 files (`desc-sanitize.js`, `url-guard.js`, `spec-linter.js`), 11 files modified | See CHANGELOG "Added (S1 sprint)" |
| Source delta (S1 → S2 hardening) | 0 new src files, 5 modified (`auth-codegen.js`, `env-generator.js`, `settings-injector.js`, `cli-generator.js`, `bin/ay-api-gen.js`) | See CHANGELOG "Added (S2 sprint)" |
| Source delta (S2 → S3 locking + audits + yaml) | +1 file (`src/file-lock.js`), `src/yaml-parser.js` rewritten (custom parser → thin `yaml` wrapper), 4 modified (`settings-injector.js`, `registry.js`, `spec-linter.js`, `bin/ay-api-gen.js`) | See CHANGELOG "Added (S3 sprint)" |
| Source delta (S3 → T-GEN-4 + backlog items) | +2 files (`response-cache.js`, `rate-limiter.js`), 2 modified (`bin/ay-api-gen.js`, `src/runtime/mcp-server.js`) | See CHANGELOG, latest entries |
| Source delta (item 19, OpenAPI 3.1 support) | 0 new src files, 4 modified (`parser.js`, `validator.js`, `mcp-generator.js`, `runtime/mcp-server.js`) | See CHANGELOG, latest entry |
| Test files | 5 (`run.js`, `integration-cli.js`, `edge-cases.json`, `fixtures/` — 3 files) | |
| Tests passing | 145 / 145 in `test/run.js` + 108 / 108 in `test/integration-cli.js` | `node test/run.js` and `node test/integration-cli.js`, run 2026-07-25 |
| Test coverage of v0.1.1 CLI surface | **100%** of doctor/init/discover/diff/slim/filter now have real integration tests | `test/integration-cli.js`, closes B-04 |
| Test coverage of S1+S2+S3 security fixes | 100% of S1's 7 tasks + S2's T-GEN-1/T-SET-2 findings + S3's B-09/T-GEN-2/T-API-3/T-GEN-4 have ≥1 regression test | `testSecurityHardening()`, `testGenInterpolationHardening()`, `testFileLock()` in `test/run.js`; `testConcurrentWriteLocking()`, `testGen2PackageJsonSafety()`, `testGen4OutputPathSafety()` in `test/integration-cli.js` |
| OpenAPI 3.1 test coverage | 16 unit tests (`testOpenAPI31Support()` in `test/run.js`) + 1 real MCP-protocol end-to-end test (`testOpenAPI31RuntimeNullable()` in `test/integration-cli.js`), the latter verified to actually fail without the fix (temporarily reverted, confirmed the predicted Zod rejection, restored) | `test/run.js`, `test/integration-cli.js` |
| Dependencies | 2 (`@modelcontextprotocol/sdk@1.29.0`, `yaml@2.9.0`), both exact-pinned, `yaml` has zero transitive deps | `npm ls`, `package.json` |
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
| High | 7 (T-ING-1, T-ING-2, T-SET-1, T-SET-2, T-RUN-1, T-API-1, T-GEN-2*) | All 7 **mitigated** as of 2026-07-25. T-GEN-2 traced fully in S3: the literal threat-model concern (`package.json` field injection) was never actually exploitable given `JSON.stringify()` construction, but a real related gap (unsanitized `--name` → path traversal) was found and fixed. |
| Medium | 8 | T-API-2 (sensitive path param) and T-API-3 (mass-assignment, added 2026-07-25) now have spec-linter checks |
| T-GEN-1 (audit, not in original 20-threat count) | 2 CRITICAL + 1 LOW found and fixed 2026-07-25 | Beyond the original threat model's scope — `auth-codegen.js`/`env-generator.js` had the same injection class as S1 fixed elsewhere, missed because S1's scope was `mcp-generator.js`/`cli-generator.js` only |
| Low | 3 | adequate |

\* T-GEN-2 severity is M in threat model; the literal concern didn't survive tracing the actual code (S3), see note above.

## Sprint health (S1 — security baseline)

| Metric | Value |
|--------|-------|
| Sprint goal | Close all High/Critical with implementable fix; unblock ADR-006 Acceptance |
| Tasks in sprint | 8 (S1-01..S1-08) |
| Estimated effort | ~12–16 engineer-hours total |
| Critical-path tasks | S1-01..04 (block ADR-006 Acceptance) |
| Sprint window | 2026-05-24 → 2026-06-07 (2 weeks) |
| Blockers count | 0 active for S1 work itself |

## Sprint health (S2 — hardening + coverage, landed 2026-07-25)

| Metric | Value |
|--------|-------|
| Sprint goal | Integration test the v0.1.1 CLI surface, systematically audit spec-interpolation and settings-injection beyond S1's scope, close S1's known gap, time-permitting items |
| Tasks in sprint | 5 required (S2-01, T-GEN-1, T-SET-2, gap closure) + 2 time-permitting (S2-06, S2-07) — all 5+2 completed same session |
| Bugs found beyond the audits' original scope | 2 CRITICAL injection sites (T-GEN-1, in `auth-codegen.js`), 1 dead-code UX bug (T-SET-2, `confirmOverwrite`), 1 test-infra deadlock (`execFileSync` vs in-process fixture server), 1 test-infra readline timing bug |
| New tests | 19 (T-GEN-1 regression) + 19 (YAML corpus) in `test/run.js`, 50 in new `test/integration-cli.js` |
| Blockers count | 0 active for S2 work itself |

## Sprint health (S3 — locking + remaining audits + yaml dependency, landed 2026-07-25)

| Metric | Value |
|--------|-------|
| Sprint goal | Fix B-09 (file locking), take on T-GEN-2, replace the custom YAML parser with a real dependency, corpus-verify parity |
| Tasks in sprint | 3 named (B-09, T-GEN-2, S2-05) + 1 discovered along the way (T-API-3, correcting a label mismatch — see BOARD.md note) — all 4 completed same session |
| Bugs/gaps found beyond the tasks' literal scope | Path-traversal-via-unsanitized-`--name` (found while tracing T-GEN-2, not the literal threat described); a probabilistic-race test-design lesson (real CLI-process concurrency test couldn't reliably reproduce the pre-fix bug — solved with a deterministic in-process test instead) |
| Subagent usage | 1 parallel subagent (yaml dependency evaluation + migration), scoped to non-overlapping files, zero merge conflicts on return |
| New tests | 8 deterministic `file-lock.js` unit tests + 1 six-process CLI stress test (B-09); 13 tests (T-GEN-2); 3 tests (T-API-3); full corpus re-run + new anchor/alias/block-scalar tests (S2-05) |
| Blockers count | 0 active for S3 work itself; B-09 formally resolved |

## Post-S3: T-GEN-4 + backlog items 23/24 + backlog survey (landed 2026-07-25)

| Metric | Value |
|--------|-------|
| Goal | Fix T-GEN-4, survey the full remaining backlog for buildable-without-a-human-decision items, build anything that qualified |
| Tasks completed | T-GEN-4, backlog survey (13 items assessed: 7 C-items + 6 numbered items), items 23 + 24 |
| Verdict on the rest of the backlog | All 7 C-items blocked (ADR-012 still Proposed, or real infra/credentials/licensing decisions needed); items 19/21 deferred (real scope / self-admitted open questions); item 20 deferred (needs a security-relevant decision) |
| Bugs found beyond literal task scope | A self-inflicted `/var` deny-list bug (would have blocked macOS's own tmpdir) caught by the test suite before shipping; a related `init`-wizard `.env`-path bug (unsanitized name causing `.env` and the generated server to potentially land in different directories) |
| Test rigor upgrade | Items 23/24 verified via a real MCP client/server protocol roundtrip (`@modelcontextprotocol/sdk`'s `Client` + `StdioClientTransport`), not just unit tests of the underlying primitives — a new, more rigorous pattern for future `runtime/mcp-server.js` features |
| New tests | 18 (T-GEN-4) + 15 unit (response-cache.js, rate-limiter.js) + 7 real-protocol (items 23/24) |
| Assessment | This is the natural stopping point — see PROGRESS-LOG.md |

## Item 19: OpenAPI 3.1 full support (landed 2026-07-25)

| Metric | Value |
|--------|-------|
| Goal | Take on the one non-blocked backlog item flagged in the prior wrap-up; research the real 3.0→3.1 diff rather than guess; close real gaps only |
| Research method | 1 subagent, knowledge-only (no file access), prioritized-by-breakage-risk 3.0→3.1 diff, self-flagged confidence per item |
| Real bugs fixed | `type` array (nullable) silently mismapping to a wrong Zod type in 3 switch sites, fixed at 1 source of truth; `$ref`'d PathItem silently dropping all its operations with no error (`components.pathItems`, new in 3.1) |
| Deliberately not implemented | `exclusiveMinimum`/`exclusiveMaximum` numeric form, `examples` vs `example`, `$ref`-sibling semantics — none read anywhere in the codebase, no existing behavior to fix |
| Design question resolved without stopping | Whether `webhooks` should become generated callable tools — research confirmed no (wrong direction: inbound vs outbound), so this was resolved on the merits, not treated as a blocking ambiguity |
| New tests | 16 unit (`test/run.js`) + 1 real MCP-protocol end-to-end test, verified to fail without the fix before confirming it passes with it |
| Blockers count | 0 |

## Tracking / process

| Metric | Value |
|--------|-------|
| ADRs total | 13 (6 Accepted, 7 Proposed) — ADR-013 (yaml dependency) added 2026-07-25, Accepted |
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
