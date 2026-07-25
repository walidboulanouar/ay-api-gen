# Architecture Decision Records

> Status: Proposed (RFC) / Accepted / Superseded / Deprecated (introduced in ADR-006)

---

[ADR-001] Runtime vs Generate — Two-Mode Architecture
Status: Accepted
Context: Users need both quick prototyping (no files) and customizable output (static files).
Decision: Support both modes — `serve` for runtime, default for codegen.
Rationale: Runtime is zero-friction for testing. Generate is needed for standalone deployment, customization, and offline use.
Alternatives: Generate-only (Speakeasy approach), Runtime-only (Gram approach).
Date: 2026-05-10

[ADR-002] Zod for MCP Tool Schemas
Status: Accepted
Context: MCP SDK v1.29 requires Zod schemas for tool input validation, not plain JSON Schema objects.
Decision: Generate `z.coerce.number()` / `z.coerce.boolean()` / `z.string()` for all param types.
Rationale: `z.coerce` handles string→number conversion since MCP tool arguments arrive as strings.
Alternatives: Plain JSON Schema (doesn't work with SDK), custom validation (unnecessary).
Date: 2026-05-10

[ADR-003] Auth Code via String Concatenation
Status: Accepted
Context: Template literal escaping for backticks in generated auth code caused syntax errors.
Decision: Use line-by-line string concatenation in auth-codegen.js with a `tpl()` helper for backtick template strings.
Rationale: Avoids triple-escape hell when generating JS that contains template literals inside template literals.
Alternatives: Heredoc strings (not available in ESM), external template files (extra complexity).
Date: 2026-05-10

[ADR-004] Auto-Install Dependencies in Output
Status: Accepted
Context: Generated MCP servers import `@modelcontextprotocol/sdk` and `zod`, which need to be installed.
Decision: Generate a `package.json` in output dir and run `npm install --production` automatically.
Rationale: Standalone usage from any directory must work without manual setup.
Alternatives: Bundle deps inline (too large), require project-level install (breaks standalone).
Date: 2026-05-10

[ADR-005] Security Scheme Detection from Spec
Status: Accepted
Context: OpenAPI specs define auth via `securityDefinitions` (2.0) and `components.securitySchemes` (3.x).
Decision: Parse all schemes, generate auth code specific to detected types, generate `.env.example` per scheme.
Rationale: Users shouldn't have to manually figure out what auth an API needs.
Alternatives: Always use generic Bearer auth (misses API key in query, Basic, OAuth2 flows).
Date: 2026-05-10

[ADR-006] Three-Tier Security Pipeline
Status: Proposed (RFC)
Context: Threat model identifies ~20 threats; several Critical/High have no current mitigation.
Decision: Three layered tiers — T0 static (everyone), T1 sandboxed AI review (paid), T2 spec gating + MCP red-team (enterprise). Reports/draft-PRs only; never autonomous merge. No upstream API probing without explicit customer authorization.
Companion: docs/security/THREAT-MODEL.md, docs/security/ADR-006-security-pipeline.md
Responses: docs/security/RFC-RESPONSES-walid.md
Acceptance gated on: S1-01..04 landing + answers to OQ-1..6 (now provided)
Date: 2026-05-21
Update (2026-07-25): S1-01..S1-07 all landed on `ay-framework` (see HANDOFFS.md, AGENTS-LOG.md). Every fix S1-08 names as a precondition is now in place. Status remains "Proposed (RFC)" pending Luisa's review pass — not self-flipping to Accepted since that's her sign-off per BOARD.md S1-08.

---

## Proposed in response to ADR-006 review (PR #1)

[ADR-007] Same-host base URL refinement default
Status: Proposed (Walid, 2026-05-22)
Context: T-RUN-1 + T-ING-2 — `API_BASE_URL` env override is currently unconditional (`mcp-generator.js:95`), so a write to settings.json can rebind the auth-attached base URL to an attacker host. Same applies to `servers[0].url` taken from spec.
Decision: Default to same-scheme + same-host as spec `servers[].url`. Allow full override with `API_BASE_URL_ALLOW_HOST_OVERRIDE=1` (env) or `--allow-host-override` (generation-time flag), logged loudly.
Rationale: Preserves legitimate staging/prod URL swap while closing the exfil path.
Alternatives: Allow-list of hosts (less flexible); ignore env override entirely (breaks dev/staging UX).
Date: 2026-05-22

[ADR-008] `ay-api-gen:` namespace for `.claude/settings.json` MCP entries
Status: Proposed (Walid, 2026-05-22)
Context: T-SET-1 — `settings-injector.js:42` does `settings.mcpServers[name] = …`, silently clobbering an existing entry. A malicious spec named `github` shadows the real GitHub MCP server and steals its env credentials.
Decision: Insert under `mcpServers["ay-api-gen:<name>"]`. If the unprefixed name exists from another source, refuse the write and exit non-zero unless `--force`. If a prefixed name collides, prompt (non-interactive: exit non-zero unless `--force`).
Rationale: Namespace prefix makes ownership visible at config-read time and prevents cross-tool key collisions structurally.
Alternatives: Pure prompt-and-confirm (depends on terminal); refuse-everything (breaks `regen` flow); hash-suffix (illegible).
Date: 2026-05-22

[ADR-009] Product/package naming — defer to 2026-06-01 with criteria
Status: Proposed (open question, no owner)
Context: Several candidate names floated: current `ay-api-gen` (descriptive but utilitarian), `safeapi2mcp` (Luisa, descriptive of v0.2 positioning), `gauntlet` / `ay-vet` / `ay-customs` / `ay-chaperone` (Claude name suggestions emphasizing the security tiering). Renaming a published npm package is painful.
Decision: Hold npm publish (Task 17) until name is decided. Criteria for decision: (a) maps to the three-tier security narrative; (b) usable as a verb in docs; (c) not generic in the security tooling space; (d) liwala org buy-in.
Action: Walid + Luisa pick by 2026-06-01.
Date: 2026-05-22

[ADR-010] Free `ay-api-gen audit --baseline` (T0 only)
Status: Proposed (Walid, 2026-05-22)
Context: ADR-006 §11 OQ-6 — should T0 run on demand for free, or only via CI?
Decision: Ship free local-only `ay-api-gen audit --baseline` running all T0 analyzers. No license check. T1/T2 remain license-gated.
Rationale: T0 is deterministic, runs locally, costs us nothing per invocation. Gating it is punitive without being protective. It's the demand-generation funnel for paid tiers.
Naming nit: `--static-only` reads awkward; prefer `--baseline`.
Date: 2026-05-22

[ADR-011] Sandbox infra = AWS Fargate v1
Status: Proposed (Walid, 2026-05-22)
Context: ADR-006 §11 OQ-3 — where does the T1/T2 sandbox live?
Decision: Fargate task per audit run with strict task role + VPC-endpoint egress allowlist. Spec URL is the only allowed external host. v1 supports spec URL only (no repo clone).
Rationale: Per-job billing, well-understood network isolation primitives, no orchestration platform to maintain.
Alternatives rejected: self-hosted k8s (ops cost), Vercel/Modal (less control over egress).
Date: 2026-05-22

[ADR-012] Acceptance log + `.ay-api-gen.yml` schema
Status: Proposed (Walid, 2026-05-22)
Context: ADR-006 §11 OQ-5 — Mode B spec-gating override UX.
Decision: Three channels — CLI flag, `.ay-api-gen.yml` config (primary, PR-reviewable), interactive prompt. Precedence: prompt > config > flag. Default deny. Every acceptance recorded in `.ay-api-gen/acceptance.log` with `accepted_by` (required), `accepted_at` (required), threat ID, endpoint, channel, reason.
Schema sketch is in docs/security/RFC-RESPONSES-walid.md.
Date: 2026-05-22

[ADR-013] Replace hand-rolled YAML parser with the `yaml` npm package (S2-05)
Status: Accepted
Context: `src/yaml-parser.js` was a deliberately minimal, zero-dep YAML subset parser, explicitly documented as not supporting anchors/aliases, real multi-line block scalars, complex keys, or merge keys. S2's adversarial corpus (13 hand-built cases) proved it never crashed on adversarial input, but its limited feature support meant some legitimate OpenAPI YAML specs (using anchors for shared schema fragments, or `|`/`>` block scalars for long descriptions) would silently mis-parse rather than fail loudly.
Decision: Replace it with `yaml@2.9.0` (exact-pinned, zero transitive dependencies, single-maintainer `eemeli/yaml` — the de facto standard Node YAML library), wrapped in a thin compatibility shim that preserves the exact `parseYaml(str) -> object|null`, never-throws contract so `src/parser.js`'s one call site needed zero changes.
Rationale: A real parser closes a correctness gap (anchors/aliases, block scalars now actually work) with less code to maintain, at the cost of one new dependency — acceptable given it's a leaf package with no further transitive surface, and the project already depends on `@modelcontextprotocol/sdk`.
Behavior change accepted: duplicate YAML map keys now cause a parse failure (returns `null`) instead of silently keeping the last value — arguably more correct (duplicate keys are a spec smell), verified via the adversarial corpus re-run (all 13 original cases + new positive cases for anchors/aliases and block scalars: 103/103 passing in `test/run.js`).
Alternatives considered: `js-yaml` (also solid, but `yaml` has no dependencies while `js-yaml` doesn't either in recent versions — chose `yaml` for its more actively maintained TypeScript-first API and because it was the one already vetted via `pin-guard verify`).
Date: 2026-07-25

---

## Decision style notes

- `Status:` field added in ADR-006 onward. ADRs 001–005 retroactively Accepted.
- Proposed ADRs require sign-off from at least one of {Walid, Luisa} to move to Accepted.
- An ADR may be Superseded by another ADR (link both ways in the front matter); never silently rewritten.
