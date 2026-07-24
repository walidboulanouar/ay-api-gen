# Pipeline Board

> Updated 2026-07-25 · branch `ay-framework` · sprints **S1 (security baseline)** and **S2 (hardening + coverage)** both landed
> Statuses: BACKLOG / READY / IN PROGRESS / BLOCKED / IN REVIEW / DONE
> See [`../ROADMAP.md`](../ROADMAP.md) for milestone view. See [`../tasks/`](../tasks/) for execution detail.

## Active sprint — S1 security baseline (2026-05-24 → 2026-06-07)

| # | Task | Severity | Owner | Status | Detail |
|---|------|----------|-------|--------|--------|
| S1-01 | Escape `info.title`/`info.description` (T-ING-1) | High | claude | DONE | [tasks/T-ING-1-fix.md](../tasks/T-ING-1-fix.md) |
| S1-02 | Wire `truncate.js` into runtime + generated server (T-RUN-4 / T-RUN-6) | Critical | claude | DONE | [tasks/T-RUN-4-wire-truncate.md](../tasks/T-RUN-4-wire-truncate.md) |
| S1-03 | Settings collision policy + `ay-api-gen:` namespace (T-SET-1) | High | claude | DONE | [tasks/T-SET-1-namespace.md](../tasks/T-SET-1-namespace.md) |
| S1-04 | Tool description 500-char cap + boundary marker (T-RUN-3) | Critical | claude | DONE | [tasks/T-RUN-3-desc-cap.md](../tasks/T-RUN-3-desc-cap.md) |
| S1-05 | Base-URL same-host refinement default (T-RUN-1 / T-ING-2) | High | claude | DONE | [tasks/T-RUN-1-base-url-guard.md](../tasks/T-RUN-1-base-url-guard.md) |
| S1-06 | Private-IP deny-list at DNS resolution (T-ING-2) | High | claude | DONE | [tasks/T-ING-2-deny-list.md](../tasks/T-ING-2-deny-list.md) |
| S1-07 | `spec-linter.js` warn-only (T-API-1, T-API-2 first) | Medium | claude | DONE | [tasks/spec-linter.md](../tasks/spec-linter.md) |
| S1-08 | Promote ADR-006 to **Accepted** after S1-01..04 land | - | luisa | READY — unblocked, S1-01..07 all landed | Sign-off contingent on fixes; fixes now in place, needs Luisa's review pass |

## v0.1.0 (DONE — shipped 2026-05-10)

Core MCP-from-OpenAPI generator. 29 tests passing. Tasks 1–16 from the original board.

| # | Title | Status |
|---|-------|--------|
| 1 | OpenAPI parser (Swagger 2.0 + OpenAPI 3.x) | DONE |
| 2 | MCP server generator (Zod schemas) | DONE |
| 3 | CLI generator (zero-dep) | DONE |
| 4 | Settings injector (auto-register in Claude Code) | DONE |
| 5 | Reverse generator (MCP → OpenAPI) | DONE |
| 6 | Auth detection (OAuth2, Bearer, Basic, API Key) | DONE |
| 7 | Runtime MCP server (no codegen) | DONE |
| 8 | Runtime CLI (no codegen) | DONE |
| 9 | `.env.example` generator | DONE |
| 10 | Spec validator | DONE |
| 11 | API registry (list/remove/regen) | DONE |
| 12 | CI/CD workflows (GitHub Actions) | DONE |
| 13 | Docker + deploy configs | DONE |
| 14 | Documentation (ARCHITECTURE, PRIMITIVES, PATTERNS, DEPLOYMENT) | DONE |
| 15 | Edge-case testing + fixes | DONE |
| 16 | Push to GitHub | DONE |

## v0.1.1 (DONE 2026-05-11 — feature drop, undocumented)

Source files exist; need integration tests + docs (treated as tech debt — see S2).

| # | Title | File | Status | Notes |
|---|-------|------|--------|-------|
| 25 | `ay-api-gen doctor` health check | `src/doctor.js` | DONE | Source landed in 2696f1f; needs end-to-end test |
| 26 | `ay-api-gen init` wizard | `src/init-wizard.js` | DONE | Needs e2e test |
| 27 | `ay-api-gen discover <domain>` | `src/discover.js` | DONE | |
| 28 | `ay-api-gen diff <old> <new>` | `src/diff.js` | DONE | |
| 22 | Tool filtering (`--only` / `--exclude`) | `src/filter.js` | DONE | |
| 29 | Response truncation module | `src/truncate.js` | DONE | Wired into runtime + generated server as of S1-02 |
| 31 | Smart tool pruning `--slim` | `src/slim.js` | DONE | |
| 18 | YAML spec support | `src/yaml-parser.js` | DONE | Custom parser; **needs adversarial corpus** — see S3 |

