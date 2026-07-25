# Roadmap

> Three phases, six milestones. Dates are targets, not commitments. Updated 2026-05-24.

## Phase 1 — Trust foundations (now → 2026-06-30)

Goal: ship a hardened v0.2.0 that backs up the security narrative, accept ADR-006, name the product, publish to npm.

### M1 — v0.2.0-security-baseline · target 2026-06-07
- S1-01..S1-07 land (T-ING-1 escape, truncate wire, settings namespace, description cap, base-URL refinement, IP deny-list, spec-linter warn-only)
- ADR-006 flips Proposed → Accepted (Luisa sign-off after S1-01..04 ship)
- All 7 existing v0.1.1 features get integration tests
- Release notes published as `STANDING.html` v2

### M2 — name + npm publish · target 2026-06-15
- Product name chosen by 2026-06-01 (ADR-009 criteria)
- npm namespace reserved
- v0.2.0 published to npm
- README + landing page updated for new name
- Migration shim: old `npx ay-api-gen` still resolves for ~3 months

### M3 — `audit --baseline` (free T0) · target 2026-06-30
- `ay-api-gen audit [<spec>] --baseline` ships as primary CLI verb
- Output formats: human (default), JSON, SARIF
- GitHub Action wrapper published (`liwala/audit-action`)
- README quickstart updated to lead with `audit`, not `serve`
- Public showcase post: "we audited the top 10 public OpenAPI specs"

## Phase 2 — Commercial wedge (2026-07-01 → 2026-09-30)

Goal: first paying customer for T1, two design partners on T2, defensible corpus.

### M4 — T1 sandbox MVP · target 2026-08-01
- Fargate-based sandbox (ADR-011) — one task per audit run
- Claude Code agent in sandbox reads spec + generator artifact, emits Markdown report
- License-key check (simple JWT-from-our-API) gates T1
- Pricing live (per-audit, $X)
- First paid customer onboarded (even if low-ACV — proof of willingness-to-pay)

### M5 — T2 spec gating + acceptance log · target 2026-09-01
- `.ay-api-gen.yml` config schema implemented (ADR-012)
- Three-channel override (CLI flag, config, interactive) with documented precedence
- Acceptance log written to `.ay-api-gen/acceptance.log`
- One Mode-B design partner walks an end-to-end Stripe / GitHub / internal-API gating flow
- Customer-owned-API mode (`--owned`) ships behind interactive confirmation

### M6 — T2 red-team corpus v1 · target 2026-09-30
- 30 adversarial specs in private corpus, each tagged with T-* threat ID + expected-detection assertion
- Red-team harness runs corpus against generated artifact, returns findings + draft PR
- Quarterly corpus update cadence established
- Public security disclosure flow (security.txt + email) live

## Phase 3 — Scale & ecosystem (2026-10-01 → end of year)

Goal: hosted UI, public API catalog, multi-spec workflows, paid customer count = 10.

### M7 — Public API catalog · target 2026-11-01
- Curated, signed specs: `serve github`, `serve stripe`, `serve linear`, `serve notion`, `serve openai`
- Each catalog entry pre-audited; signed manifest in the registry
- Subscription tier ($/month) for catalog access

### M8 — Hosted T1 dashboard · target 2026-12-01
- Web UI for browsing past audit runs
- PR-comment integration (GitHub App) — auto-comments on PRs that touch `.ay-api-gen.yml`
- SSO (Google + GitHub) for team accounts

### M9 — Multi-spec merge + ecosystem · target 2026-12-31
- `ay-api-gen merge spec1 spec2 spec3` → single MCP server exposing union
- Conflict resolution UX (when two specs declare the same tool name)
- Two ecosystem integrations: Linear (audit on issue close), Notion (acceptance log mirror)

---

## What we are explicitly NOT doing

- Active fuzzing of third-party upstream APIs (ADR-006 §6.1 — legal wall)
- Autonomous fix-and-commit (ADR-006 §6.3 — PR drafts only, ever)
- Hosted multi-tenant runtime (we ship CLI + sandbox infra, customer brings the credentials)
- Browser extension or IDE plugin (CLI is the surface)
- Anything that requires the customer to ship telemetry back to us without explicit opt-in

---

## Release cadence target

- Patch releases: as needed for security fixes (target same-day for High/Critical)
- Minor releases: every 2–3 weeks during Phase 1, monthly thereafter
- Major releases: when a breaking change ships (target none in 2026)
