# Changelog

## [Unreleased] — security baseline (target v0.2.0)

### Added (S1 sprint, landed 2026-07-25)
- Fixed T-ING-1: `info.title`/`info.description` now escaped before JSDoc interpolation in both `mcp-generator.js` and `cli-generator.js` (`safeCommentLine()`). Also fixed a second, previously-undocumented injection in `cli-generator.js`'s generated `printHelp()` — raw title text could break out of a generated template literal via backtick/`${}` (`safeTemplateText()`).
- Wired `truncate.js` into the runtime server and the generated server (T-RUN-4 / T-RUN-6) via new `asMcpContent()` — every tool response is now capped and wrapped in `--- begin/end API response (untrusted) ---` boundary markers. Fixed a latent crash bug in `truncateResponse()`'s oversized-object path (invalid-JSON reconstruction) uncovered while wiring this in.
- Settings collision policy + `ay-api-gen:` namespace prefix (T-SET-1) — `settings-injector.js` now refuses to shadow entries from other tools without `--force`.
- 500-char cap + untrusted-source marker on tool/param descriptions (T-RUN-3) — new `src/desc-sanitize.js`.
- Same-host base URL refinement default (T-RUN-1) + private-IP/metadata deny-list (T-ING-2) — new `src/url-guard.js` (`resolveBaseUrl()`, `assertHostAllowed()`). Fixed an IPv6-bracket bug that let `assertHostAllowed` silently skip IPv6 literals.
- `spec-linter.js` warn-only baseline (T-API-1 unauth-mutating, T-API-2 sensitive-path-param) — new `src/spec-linter.js`, `--mode=b`/`--accept-risks` flags on `bin/ay-api-gen.js`.
- `## Security` section in README documenting all of the above.
- 38 new offline regression tests in `test/run.js` covering every S1 fix (no network required).

### Fixed (supply chain)
- `@modelcontextprotocol/sdk` pinned to exact `1.29.0` in both this package's `package.json` and the generated-output `package.json` template (was `^1.12.1`, unpinned). Added `.npmrc` with `save-exact=true`.

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
