# Changelog

All notable changes to this project are documented here, in [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. This is the curated, user-facing summary — what changed and why it matters to someone using `ay-api-gen`. For the full engineering trail (per-threat-ID detail, verification commands, session-by-session history), see [`.ay/tracking/CHANGELOG.md`](.ay/tracking/CHANGELOG.md) and [`PROGRESS-LOG.md`](PROGRESS-LOG.md).

## [Unreleased]

Not yet published to npm — see [`HUMAN-SETUP-NEEDED.md`](HUMAN-SETUP-NEEDED.md) for what's blocking that (a product-naming decision, not a code gap).

### Added
- OpenAPI 3.1 support: `nullable` (both the 3.1 `type` array form and 3.0's legacy `nullable: true`), `components.pathItems` and `webhooks` `$ref` resolution. Webhooks are parsed but intentionally not exposed as callable tools (they describe inbound calls, the reverse of everything else this tool generates).
- `ay-api-gen serve --transport http` — an HTTP-reachable alternative to stdio, defaulting to `127.0.0.1`-only binding with a loud, explicit warning required to bind more broadly.
- `ay-api-gen audit --baseline <spec>` — free, local, no-signup static security lint of a spec, with `--mode=b`/`--accept-risks` to block generation on high-severity findings.
- Response caching (`AY_CACHE_TTL_MS`) and per-host rate limiting (`AY_RATE_LIMIT_RPS`) in the runtime MCP server, both opt-in.
- YAML spec support backed by the real `yaml` package (previously a hand-rolled parser) — anchors/aliases and block scalars now work correctly.
- `GAP-ANALYSIS.md` — a public-research competitive analysis against 5 real OpenAPI→MCP tools in the category.

### Security
- Spec-derived text (`info.title`, descriptions, parameter names) is now escaped before landing in generated code — closes a code-injection path in both the MCP server and CLI generators.
- Tool and parameter descriptions reaching an LLM's context are capped, sanitized, and marked as untrusted; API response bodies are truncated and boundary-marked the same way.
- Same-host-only base URL resolution by default, plus a private-IP/cloud-metadata deny-list, to stop SSRF via a malicious or rebound base URL.
- Static spec linting for unauthenticated mutating endpoints, sensitive identifiers in path/query params, mass-assignment-prone request fields, weak or missing auth schemes, and undeclared rate limits.
- Path-traversal protection on `--output` and `--name`; namespaced, collision-safe settings registration; advisory file locking on concurrent writes to the local API registry.
- A 25MB size cap on any spec (fetched or local) to prevent memory-exhaustion from an oversized or malicious spec.
- All dependency versions exact-pinned, including in generated output.

### Fixed
- A latent crash in the response-truncation path for oversized single-object payloads.
- An IPv6-literal bug that let the private-IP SSRF guard be silently bypassed.
- A dead interactive confirmation prompt in the settings injector that never actually ran.

## [0.1.1] — 2026-05-11

### Added
- `ay-api-gen doctor` — health check for all registered APIs.
- `ay-api-gen init` — interactive setup wizard.
- `ay-api-gen discover <domain>` — auto-locate an OpenAPI/Swagger spec on a domain.
- `ay-api-gen diff <old> <new>` — compare two spec versions.
- Tool filtering (`--only` / `--exclude`) and smart pruning (`--slim`) for token budget control.
- YAML spec support (initial, hand-rolled parser — later replaced, see Unreleased).

### Fixed
- Duplicate tool names when a spec has duplicate path/method combinations.

## [0.1.0] — 2026-05-10

### Added
- Initial release: OpenAPI (Swagger 2.0 + OpenAPI 3.0/3.1) parser with `$ref` resolution.
- MCP server generator (Zod-validated schemas) and CLI generator, both from the same parsed spec.
- Runtime modes (`serve`, `run`) — no code generation required.
- Auth detection and codegen for OAuth2, HTTP Bearer, HTTP Basic, and API Key schemes.
- Reverse generator: MCP tool definitions → OpenAPI spec.
- API registry (`list`, `remove`, `regen`) and auto-registration in Claude Code's settings.
