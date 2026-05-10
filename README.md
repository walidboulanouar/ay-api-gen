# ay-api-gen

Turn any OpenAPI spec into MCP tools for Claude Code — instantly.

```bash
npx ay-api-gen https://petstore.swagger.io/v2/swagger.json
```

That's it. Your API is now available as MCP tools in Claude Code. Restart Claude Code and start using them.

## What it does

Takes any OpenAPI/Swagger spec (URL or local file) and generates:

1. **MCP server** — one tool per endpoint, auto-registered in Claude Code
2. **CLI tool** — one command per endpoint, callable from bash
3. **.env.example** — auth config with the right env vars for that API

Also supports the reverse: read MCP tool definitions and generate an OpenAPI spec from them.

## Quick Start

### Runtime mode (zero files, instant)

Start an MCP server directly from any spec — no code generation:

```bash
# Start MCP server (add to Claude Code settings.json)
ay-api-gen serve https://petstore.swagger.io/v2/swagger.json

# Call an API endpoint directly
ay-api-gen run https://petstore.swagger.io/v2/swagger.json inventory list
ay-api-gen run https://petstore.swagger.io/v2/swagger.json pet get --petId 1
```

Add to `.claude/settings.json` for persistent use:

```json
{
  "mcpServers": {
    "petstore": {
      "command": "npx",
      "args": ["ay-api-gen", "serve", "https://petstore.swagger.io/v2/swagger.json"],
      "env": { "API_KEY": "your-key" }
    }
  }
}
```

### Generate mode (static files, customizable)

```bash
# Generate MCP server + CLI + .env.example
ay-api-gen https://api.example.com/openapi.json

# Generate with custom name and output dir
ay-api-gen ./my-api.json --name my-api --output ./generated
```

Output:

```
.ay/apis/my-api/
├── mcp-server.js      # Standalone MCP server
├── cli.js             # CLI tool
├── .env.example       # Auth env vars
├── endpoints.json     # Parsed endpoint data
├── config.json        # For regeneration
└── package.json       # Dependencies (auto-installed)
```

## How it maps

Every OpenAPI endpoint becomes an MCP tool:

```
HTTP Endpoint              MCP Tool           CLI Command
─────────────              ─────────          ───────────
GET    /users              list_users         users list
POST   /users              create_users       users create
GET    /users/{id}         get_user           users get --id 123
PUT    /users/{id}         update_user        users update --id 123
DELETE /users/{id}         delete_user        users delete --id 123
```

Nested resources work too:

```
GET /users/{id}/posts              → list_user_posts
GET /users/{id}/posts/{id}/comments → list_user_post_comments
```

## Auth detection

ay-api-gen reads security schemes from the spec and generates the right auth code:

| Auth Type | Detected From | Env Var |
|-----------|--------------|---------|
| Bearer token | `type: http, scheme: bearer` | `API_BEARER_TOKEN` |
| Basic auth | `type: http, scheme: basic` | `API_USERNAME` + `API_PASSWORD` |
| API Key (header) | `type: apiKey, in: header` | `API_KEY` |
| API Key (query) | `type: apiKey, in: query` | `API_KEY` |
| OAuth2 | `type: oauth2` (all flows) | `OAUTH_ACCESS_TOKEN` or `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_SECRET` |

The generated `.env.example` tells you exactly what to set:

```bash
# Swagger Petstore — Environment Configuration
# API Key — sent as header: api_key
API_KEY=your-api-key-here

# OAuth2 Authentication (flows: implicit)
OAUTH_ACCESS_TOKEN=your-access-token-here
# Available scopes:
#   read:pets — read your pets
#   write:pets — modify pets in your account
```

## All commands

```bash
# Generate
ay-api-gen <spec-url-or-file> [options]     # OpenAPI → MCP + CLI
ay-api-gen --from-mcp <file> [options]      # Reverse: MCP → OpenAPI

# Runtime (no codegen)
ay-api-gen serve <spec>                     # Start MCP server directly
ay-api-gen run <spec> <resource> <action>   # Call API directly

# Manage
ay-api-gen list                             # List all generated APIs
ay-api-gen remove <name>                    # Remove from registry
ay-api-gen regen [name|--all]               # Regenerate from saved config
```

### Options

```
--output, -o <dir>   Output directory (default: .ay/apis/<name>/)
--name, -n <name>    API name override
--no-settings        Skip auto-registering in Claude Code settings.json
--from-mcp <file>    Read MCP tools from settings.json or server file
--all                Regenerate all APIs (with regen)
--help, -h           Show help
```

## Supported specs

- Swagger 2.0 (JSON)
- OpenAPI 3.0.x (JSON)
- OpenAPI 3.1.x (JSON)

YAML specs: convert first with `npx js-yaml spec.yaml > spec.json`.

## Multi-API setup

Register multiple APIs — each gets its own MCP server:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["ay-api-gen", "serve", "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json"],
      "env": { "API_KEY": "sk_test_..." }
    },
    "github": {
      "command": "npx",
      "args": ["ay-api-gen", "serve", "./specs/github.json"],
      "env": { "API_KEY": "ghp_..." }
    }
  }
}
```

## Deploy

### Docker

```bash
docker build -t ay-api-gen .
docker run -i -e API_KEY=sk-... ay-api-gen https://api.example.com/openapi.json
```

### GitHub Actions (auto-regen)

Included workflow at `.github/workflows/regen-apis.yml` runs weekly to regenerate all APIs from their saved specs and auto-commits changes.

### Fly.io

```bash
fly launch --name ay-api-gen
fly secrets set API_KEY=your-key
fly deploy
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for all 8 deployment patterns.

## Programmatic API

```js
import {
  loadSpec,
  extractEndpoints,
  generateMCPServer,
  generateCLI,
  generateOpenAPIFromTools,
} from "ay-api-gen";

const spec = await loadSpec("https://api.example.com/openapi.json");
const parsed = extractEndpoints(spec);

// Generate MCP server source code
const mcpSource = generateMCPServer(parsed, { name: "my-api" });

// Generate CLI source code
const cliSource = generateCLI(parsed, { name: "my-api" });

// Filter endpoints before generating
parsed.endpoints = parsed.endpoints.filter(e => e.method === "GET");
const readOnlyMcp = generateMCPServer(parsed, { name: "read-only" });

// Reverse: MCP tools → OpenAPI
import { readMCPTools, generateOpenAPIFromTools } from "ay-api-gen";
const { tools } = readMCPTools("mcp-server.js");
const openApiSpec = generateOpenAPIFromTools(tools);
```

## Architecture

```
src/
├── parser.js            # OpenAPI 2.0/3.x parser, $ref resolution
├── validator.js         # Spec validation
├── auth-codegen.js      # Auth code generation (OAuth2, Bearer, Basic, API Key)
├── mcp-generator.js     # Static MCP server code generator
├── cli-generator.js     # Static CLI code generator
├── env-generator.js     # .env.example generator
├── settings-injector.js # Claude Code settings.json manager
├── registry.js          # API registry (list/remove/regen)
├── reverse.js           # MCP tools → OpenAPI spec
├── runtime/
│   ├── mcp-server.js    # Runtime MCP server (no codegen)
│   └── cli.js           # Runtime CLI (no codegen)
└── index.js             # Public API exports
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PRIMITIVES.md](docs/PRIMITIVES.md), and [docs/PATTERNS.md](docs/PATTERNS.md) for full documentation.

## License

MIT
