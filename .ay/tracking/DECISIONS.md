# Architecture Decision Records

[ADR-001] Runtime vs Generate — Two-Mode Architecture
Context: Users need both quick prototyping (no files) and customizable output (static files).
Decision: Support both modes — `serve` for runtime, default for codegen.
Rationale: Runtime is zero-friction for testing. Generate is needed for standalone deployment, customization, and offline use.
Alternatives: Generate-only (Speakeasy approach), Runtime-only (Gram approach).
Date: 2026-05-10

[ADR-002] Zod for MCP Tool Schemas
Context: MCP SDK v1.29 requires Zod schemas for tool input validation, not plain JSON Schema objects.
Decision: Generate `z.coerce.number()` / `z.coerce.boolean()` / `z.string()` for all param types.
Rationale: `z.coerce` handles string→number conversion since MCP tool arguments arrive as strings.
Alternatives: Plain JSON Schema (doesn't work with SDK), custom validation (unnecessary).
Date: 2026-05-10

[ADR-003] Auth Code via String Concatenation
Context: Template literal escaping for backticks in generated auth code caused syntax errors.
Decision: Use line-by-line string concatenation in auth-codegen.js with a `tpl()` helper for backtick template strings.
Rationale: Avoids triple-escape hell when generating JS that contains template literals inside template literals.
Alternatives: Heredoc strings (not available in ESM), external template files (extra complexity).
Date: 2026-05-10

[ADR-004] Auto-Install Dependencies in Output
Context: Generated MCP servers import `@modelcontextprotocol/sdk` and `zod`, which need to be installed.
Decision: Generate a `package.json` in output dir and run `npm install --production` automatically.
Rationale: Standalone usage from any directory must work without manual setup.
Alternatives: Bundle deps inline (too large), require project-level install (breaks standalone).
Date: 2026-05-10

[ADR-005] Security Scheme Detection from Spec
Context: OpenAPI specs define auth via `securityDefinitions` (2.0) and `components.securitySchemes` (3.x).
Decision: Parse all schemes, generate auth code specific to detected types, generate `.env.example` per scheme.
Rationale: Users shouldn't have to manually figure out what auth an API needs.
Alternatives: Always use generic Bearer auth (misses API key in query, Basic, OAuth2 flows).
Date: 2026-05-10
