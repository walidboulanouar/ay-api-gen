# Risks Register

> Ranked by `severity × likelihood`. Updated 2026-05-24.
> Severity: 1 (annoying) … 5 (existential). Likelihood: 1 (rare) … 5 (likely soon).

## Top 10

### R-01 — Prompt injection cannot be eliminated, only mitigated (sev 5 × likely 4 = 20)
T-RUN-3 (tool description PI) and T-RUN-4 (response body PI) are industry-open problems. We can cap lengths, add boundary markers, truncate — none of that *prevents* a sophisticated payload from steering Claude.

**If it goes wrong:** a publicly attributed Claude hijack via an MCP server we generated. Story is "ay-api-gen claimed audited; it wasn't enough."

**Mitigation:** Never use the word "secure" in marketing — only "audited." Severity ratings on findings always honest. Pre-commit a public security disclosure process. SLA only on T0 deterministic checks.

---

### R-02 — Generated `package.json` supply-chain compromise (sev 5 × likely 2 = 10)
ADR-004 auto-runs `npm install --production` in the generated output directory. If versions are floating (T-SUP-2 — needs audit), a compromised dep silently lands in every customer's generated artifact on next regen.

**If it goes wrong:** mass credential exfiltration through customer credentials in their `.env`.

**Mitigation:** S2-02 — pin exact versions + lockfile alongside generated `package.json`. Verify across all generators (mcp-generator, cli-generator). Should be a 1-hour fix once we confirm the current state.

---

### R-03 — Anthropic ships first-party MCP-from-OpenAPI (sev 4 × likely 3 = 12)
Possible. They have first-party tooling track record (Claude Code itself).

**If it goes wrong:** the generator commoditizes overnight; we still have the audit but lose the demo magic.

**Mitigation:** Lean Mode B / audit story. Anthropic is unlikely to maintain adversarial corpora or to ship spec-gating UX. Move quickly to make `audit` the headline verb in marketing, not `serve`.

---

### R-04 — Six-month-no-customer drift (sev 4 × likely 3 = 12)
Comfortable iterating on the security pipeline without a paying customer to push back on assumptions.

**If it goes wrong:** we ship the wrong product (technically excellent, no buyer).

**Mitigation:** Hard goal — one paid T1 customer by 2026-08-01. Two design partners by 2026-07-15. If neither lands by those dates: pause C-* work and do customer-discovery interviews.

---

### R-05 — Custom YAML parser breaks on a real spec (sev 4 × likely 3 = 12)
`src/yaml-parser.js` is 213 lines of hand-rolled YAML. Real-world OpenAPI YAMLs use anchors, multi-line strings, complex `$ref` interactions.

**If it goes wrong:** customer points at vendor YAML, ay-api-gen crashes or silently mis-parses. Trust loss is acute because the spec parsing is *foundational*.

**Mitigation:** S2-05 — replace with `yaml` (Aro). Blocked until S2-06 corpus exists so the swap is testable.

---

### R-06 — Settings injection escalation (sev 4 × likely 2 = 8)
T-SET-1 + T-SET-2. Currently `settings.mcpServers[name] = …` silently overwrites. Malicious spec can shadow `github` MCP entry and steal its env vars.

**If it goes wrong:** a single malicious spec is enough to pivot to any other MCP server the user has configured.

**Mitigation:** S1-03 (`ay-api-gen:` namespace + refuse-or-prompt). Already scoped.

---

### R-07 — Base URL credential exfiltration (sev 5 × likely 1 = 5)
T-ING-2 + T-RUN-1. `API_BASE_URL` override is unconditional today; a write to settings.json (chained from T-SET-*) plus auth headers → exfil host.

**If it goes wrong:** customer credentials silently sent to attacker on every tool call.

**Mitigation:** S1-05 (same-host refinement default). Already scoped.

---

### R-08 — Spec name collisions silently merge into one tool set (sev 3 × likely 3 = 9)
When two specs derive the same tool name (e.g., `get_users` from both `/users` and `/v2/users`), the second silently overwrites the first. The dedupe fix in commit 0e866b5 handles only intra-spec collisions, not cross-spec.

**If it goes wrong:** users think they're calling spec A's endpoint, actually calling spec B's. Subtle, hard to debug.

**Mitigation:** Spec-aware tool prefix in multi-spec mode (Task 21). For single-spec mode, audit needs to flag risky names (e.g., `delete_user`).

---

### R-09 — Open-source contributor expectations vs proprietary corpus (sev 3 × likely 3 = 9)
We want OSS adoption (drives funnel) but the T2 corpus is proprietary. The fault line between "what's MIT" and "what's commercial" needs to be unambiguous from day one or contributors get frustrated.

**If it goes wrong:** community pushback ("you said open source"), forks.

**Mitigation:** ADR + LICENSE clarity. Detection rules MIT. Corpus separate repo, separate license. Document on README.

---

### R-10 — Founder bandwidth (sev 4 × likely 3 = 12)
Walid is solo on engineering (Luisa = security/PM/some eng). S1 alone is ~12–16 engineer-hours. Commercial work (M4+) is order of magnitude more.

**If it goes wrong:** burnout, slipped milestones, design partners lose patience.

**Mitigation:** Don't take on M7–M9 in 2026 unless a paid customer funds an additional engineer hire. Treat the roadmap dates as the *latest* we'd be okay with, not the *earliest*.

---

## Tier 2 (watching, not actively mitigating)

| # | Risk | Why deferred |
|---|------|--------------|
| R-11 | npm typo-squat after publish | Mitigate by reserving common misspellings at publish time |
| R-12 | MCP SDK breaking changes | Pin minor; track v1 stability statement |
| R-13 | License-key bypass | Acceptable risk pre-product-market-fit; revisit at M4 |
| R-14 | Sandbox escape in T1 (a malicious spec breaks out of Fargate) | Mitigated by IAM scoping; add detective monitoring |
| R-15 | Corpus poisoning (someone feeds us a spec designed to evade detection) | Address via signed corpus + reviewer approval |

---

## Risk acceptance vs mitigation

For each risk, default is **mitigate** unless explicitly listed here as accepted:

- **Accepted:** R-13 (license bypass pre-PMF), R-14 partial (rely on AWS isolation primitives v1)
- **Transferred:** none currently
- **Avoided:** active upstream API probing (ADR-006 §6.1)
