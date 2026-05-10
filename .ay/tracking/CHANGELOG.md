# Changelog

## [0.1.0] - 2026-05-10

### Added
- OpenAPI parser: Swagger 2.0 + OpenAPI 3.0/3.1, $ref resolution, path-level params
- MCP server generator with Zod schemas and auto-registration in Claude Code
- CLI generator with zero-dep arg parsing, one command per endpoint
- Runtime MCP server: `ay-api-gen serve <spec>` — no codegen needed
- Runtime CLI: `ay-api-gen run <spec> <resource> <action>` — direct API calls
- Auth detection: OAuth2 (all flows), HTTP Bearer, HTTP Basic, API Key (header/query/cookie)
- .env.example generator with auth-specific env vars and scope docs
- Spec validator with warnings for missing fields
- API registry: `list`, `remove`, `regen` commands
- Reverse generator: MCP tools -> OpenAPI 3.0 spec
- Settings injector: auto-registers MCP servers in .claude/settings.local.json
- Auto-installs dependencies in output directory for standalone use
- Tool name derivation: camelCase operationId -> snake_case, smart singularization
- Relative server URL resolution for OpenAPI 3.x specs
- GitHub Actions: CI (Node 20+22), NPM release, weekly API regen
- Docker: multi-stage Dockerfile, docker-compose for multi-API setup
- Fly.io deploy config
- Documentation: ARCHITECTURE.md, PRIMITIVES.md, PATTERNS.md, DEPLOYMENT.md
- 29 passing tests covering parser, generators, reverse, edge cases
