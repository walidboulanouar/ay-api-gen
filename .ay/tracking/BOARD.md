# Pipeline Board

> Updated 2026-07-25 · branch `ay-framework` · sprints **S1 (security baseline)**, **S2 (hardening + coverage)**, **S3 (locking + remaining audits + yaml dependency)**, item 19 (OpenAPI 3.1), and a **competitive gap-analysis sprint** all landed
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
| S2-05 | Replace custom YAML parser with `yaml` (Aro) — after corpus | S3 | DONE 2026-07-25 | `yaml@2.9.0` exact-pinned, zero transitive deps. `src/yaml-parser.js` now a thin wrapper. Full corpus re-run + new anchor/alias + block-scalar positive tests: 103/103 in `test/run.js`. See ADR-013. |
| S2-06 | YAML adversarial corpus + test runner | S2 | DONE (scoped) | 13 hand-built adversarial cases + 1 positive round-trip case in `test/run.js`. Not the full external `yaml-test-suite` (would need a network fetch) — a hand-built mini-corpus covering the gotcha classes that matter for OpenAPI YAML. |
| S2-07 | `ay-api-gen audit --baseline` (T0 free runner) | S2 | DONE | `bin/ay-api-gen.js` — free, no license check, wraps `spec-linter.js`. Supports `--mode=b` + `--accept-risks` for blocking mode, same contract as `generate`. |
| Gap closure | Extend url-guard.js SSRF/host-rebind protections to `cli-generator.js`'s generated standalone CLI | S2 | DONE | Closes the gap logged in S1's HANDOFFS.md — the generated CLI (`cli.js`) now gets `resolveBaseUrl`/`assertHostAllowed` same as the generated MCP server and `runtime/cli.js`. |
| 30 | Public API catalog (`serve github`, `serve stripe`) | S3 | - | Curated, signed specs only |

## S3 sprint — locking + remaining threat-model audits (landed 2026-07-25)

