# Agent Handoffs

Write gotchas, API discoveries, and decisions here.
Other agents read this before starting work.

---
[2026-05-10 19:40] claude > all
Subject: MCP SDK requires Zod schemas, not plain objects
Detail: @modelcontextprotocol/sdk v1.29+ throws "expected a Zod schema or ToolAnnotations" if you pass plain {type: "string"} objects to server.tool(). Must use z.string(), z.coerce.number(), etc. Also use z.coerce for numbers/booleans since MCP tool arguments arrive as strings.
---

[2026-05-10 19:40] claude > all
Subject: Template literal escaping in code generators
Detail: When generating JS code that itself contains template literals (backticks), avoid nesting template literals in the generator. Use string concatenation with a tpl() helper instead. Triple-escaping (\\\`) causes literal backslashes in output.
---

[2026-05-10 19:40] claude > all
Subject: OpenAPI 3.x relative server URLs
Detail: Some specs (like Petstore 3.0) use relative server URLs like "/api/v3". When fetching a spec from a URL, resolve relative server URLs against the source URL origin. The parser attaches _sourceUrl to the spec for this purpose.
---

[2026-05-10 19:40] claude > all
Subject: Swagger 2.0 body params vs OpenAPI 3.x requestBody
Detail: In Swagger 2.0, request bodies are parameters with `in: "body"`. In OpenAPI 3.x, they're under `requestBody.content["application/json"].schema`. The parser handles both but filters body params out of the parameters array (they go to requestBody instead).
---

[2026-05-21 17:38] luisa > walid
Subject: Threat model + ADR-006 RFC opened (PR #1)
Detail: 20 threats across 6 layers, "Claude as victim" framing. Three-tier pipeline proposed (T0 static / T1 sandboxed AI / T2 spec gating + red-team). Single CLI `ay-api-gen audit` license-gated. Two Critical and several High threats have no current mitigation — see THREAT-MODEL.md §6. Six OQs blocking Acceptance.
Detail: Side note — CLAUDE.md mentions a pre-commit lock hook but `.git/hooks/pre-commit` doesn't exist and `.ay/locks/` is gitignored. Either implement or trim. (Auto-resolved 2026-05-24 by AY framework reinstall — `.claude/hooks/pre-commit-check.sh` now present.)
---

[2026-05-22 03:30] walid > luisa
Subject: RFC-006 responses on branch `rfc-responses-walid`
Detail: Concrete answers to OQ-1..OQ-6 + 6 threat-model OQs in docs/security/RFC-RESPONSES-walid.md. Sign-off contingent on S1-01..04 landing (T-ING-1 escape, truncate.js wire, settings namespace, description cap). I'll take all four. Two methodology nits, three ADR additions; none block Acceptance.
Detail: Grounded findings while reading code — T-RUN-1 confirmed: `mcp-generator.js:95` does `BASE_URL = process.env.API_BASE_URL || baseUrl` unconditionally. T-SET-1 confirmed: `settings-injector.js:42` silent overwrite. T-RUN-3 confirmed: no description cap anywhere.
---

[2026-05-24 03:00] claude > all
Subject: AY framework reinstalled; tracking files deep-filled
Detail: `npm install ay-framework@1.1.0` (via /tmp); `node ./bin/install.js --local --yes`. Existing `.ay/tracking/*.md` content preserved and expanded. State now reflects post-RFC reality (S1 sprint defined, ADRs 007–012 proposed, blockers updated). New files: `.ay/PRODUCT.md`, `.ay/ROADMAP.md`, `.ay/RISKS.md`, `.ay/OPPORTUNITIES.md`, `.ay/LAUNCH-CHECKLIST.md`, `.ay/SHIP-CHECKLIST.md`, full `tasks/` set for S1.
Detail: Read this before starting S1 work — every S1 task has a corresponding `.ay/tasks/<id>.md` with file-line-level precision on what to change. Acceptance criteria match what Luisa needs to flip ADR-006 to Accepted.
---
