# Opportunities

> Ranked by `(impact × confidence) / effort`. Updated 2026-05-24.
> Tags: `[wedge]` reinforces moat · `[funnel]` drives top-of-funnel · `[retention]` keeps existing users · `[wow]` demo magic · `[infra]` enabling work · `[tech-debt]` paying it down compounds later.

## Tier 1 — do in S1 / S2

### O-01 — `ay-api-gen audit --baseline` (free T0) `[funnel] [wedge]`
Best demand-gen lever we have. Costs us nothing per invocation. Every analyzer already exists as a module — `spec-linter.js` (new, S1-07), `truncate.js`, base-URL guard, namespace check. Compose them behind one verb.
- **Effort:** ~5 engineer-days post-S1
- **Impact:** every README example leads with `audit`; that's where curiosity → trial happens
- **Confidence:** high

### O-02 — Audit a famous public API and publish findings `[funnel] [wow]`
"We audited [Stripe / Linear / OpenAI's] OpenAPI spec — here are the 3 things Claude could be tricked into doing." One blog post, one tweet thread, one HN submission. Coordinate disclosure first.
- **Effort:** 2 days for audit + 2 days for coordinated disclosure + write-up
- **Impact:** the kind of artifact that gets you 1k+ GitHub stars in a week
- **Confidence:** medium-high (depends on landing one Critical finding)

### O-03 — `--owned` mode with interactive confirmation `[wedge]`
T1/T2 customers want to point at their own API. Build the confirmation pattern early so we can demo it to the first design partner.
- **Effort:** 1 day
- **Impact:** unlocks Mode-A live audit which is the most compelling demo

### O-04 — `ay-api-gen explain <tool>` `[wow] [funnel]`
Show the user how a tool will be generated *before* it lands. Inline audit findings.
- **Effort:** 2 days
- **Impact:** "I get it" moment for first-time users; lowers commit-to-trying threshold

### O-05 — Per-tool token cost estimate `[wow]`
"Adding `list_invoices` adds ~340 tokens to every turn that lists tools." Surfaces a real cost most users don't realize.
- **Effort:** 1 day
- **Impact:** people share screenshots of token math; medium

### O-06 — Visual settings.json diff before write `[retention] [wedge]`
Direct UX answer to T-SET-1/T-SET-2 fear. "Here's exactly what I'm about to change in your config."
- **Effort:** 1 day
- **Impact:** turns the strongest threat into a strongest feature

---

## Tier 2 — Phase 2 / commercial

### O-07 — GitHub Action: `liwala/audit-action` `[funnel] [wedge]`
Drop-in audit on every PR that touches OpenAPI specs. Marketplace listing.
- **Effort:** 3 days after `audit --baseline` ships
- **Impact:** distribution; "we added audit-action and it caught a real bug" testimonials

### O-08 — Public API catalog (signed specs) `[funnel] [retention]`
`serve github` / `serve stripe` etc. with curated, pre-audited, signed-manifest specs.
- **Effort:** 1 week for 5 specs + manifest tooling
- **Impact:** removes the "do I trust this URL?" friction; subscription product

### O-09 — Claude-narrated spec diff `[wow] [funnel]`
`ay-api-gen diff` exists; add Claude summarization on top → release-notes generator.
- **Effort:** 2 days
- **Impact:** repeatable content marketing; surfaces breaking changes API publishers themselves missed

### O-10 — `replay` against a fresh spec for regression detection `[retention]`
Re-run the last tool-call sequence against a new spec version; flag diverging responses.
- **Effort:** 3 days
- **Impact:** primarily for API publishers; doubles as their CI

### O-11 — Continuous corpus learning loop `[wedge]`
With consent, every paid audit feeds new threat patterns back into the corpus. Compounding moat.
- **Effort:** 1 week of plumbing + ongoing review
- **Impact:** strongest long-term defensibility

### O-12 — One-click integration with Linear/Notion `[funnel] [retention]`
Push acceptance-log entries to Linear; mirror audit reports to a Notion doc.
- **Effort:** 2 days per integration
- **Impact:** sticky; non-developer stakeholders see findings

---

## Tier 3 — opportunistic / later

| # | Opportunity | Notes |
|---|-------------|-------|
| O-13 | VSCode extension shipping `audit` inline | After Phase 2; only if customers ask |
| O-14 | Sandbox-as-a-service (other people audit their own specs in our sandbox) | Big infra lift; needs M4 first |
| O-15 | Adversarial spec authoring as a service ("redteam-as-a-service" for API teams) | Maps to enterprise tier upsell |
| O-16 | Webhook signature verification audit | Adjacent to OpenAPI; small but valued |
| O-17 | Multi-spec merge with conflict-resolution UI | Task 21 — UX-heavy, defer until two specs is a real customer ask |

---

## Hidden opportunities (founder-lens)

- **The threat model itself is a marketing asset.** Most security-tooling startups can't show a written threat model — they have one in someone's head. Publish the full doc (Luisa already did, in PR #1). Track stars/forks on the *threat model* separately from the code.
- **The two-mode design is a presentation gift.** Demo to investors: "watch me MCP-ify Stripe's API in one command" then switch to generate mode for "here's what we ship in production." Show, don't tell.
- **`liwala/ay-framework` cross-sell.** Walid wrote ay-framework. AY-framework users are exactly the audience for ay-api-gen (Claude Code workflow people). One README cross-link + one combined launch tweet → free pipeline.
- **The "Claude as victim" framing is a position.** No competitor frames it this way. Make it the headline of the threat model post. Defensive positioning that's also good PR.

---

## Things we should explicitly *not* chase

- Web dashboard before CLI is loved. Engineers buy CLIs; dashboards come after retention is proven.
- Multi-tenant hosted runtime. We sell tools, not hosting. Resist the temptation.
- Generic AI-security branding. Stay narrow on **MCP + OpenAPI**. Broader positioning dilutes the message.
- Conference talks before there's a paid customer. Story isn't tight enough yet.
