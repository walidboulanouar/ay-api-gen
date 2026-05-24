# Changelog

## [Unreleased] — security baseline (target v0.2.0)

### Planned (S1 sprint, 2026-05-24 → 2026-06-07)
- Fix T-ING-1 (`info.title` JSDoc escape) — `mcp-generator.js:78-82`
- Wire `truncate.js` into runtime + generated server (T-RUN-4 / T-RUN-6)
- Settings collision policy + `ay-api-gen:` namespace prefix (T-SET-1) — `settings-injector.js:42`
- 500-char cap + boundary marker on tool descriptions (T-RUN-3)
- Same-host base URL refinement default (T-RUN-1 / T-ING-2) — `mcp-generator.js:95`
- Private-IP deny-list at DNS resolution
- `spec-linter.js` warn-only (T-API-1, T-API-2)

## [0.1.1] — 2026-05-11

### Added (source landed, integration tests pending)
- `ay-api-gen doctor` — health check all registered APIs (`src/doctor.js`)
- `ay-api-gen init` — interactive wizard (`src/init-wizard.js`)
- `ay-api-gen discover <domain>` — auto-find spec at common paths (`src/discover.js`)
- `ay-api-gen diff <old> <new>` — spec diff (`src/diff.js`)
- Tool filtering `--only` / `--exclude` (`src/filter.js`)
- Response truncation module (`src/truncate.js`) — **not yet wired into runtime path**
- Smart tool pruning `--slim` for token budget (`src/slim.js`)
- YAML spec support via custom parser (`src/yaml-parser.js`)
- SETUP-REQUIREMENTS.html — visual setup checklist
- STANDING.html — project status report

### Fixed
- Deduplicate tool names when spec has duplicate path/method combos (0e866b5)

### Security (documented, not yet mitigated)
- Threat model published — 20 threats across 6 layers (Luisa, 2026-05-21)
- ADR-006 RFC proposed — three-tier security pipeline
- ADR `Status:` field introduced; 001–005 marked Accepted

## [0.1.0] — 2026-05-10

### Added
- OpenAPI parser: Swagger 2.0 + OpenAPI 3.0/3.1, $ref resolution, path-level params
- MCP server generator with Zod schemas and auto-registration in Claude Code
- CLI generator with zero-dep arg parsing, one command per endpoint
- Runtime MCP server: `ay-api-gen serve <spec>` — no codegen needed
- Runtime CLI: `ay-api-gen run <spec> <resource> <action>` — direct API calls
- Auth detection: OAuth2 (all flows), HTTP Bearer, HTTP Basic, API Key (header/query/cookie)
- `.env.example` generator with auth-specific env vars and scope docs
- Spec validator with warnings for missing fields
- API registry: `list`, `remove`, `regen` commands
- Reverse generator: MCP tools → OpenAPI 3.0 spec
- Settings injector: auto-registers MCP servers in `.claude/settings.local.json`
- Auto-installs dependencies in output directory for standalone use
- Tool name derivation: camelCase operationId → snake_case, smart singularization
- Relative server URL resolution for OpenAPI 3.x specs
- GitHub Actions: CI (Node 20+22), NPM release, weekly API regen
- Docker: multi-stage Dockerfile, docker-compose for multi-API setup
- Fly.io deploy config
- Documentation: ARCHITECTURE.md, PRIMITIVES.md, PATTERNS.md, DEPLOYMENT.md
- 29 passing tests covering parser, generators, reverse, edge cases
