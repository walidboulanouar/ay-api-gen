# Product Intelligence — ay-api-gen

> Lens: founder / PM / senior eng / growth eng / end user / investor / AI agent operator.
> Updated 2026-05-24. Confidence per claim noted as `[H]` high, `[M]` medium, `[L]` low.

---

## 1. What is the product, really

**One-liner:** ay-api-gen turns any OpenAPI spec into a working MCP server + CLI in seconds — and (the v0.2 wedge) audits both the spec and the generated code so Claude doesn't get hijacked by the API on the other end. `[H]`

**Two-mode design.** Runtime (`serve` — zero codegen) for instant tries. Generate mode for customization and standalone deploy. The runtime mode is the demo magic; the generate mode is what enterprises ship. `[H]`

**The real moat (forming).** Not the generator — that part is easily cloned by anyone who has read the MCP SDK docs (Speakeasy and Gram exist already). The moat is the **three-tier security pipeline** in ADR-006:
- **T0** — static analysis everyone gets free, drives funnel `[H]`
- **T1** — sandboxed Claude audit, paid `[M]`
- **T2** — spec gating + adversarial corpus, enterprise `[M]`

The threat-model document is the artifact most competitors don't have. `[H]`

---

## 2. Where we sit in the landscape

| Tool | Approach | Generates MCP from OpenAPI? | Security tier story? |
|------|----------|----------------------------|----------------------|
| **ay-api-gen** | Two-mode (runtime + generate) + tiered audit | yes | **yes (in flight)** |
| Speakeasy | Generate-only, commercial SDK gen | sort of (SDK→manual MCP) | no |
| Gram | Runtime-only, hosted | yes | no — but they do hosting |
| `mcp-openapi-proxy` (community) | Runtime-only, OSS | yes | no |
| Hand-rolled MCP servers | full custom | n/a | per-author |

Our gap = audit + tier. Everyone else is racing on codegen quality; we're racing on *trust*. That's a defensible position iff the security claims hold up under scrutiny. `[M]` — depends on execution of S1 and the corpus quality.

---

## 3. Who is the user — really

Two modes per the threat model.

### Mode A — API publisher
A vendor (Stripe, Linear, a startup) who wants to ship "talk to our API from Claude" without writing an MCP server. Pain: writing one by hand is 1–3 weeks per API, then it rots. ay-api-gen turns it into 1 command and `regen` keeps it fresh.

**What they care about:** speed + accuracy + the audit telling their customers "we passed". `[H]`

### Mode B — API consumer
A developer at a company that uses N third-party APIs (Stripe + GitHub + Salesforce + Linear + internal API) and wants Claude to drive all of them safely. Pain: every API has different auth, different spec quality, different attack surface. They can't fix the upstream — they can only decide what to expose.

**What they care about:** **gating** (which endpoints are safe to expose?), audit log, the ability to reverse a bad spec change. `[H]`

