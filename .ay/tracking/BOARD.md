# Pipeline Board

| # | Title | Agent | Status | Blocked By |
|---|-------|-------|--------|------------|
| 1 | OpenAPI parser (Swagger 2.0 + OpenAPI 3.x) | claude | DONE | - |
| 2 | MCP server generator (Zod schemas) | claude | DONE | - |
| 3 | CLI generator (zero-dep) | claude | DONE | - |
| 4 | Settings injector (auto-register in Claude Code) | claude | DONE | - |
| 5 | Reverse generator (MCP -> OpenAPI) | claude | DONE | - |
| 6 | Auth detection (OAuth2, Bearer, Basic, API Key) | claude | DONE | - |
| 7 | Runtime MCP server (no codegen) | claude | DONE | - |
| 8 | Runtime CLI (no codegen) | claude | DONE | - |
| 9 | .env.example generator | claude | DONE | - |
| 10 | Spec validator | claude | DONE | - |
| 11 | API registry (list/remove/regen) | claude | DONE | - |
| 12 | CI/CD workflows (GitHub Actions) | claude | DONE | - |
| 13 | Docker + deploy configs | claude | DONE | - |
| 14 | Documentation (ARCHITECTURE, PRIMITIVES, PATTERNS, DEPLOYMENT) | claude | DONE | - |
| 15 | Edge case testing + fixes | claude | DONE | - |
| 16 | Push to GitHub repo | claude | DONE | - |
| 17 | Publish to npm | claude | BLOCKED | npm login needed |
| 18 | YAML spec support | - | READY | - |
| 19 | OpenAPI 3.1 full support (webhooks, pathItems) | - | BACKLOG | - |
| 20 | HTTP-SSE transport for remote MCP servers | - | BACKLOG | - |
| 21 | Multi-spec merge (combine N specs into 1 MCP server) | - | BACKLOG | - |
| 22 | Tool filtering (--only/--exclude) | - | READY | - |
| 23 | Response caching in runtime MCP server | - | BACKLOG | - |
| 24 | Rate limiting in runtime MCP server | - | BACKLOG | - |
| 25 | ay-api-gen doctor (health check all APIs) | claude | IN PROGRESS | - |
| 26 | ay-api-gen init (interactive wizard) | - | READY | - |
| 27 | ay-api-gen discover <domain> (auto-find spec) | - | READY | - |
| 28 | ay-api-gen diff <old> <new> (spec diff) | - | READY | - |
| 29 | Response truncation (auto-trim large responses) | - | READY | - |
| 30 | Public API catalog (serve github, serve stripe) | - | BACKLOG | - |
| 31 | Smart tool pruning --slim (token budget) | - | BACKLOG | - |

Status values: BACKLOG, READY, IN PROGRESS, DONE, BLOCKED
