# Architecture

ay-api-gen has two modes: **runtime** (zero codegen) and **generate** (static output).

## Two Modes

### Runtime Mode (recommended for most use cases)

```
OpenAPI Spec (URL/file)
        |
        v
  ┌─────────────┐
  │   parser.js  │  Parse spec at startup
  └──────┬───────┘
         |
    ┌────┴────┐
    v         v
┌────────┐ ┌──────┐
│ MCP    │ │ CLI  │   Register tools/commands dynamically
│ Server │ │      │   from parsed endpoints
└────────┘ └──────┘
```

- `ay-api-gen serve <spec>` — starts MCP server, reads spec, registers tools
- `ay-api-gen run <spec> <resource> <action>` — direct API call
- No files generated. No node_modules needed in output.
- Add to settings.json directly:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["node_modules/ay-api-gen/src/runtime/mcp-server.js", "https://api.example.com/openapi.json"],
      "env": { "API_KEY": "sk-..." }
    }
  }
}
```

### Generate Mode (for customization/standalone deployment)

```
OpenAPI Spec (URL/file)
        |
        v
  ┌─────────────┐
  │   parser.js  │
  └──────┬───────┘
         |
    ┌────┼────────┬──────────┬──────────┐
    v    v        v          v          v
  MCP   CLI   .env.example  config    package.json
  .js   .js                 .json     + npm install
```

- `ay-api-gen <spec>` — generates static files, auto-registers MCP, auto-installs deps
- Output is standalone — can be committed, deployed, customized
- `ay-api-gen regen --all` — re-generates from saved config

## Module Map

```
src/
├── parser.js            # OpenAPI 2.0/3.x parser
│                         - loadSpec(url|path) -> JSON
│                         - extractEndpoints(spec) -> { baseUrl, endpoints, securitySchemes }
│                         - deriveToolName(method, path) -> snake_case name
│                         - $ref resolution, singularization
│
├── validator.js          # Spec validation before generation
│                         - validateSpec(spec) -> { valid, errors, warnings }
│
├── auth-codegen.js       # Auth code generator (shared by MCP + CLI generators)
│                         - Detects: OAuth2, Bearer, Basic, API Key (header/query/cookie)
│                         - Generates correct auth code per detected scheme
│
├── mcp-generator.js      # Static MCP server code generator
│                         - generateMCPServer(parsed, opts) -> JS source string
│                         - Uses Zod schemas for tool input validation
│
├── cli-generator.js      # Static CLI code generator
│                         - generateCLI(parsed, opts) -> JS source string
│
├── env-generator.js      # .env.example generator
│                         - Auth-aware, includes scopes and token URLs
│
├── settings-injector.js  # Claude Code settings.json manager
│                         - Auto-registers MCP servers
│
├── registry.js           # API registry (.ay/apis/registry.json)
│                         - Track, list, remove, regen APIs
│
├── reverse.js            # MCP tools -> OpenAPI spec (reverse direction)
│
├── runtime/
│   ├── mcp-server.js     # Runtime MCP server (no codegen)
│   └── cli.js            # Runtime CLI (no codegen)
│
└── index.js              # Public API exports
```

## Data Flow

```
User Input (URL or file path)
    │
    ├─ loadSpec() ──────────────── Fetch/read JSON
    │
    ├─ validateSpec() ─────────── Check required fields, warn about issues
    │
    ├─ extractEndpoints() ─────── Parse paths, methods, params, $ref, security
    │    │
    │    ├─ extractSecuritySchemes() ── OAuth2 flows, API keys, Bearer, Basic
    │    │
    │    └─ deriveToolName() ───── GET /pets/{id} -> get_pet
    │
    ├─ [generate mode]
    │    ├─ generateMCPServer() ── Static MCP server with Zod schemas
    │    ├─ generateCLI() ──────── Static CLI with arg parsing
    │    ├─ generateEnvExample() ─ Auth-specific .env template
    │    ├─ injectSettings() ───── Register in settings.json
    │    └─ registerAPI() ──────── Save to registry for regen
    │
    └─ [runtime mode]
         ├─ mcp-server.js ──────── Dynamic tool registration at startup
         └─ cli.js ─────────────── Dynamic command routing at startup
```

## Extension Points

1. **Custom auth**: Add new auth types in `auth-codegen.js` and `runtime/mcp-server.js`
2. **Custom tool naming**: Override `deriveToolName()` in parser.js
3. **Pre/post hooks**: Add middleware in the runtime MCP server's `callApi()`
4. **Response transforms**: Modify the tool handler in `mcp-server.js` to format responses
5. **Multi-spec**: Register multiple APIs by running generate/serve multiple times