| # | Task | Status | Notes |
|---|------|--------|-------|
| B-09 | File locking for `settings-injector.js` / `registry.js` read-modify-write | DONE | New `src/file-lock.js` — atomic exclusive-create (`wx`) advisory lock, stale-lock breaking, generous timeout for interactive confirm prompts. Applied to both `injectSettings()` and `registerAPI()`/`unregisterAPI()`. 8 deterministic unit tests (mutual exclusion proven via artificial delay, not racy wall-clock timing) + a 6-process real-CLI concurrency stress test in `test/integration-cli.js`. |
| T-GEN-2 | `package.json` field injection in generated output | DONE | Traced fully: package.json is built via `JSON.stringify()` of a real object (not string concat), so JSON-structure injection was never actually exploitable — but `--name` bypassed the title's sanitization regex, risking path traversal in the default output dir. Fixed with a single `sanitizeApiName()` applied uniformly to both sources. 13 regression tests. |
| T-API-3 | Mass-assignment-prone request schema (flagged "future scope" in S1-07's task file) | DONE | New check in `src/spec-linter.js` — flags request-body fields matching privilege/value-sensitive names (`role`, `is_admin`, `balance`, `permissions`, etc.) on mutating endpoints unless explicitly `readOnly: true`. |
| S2-05 | YAML dependency swap | DONE | See above row and ADR-013. Delegated to a subagent running in parallel with the B-09/T-GEN-2/T-API-3 work above — completed cleanly, zero merge conflicts (scoped to non-overlapping files). |
| T-GEN-4 | Output path traversal via `--output` | DONE | Two-tier `checkOutputPathSafety()` in `bin/ay-api-gen.js`: system directories + the bare home/filesystem root are refused outright (no override — no legitimate use case); anything else outside the cwd is allowed with a visible warning, since deliberately writing elsewhere is normal `--output` usage. Also fixed a related bug found while wiring this: the `init` wizard's `.env` pre-write used raw, unsanitized `config.name`, which could both traverse AND land in a different directory than the generated server. Caught and fixed a self-inflicted bug during testing: an early version of the deny-list included `/var`, which is where macOS's own temp directory lives — would have blocked ordinary `--output /tmp/...` usage. 18 regression tests. |
| 23, 24 | Response caching + rate limiting in runtime | DONE | Backlog items, picked up after confirming everything else in the backlog was blocked or underspecified (see below). Both opt-in (`AY_CACHE_TTL_MS`, `AY_RATE_LIMIT_RPS`), wired into `runtime/mcp-server.js` only — `runtime/cli.js` is a one-shot process (exactly one HTTP call per invocation), so neither feature has anything to act on there. Verified via a real MCP client/server protocol roundtrip (`@modelcontextprotocol/sdk`'s `Client` + `StdioClientTransport`), not just unit tests of the primitives. |

Note: the user's initial S3 request named "T-GEN-2 (the mass-assignment heuristic)" — checked against the actual `THREAT-MODEL.md` (which lives on the `security-threat-model` branch, not `ay-framework`) and found T-GEN-2 is actually "package.json field injection"; the mass-assignment heuristic is T-API-3. Implemented both rather than guessing which one was meant, since neither conflicted and both were real, previously-unaddressed threats.

## Competitive gap-analysis sprint (landed 2026-07-25)

Full writeup: [`../../GAP-ANALYSIS.md`](../../GAP-ANALYSIS.md). Public web research (no signups, no authenticated scraping) on 5 real, currently-shipping competitors: Speakeasy/Gram, FastMCP + Prefect Horizon, `openapi-mcp-generator` (harsha-iiiv), DigitalAPI, `openapi-mcp-codegen` (cnoe-io).

**Headline finding**: two competitors have disclosed, patched CVEs/vulnerabilities in exactly the vulnerability classes this project hardened preemptively — FastMCP's SSRF/path-traversal CVE-2026-32871 in its OpenAPI provider, and `openapi-mcp-generator`'s SSRF-via-$ref (#68) and template-literal-injection-leaking-`process.env` (#67), the latter a near-exact match for this project's own T-ING-1/T-GEN-1 class of fix — with their own SSRF patch regressing days later (#70). This is now the strongest evidence-backed claim in `GAP-ANALYSIS.md` §3.

| # | Task | Status | Notes |
|---|------|--------|-------|
| gap-1 | T-API-4 (sensitive query param) + T-API-5 (weak/no global auth scheme) | DONE | Extended `spec-linter.js` with checks already scoped in `THREAT-MODEL.md` but never implemented — directly deepens the one area competitors (DigitalAPI's Spectral lint, Speakeasy's undisclosed "prompt injection detection") claim to beat us on. |
| gap-2 | StreamableHTTP transport for `serve` | DONE | See item 20's updated row above. |

**Not built, documented instead** (per instructions — genuinely needs live infra/secrets, not guessed at): interactive OAuth 2.1 PKCE + Dynamic Client Registration (needs a live OAuth provider to verify against), and hosted/managed MCP server serving (needs real hosting infrastructure + a product decision on hosting model). Both logged in `HUMAN-SETUP-NEEDED.md`.

**Not built, deferred with reasoning** (real gaps, not underspecified, but bigger than a same-night add-on): multi-tool workflow composition (Gram-style), broader RBAC/SSO/audit-trail governance UX (a hosted-service feature category, not a CLI feature).

## Post-PR#1 sprint — remaining threat-model gaps (landed 2026-07-25, new branch/PR per chunk)

Full `THREAT-MODEL.md` (on `security-threat-model` branch) re-audited against current code after PR#1 shipped. Most threat IDs were already closed by S1–S3; three genuine, still-open, engineering-scoped gaps found and closed:

| # | Task | Status | Notes |
|---|------|--------|-------|
| gap-3 | T-ING-3 (DoS via large/nested spec — no size cap) | DONE | `parser.js`'s `loadSpec()` had zero size limit; a 500MB spec (malicious URL or bad copy-paste) was read fully into memory before parsing could reject it. Fixed with a 25MB cap: `statSync` pre-check for local files (never opens the file), streaming byte-counter for fetched URLs (`readCapped()` — aborts mid-stream, can't be bypassed by a missing/lying `Content-Length`). Also applied to `discover.js`'s probe fetches, which had the same unbounded-`res.text()` pattern across up to 19 probe paths per domain. |
| gap-4 | T-API-6 (no declared rate limiting) | DONE | New spec-linter check, same pattern as T-API-1..5: one spec-wide LOW finding if no endpoint anywhere declares a 429 response or a `RateLimit-*`/`X-RateLimit-*` header. `parser.js` now derives `hasRateLimitSignal` per endpoint to support it. Legitimately changed 2 existing fixture-based test assertions (finding counts went up by exactly 1 on specs that were missing this signal all along) — same "update the test, don't weaken the assertion" discipline as every other case like this in this project's history. |
| gap-5 | T-GEN-3 / T-SUP-2 (floating version ranges in generated `package.json`) | VERIFIED, no fix needed | Audited `bin/ay-api-gen.js`'s generated-output `package.json` template — `@modelcontextprotocol/sdk` is already exact-pinned (`"1.29.0"`, no `^`/`~`), no other dependency is emitted. Confirmed rather than assumed. |
| gap-6 | T-ING-4 (custom YAML parser RCE/DoS risk) | VERIFIED, no fix needed | Threat doc flagged this as needing "a positive audit, not negative inference" — never actually done since the S3 migration off the hand-rolled parser onto the real `yaml` package. Empirically verified 3 invariants rather than trusting the package's reputation: (a) the package's built-in `maxAliasCount` guard actually rejects a constructed exponential alias-expansion ("billion laughs") chain — confirmed by building one and watching it throw, not just reading the docs; (b) YAML merge-key syntax (`<<: *anchor`) is NOT auto-expanded by default, foreclosing a merge-key prototype-pollution vector; (c) a literal `__proto__` map key round-trips as ordinary data and does not touch the real `Object.prototype`. 6 new regression tests lock all three in. |

Verification: `node test/run.js` (166/166) + `node test/integration-cli.js` (120/120) + `python3 ~/.claude/skills/pin-guard/scripts/scan.py .` (clean, same 2 pre-existing findings).

## Backlog — commercial / scale

**Surveyed 2026-07-25** for anything buildable without a human product/business
decision. Verdict: every C-item below is genuinely blocked — either on
Walid/Luisa's own action items (npm publish credentials, product naming,
ADR-006/ADR-012 sign-off), on real infrastructure this session was not
permitted to provision (AWS Fargate, a live Stripe account), or on a
licensing/tier model that hasn't been decided yet and that C-05/C-06 both
explicitly depend on. None were touched. See PROGRESS-LOG.md for the
per-item reasoning.

| # | Title | Notes |
|---|-------|-------|
| C-01 | T1 sandbox (Fargate + Claude agent) — paid tier | ADR-006 §4. Blocked: real AWS infra + credentials, paid-tier gating not yet built (C-04). |
| C-02 | T2 spec gating + override UX (CLI + config + prompt) | ADR-006 §5.1, see Walid OQ-5. Blocked: builds on ADR-012, which is still "Proposed" (not Accepted) — building on an unreviewed design risks wasted rework. |
| C-03 | T2 MCP red-team harness + adversarial corpus | ADR-006 §5.2 — enterprise tier. Blocked: same as C-01 (paid/enterprise tier, no licensing yet), and the T1/T2 sandbox it would run in doesn't exist. |
| C-04 | License gating logic | Single CLI, tier from license. Blocked: genuinely underspecified — no license format, verification method, or server has been decided anywhere in the tracking docs. This is a product decision, not an engineering gap. |
| C-05 | Pricing page + billing integration | Stripe — depends on tier definitions. Blocked: explicitly depends on undecided tier definitions, plus needs a real Stripe account (human-provided credentials — see HUMAN-SETUP-NEEDED.md). |
| C-06 | Customer-owned-API mode (`--owned`) | T1/T2 opt-in with interactive confirmation. Blocked: depends on T1/T2 (C-01/C-03), which don't exist yet. |
| C-07 | Acceptance log + `.ay-api-gen.yml` config schema | OQ-5 — required for T2. Blocked: same ADR-012-not-Accepted issue as C-02 — this literally IS ADR-012's implementation. |
| 19 | OpenAPI 3.1 full support (webhooks, pathItems) | **DONE 2026-07-25.** Research subagent produced a prioritized 3.0→3.1 diff (JSON Schema 2020-12 alignment, webhooks, pathItems); implemented every item that had real, currently-triggered impact. Fixed the `type` array (`nullable`) normalization at the single source of truth (`parser.js`'s `buildSchema()`) — every `switch(schema.type)` in the codebase was silently mismapping array-valued types to a wrong Zod fallback before this. Added `components.pathItems` and `webhooks` `$ref` resolution (a `$ref`'d PathItem was previously silently dropped — `pathItem.get` was `undefined` on the raw `{$ref}` object, no error). Parsed `webhooks` structurally into a separate array but deliberately did NOT turn them into generated tools — confirmed via research this is the technically correct choice (webhooks describe inbound calls the API makes to you, the reverse direction of everything `paths` describes; there's no URL to call). Explicitly NOT implemented: `exclusiveMinimum`/`exclusiveMaximum` numeric form, `examples` vs `example`, `$ref`-sibling semantics — none of these are read anywhere in the codebase today, so there was no existing behavior to fix; would be net-new speculative scope. 16 unit tests (`test/run.js`) + 1 real MCP-protocol end-to-end test proving a `null` argument is actually accepted by the runtime server's Zod validation, not just correct in generated source text — verified by temporarily reverting the fix and confirming the exact predicted Zod rejection (`"expected string, received null"`) before restoring it. |
| 20 | HTTP transport for remote MCP servers | **DONE 2026-07-25 (later same day)** — StreamableHTTP transport added to `ay-api-gen serve --transport http`. The "needs a security decision" concern from the earlier deferral was resolved with real competitor evidence (`GAP-ANALYSIS.md`, competitive research): `openapi-mcp-generator` and Gram both ship HTTP-reachable transport, and localhost-default binding with an explicit, loud opt-in to bind wider is a defensible, expected default rather than a novel decision. Auth model deliberately left as "none built-in, loud warning if you expose it" — a full auth layer is out of scope for a code-generation CLI and would need the same live-infra verification as the PKCE/DCR gap (see HUMAN-SETUP-NEEDED.md). |
| 21 | Multi-spec merge (combine N specs into 1 MCP server) | Large; UX questions open — surveyed 2026-07-25, genuinely underspecified per the board's own note, not touched. |
| 23 | Response caching in runtime | **DONE 2026-07-25.** `src/response-cache.js`, opt-in via `AY_CACHE_TTL_MS`, wired into `runtime/mcp-server.js`. Real MCP-protocol end-to-end test (actual Client/StdioClientTransport roundtrip) + unit tests. |
| 24 | Rate limiting in runtime | **DONE 2026-07-25.** `src/rate-limiter.js`, opt-in via `AY_RATE_LIMIT_RPS`, per-host throttle (delays, doesn't reject), wired into `runtime/mcp-server.js`. Same real-protocol test rigor as item 23. |

## Naming / branding (decision required)

| Topic | Note |
|-------|------|
| Product name | Open between `ay-api-gen` (current), `safeapi2mcp` (Luisa), `gauntlet`, `ay-vet`, `ay-customs`, `ay-chaperone`. **Decide before Task 17 (npm publish)** — renaming a published package is painful. See [DECISIONS.md ADR-009](DECISIONS.md). |