## Blocked

| # | Title | Blocked by |
|---|-------|-----------|
| 17 | Publish to npm | `npm login` from Walid; package name reservation; **must land S1 first** so we ship hardened |

## S2 sprint — hardening + coverage (landed 2026-07-25)

| # | Title | Sprint | Status | Notes |
|---|-------|--------|--------|-------|
| S2-01 | Integration tests for v0.1.1 features | S2 | DONE | `test/integration-cli.js` — real CLI child-process tests for diff/filter/slim/doctor/discover/init/audit, 50 tests. Ephemeral local HTTP fixture server for doctor/discover, no real external network. |
| S2-02 | Pin exact versions in generated `package.json` (T-GEN-3 / T-SUP-2) | S2 | DONE (S1) for `@modelcontextprotocol/sdk`; CI workflow still unpinned, blocked on Task 17 |
| S2-03 | Audit every spec-derived interpolation (T-GEN-1) | S2 | DONE | Found + fixed 2 CRITICAL (auth-codegen.js `//`-comment newline injection + backtick/`${}` breakout in generated CLI env docs, present in mcp-generator AND cli-generator since both share auth-codegen.js) + 1 LOW (env-generator.js content spoofing). See HANDOFFS.md 2026-07-25. |
| S2-04 | Audit `settings-injector.js` for field injection (T-SET-2) | S2 | DONE | No HIGH/CRITICAL found — S1-03's namespacing + bracket-assignment write pattern holds up against path traversal, env injection, prototype pollution. Fixed one functional bug (dead `confirmOverwrite` interactive-prompt path) found along the way. |
| S2-05 | Replace custom YAML parser with `yaml` (Aro) — after corpus | S3 | Still blocked — corpus now exists (S2-06) but this is a larger dependency-adoption decision, deferred to S3 |
| S2-06 | YAML adversarial corpus + test runner | S2 | DONE (scoped) | 13 hand-built adversarial cases + 1 positive round-trip case in `test/run.js`. Not the full external `yaml-test-suite` (would need a network fetch) — a hand-built mini-corpus covering the gotcha classes that matter for OpenAPI YAML. |
| S2-07 | `ay-api-gen audit --baseline` (T0 free runner) | S2 | DONE | `bin/ay-api-gen.js` — free, no license check, wraps `spec-linter.js`. Supports `--mode=b` + `--accept-risks` for blocking mode, same contract as `generate`. |
| Gap closure | Extend url-guard.js SSRF/host-rebind protections to `cli-generator.js`'s generated standalone CLI | S2 | DONE | Closes the gap logged in S1's HANDOFFS.md — the generated CLI (`cli.js`) now gets `resolveBaseUrl`/`assertHostAllowed` same as the generated MCP server and `runtime/cli.js`. |
| 30 | Public API catalog (`serve github`, `serve stripe`) | S3 | - | Curated, signed specs only |

## Backlog — commercial / scale

| # | Title | Notes |
|---|-------|-------|
| C-01 | T1 sandbox (Fargate + Claude agent) — paid tier | ADR-006 §4 |
| C-02 | T2 spec gating + override UX (CLI + config + prompt) | ADR-006 §5.1, see Walid OQ-5 |
| C-03 | T2 MCP red-team harness + adversarial corpus | ADR-006 §5.2 — enterprise tier |
| C-04 | License gating logic | Single CLI, tier from license |
| C-05 | Pricing page + billing integration | Stripe — depends on tier definitions |
| C-06 | Customer-owned-API mode (`--owned`) | T1/T2 opt-in with interactive confirmation |
| C-07 | Acceptance log + `.ay-api-gen.yml` config schema | OQ-5 — required for T2 |
| 19 | OpenAPI 3.1 full support (webhooks, pathItems) | Medium scope |
| 20 | HTTP-SSE transport for remote MCP servers | Medium |
| 21 | Multi-spec merge (combine N specs into 1 MCP server) | Large; UX questions open |
| 23 | Response caching in runtime | Small |
| 24 | Rate limiting in runtime | Small |

## Naming / branding (decision required)

| Topic | Note |
|-------|------|
| Product name | Open between `ay-api-gen` (current), `safeapi2mcp` (Luisa), `gauntlet`, `ay-vet`, `ay-customs`, `ay-chaperone`. **Decide before Task 17 (npm publish)** — renaming a published package is painful. See [DECISIONS.md ADR-009](DECISIONS.md). |