Mode B is the harder sell but the bigger TAM. Mode A is the easier first design partner — pick 2–3 friendly API publishers (someone on the MCP working group, a former Anthropic eng's startup) as launch design partners. `[M]`

---

## 4. Wedge → expansion narrative

1. **Wedge (free):** `ay-api-gen serve <spec>` and `ay-api-gen audit --baseline`. Both free, both local. 60-second demo for either mode. `[H]`
2. **Land (paid T1):** "I want a deeper review before I ship this to production" → `ay-api-gen audit` (managed sandbox, full Claude review). Per-run billing. `[M]`
3. **Expand (enterprise T2):** "I want spec gating + adversarial testing on every PR that touches my MCP servers" → enterprise contract, corpus access, SLA. `[L]` — story works on paper, needs design partner validation.

The progression mirrors Snyk's land → expand: free static check → paid scanner → enterprise governance.

---

## 5. Sharpest opportunities (next 8 weeks)

> Full prioritized list in [`OPPORTUNITIES.md`](./OPPORTUNITIES.md). Top six here.

1. **Land S1 fixes + flip ADR-006 to Accepted.** This is the credibility predicate for everything else. `[H]`
2. **Pick the name + reserve npm.** Renaming after launch is painful; npm publish is currently blocked on this. ADR-009 sets a 2026-06-01 deadline. `[H]`
3. **Ship `ay-api-gen audit --baseline` (free T0).** Demand-gen funnel, no commercial gating needed. About 1 week of work post-S1 since most analyzers exist as bare modules. `[H]`
4. **Two design-partner API publishers.** Mode A is the easier first sell. Goals: validate the audit narrative, get logos, find the integration friction we don't know about yet. `[M]`
5. **MCP red-team corpus v1 (30 specs).** The most defensible asset of T2. Cannot be cloned cheaply. Achievable in a focused week. `[M]`
6. **Public showcase: "we audited X public API and found Y."** Marketing-grade artifact that demonstrates the value without needing customers. Choose carefully — public APIs we audit must be ones we can publish findings against without breaching ToS. `[M]`

---

## 6. Sharpest risks

> Full ranked list in [`RISKS.md`](./RISKS.md). Top five here.

1. **T-RUN-3 / T-RUN-4 not actually fixable.** Prompt injection is industry-open. We can mitigate (length cap, truncation, boundary markers) but not eliminate. If a customer breach is publicly attributed to "they used ay-api-gen and Claude got hijacked anyway," the whole positioning evaporates. **Mitigation in design:** report severity honestly; never market "secure", market "audited"; SLA only on T0 deterministic checks. `[H]`
2. **Anthropic ships a first-party MCP-from-OpenAPI tool.** Possible. They've done first-party tooling before. **Mitigation:** lean into Mode B / audit (Anthropic is unlikely to ship adversarial corpora). `[M]`
3. **No commercial validation by 2026-Q3.** Easy to keep building the pipeline forever without a paying customer. **Mitigation:** hard goal of one paid T1 customer by 2026-08-01, even at low ACV. `[M]`
4. **The custom YAML parser breaks on real-world specs.** Custom parsers always do. Customer-blocking bug = retention killer. **Mitigation:** S2-06 corpus + S2-05 replace-with-`yaml`. `[M]`
5. **Lockfile / supply-chain on generated `package.json`.** Whatever we ship is the user's exposure too — auto-`npm install` of generated package.json without pinned versions is a liability if a dep is compromised. **Mitigation:** S2-02. `[H]`

---

## 7. Architecture sanity check

- Module layout is clean (18 files, ~3k LOC, one responsibility each). `[H]`
- Zero runtime deps beyond `@modelcontextprotocol/sdk`. Lean. `[H]`
- Two-mode dual-impl is *not* duplication: runtime and generate share parser + auth-codegen + validator. `[H]`
- Tests are the weak spot — 29 tests don't cover any of the v0.1.1 features. Tech debt that compounds the longer we wait. `[H]`
- No formal logging / observability story yet. Fine for v0.1, will bite us when we have customers. `[M]`

See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the engineering view.

---

## 8. AI-native opportunities we should be designing toward

- **Audit-as-PR-author.** T2 produces draft PRs that fix the finding. ADR-006 already commits to never auto-merging — keep that line bright, but the draft-PR UX itself is the magic. `[H]`
- **"What changed?" diff between spec versions, narrated by Claude.** `ay-api-gen diff` exists already; wrap a Claude summarization on top and it becomes a release-notes generator for API consumers. `[H]`
- **Discovery → suggestion → audit chain.** `discover` finds the spec, `audit` reports on it, `serve` runs it. End-to-end demo: "give me MCP access to vendor X" → 3 commands → done. `[H]`
- **Continuous corpus learning.** Every customer audit (with consent) seeds new threat patterns into the corpus. Compounds defensibility over time. `[M]`

---

## 9. Wow features (cheap, high signal)

- **`ay-api-gen explain <tool-name>`** — show how an MCP tool will be generated *before* generating it. Builds confidence and surfaces audit findings inline. ~2 days. `[H]`
- **Per-tool token cost estimate.** "Adding this tool will add ~340 tokens to every Claude turn that lists tools." Token-budget transparency. ~1 day. `[H]`
- **Visual settings.json diff.** Show users what will change in `.claude/settings.json` before write. Maps directly to the T-SET-1 / T-SET-2 fear. ~1 day. `[M]`
- **`ay-api-gen replay <session>`** — re-run the last tool-call sequence against a fresh spec to detect regressions. Aimed at API publishers, doubles as a self-test in CI. ~3 days. `[M]`

---

## 10. Open product questions

| Q | Why it matters | Default if unanswered by 2026-06-30 |
|---|----------------|-------------------------------------|
| Pricing for T1? per-audit ($0.50–$5)? per-month? | Lock the wedge → paid story | Per-audit, $1 floor, capped by license tier |
| What's the customer-facing brand for the security tier? | Naming is permanent | Carry `ay-api-gen audit` as the verb, don't sub-brand |
| Hosted UI in v1 or CLI-only? | Affects sales surface | CLI-only — sell to engineers first |
| Open-source license of corpus? | Defensibility vs adoption | Keep corpus proprietary; release detection rules under MIT |
| Org structure inside liwala? | Founder time allocation | walid = founder/eng, luisa = security/PM (current de facto) |
