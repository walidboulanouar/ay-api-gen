# Primitives

Core building blocks of ay-api-gen. Each primitive is independent and composable.

## 1. Spec Loader

**What**: Fetches and parses OpenAPI/Swagger specs from URL or file.

```js
import { loadSpec } from "ay-api-gen";
const spec = await loadSpec("https://api.example.com/openapi.json");
// or
const spec = await loadSpec("./local-spec.json");
```

**Handles**: HTTP fetch, local file read, JSON parsing, source URL tracking for relative server resolution.

**Does NOT handle**: YAML (convert first), authentication for fetching private specs.

## 2. Endpoint Extractor

**What**: Extracts all API endpoints from a parsed spec into a normalized format.

```js
import { extractEndpoints } from "ay-api-gen";
const { baseUrl, endpoints, securitySchemes, info } = extractEndpoints(spec);
```

**Each endpoint contains**:
- `path`, `method`, `toolName`, `cliCommand`
- `summary`, `description`
- `parameters[]` (path, query — headers excluded)
- `requestBody` (resolved from $ref)
- `responseSchema`
- `security[]`
- `tags[]`, `operationId`

**Key behaviors**:
- Resolves `$ref` to `#/components/schemas/...` and `#/definitions/...`
- Inherits shared path-level parameters
- Derives tool names: `GET /users/{id}` → `get_user`
- Derives CLI commands: resource=`users`, action=`get`
- Singularizes correctly: deliveries→delivery, statuses→status
- Converts camelCase operationIds: `listUsers` → `list_users`

## 3. Security Scheme Extractor

**What**: Normalizes security definitions from both Swagger 2.0 and OpenAPI 3.x.

**Detects**:
| Type | Swagger 2.0 | OpenAPI 3.x |
|------|------------|-------------|
| API Key (header) | `securityDefinitions.X.type: "apiKey", in: "header"` | `components.securitySchemes.X.type: "apiKey"` |
| API Key (query) | Same, `in: "query"` | Same |
| Bearer | N/A | `type: "http", scheme: "bearer"` |
| Basic | `type: "basic"` | `type: "http", scheme: "basic"` |
| OAuth2 | `type: "oauth2", flow: "implicit"` | `type: "oauth2", flows: { clientCredentials: {...} }` |

**Output**: Normalized map with `type`, `scheme`, `in`, `paramName`, `flows`, `tokenUrl`, `scopes`.

## 4. Tool Name Deriver

**What**: Maps HTTP method + path to a readable snake_case tool name.

```
GET    /pets              → list_pets
POST   /pets              → create_pets
GET    /pets/{petId}      → get_pet
PUT    /pets/{petId}      → update_pet
DELETE /pets/{petId}      → delete_pet
PATCH  /pets/{petId}      → patch_pet
GET    /users/{id}/posts  → list_user_posts
POST   /webhooks/{id}/deliveries/{id}/redeliver → create_webhook_delivery_redeliver
```

**Rules**:
- Collection (no trailing param): `list_` prefix for GET, `create_` for POST
- Item (followed by `{param}`): `get_` for GET, `update_` for PUT, `delete_` for DELETE
- Parents always singularized
- Hyphens → underscores, special chars stripped

## 5. Auth Code Generator

**What**: Generates JavaScript auth code based on detected security schemes.

```js
import { generateAuthCode } from "ay-api-gen";
const jsCode = generateAuthCode(securitySchemes);
// Returns valid JS: getAuthHeaders() + getAuthQueryParams() functions
```

**Generates**:
- `getAuthHeaders()` — reads env vars, returns headers object
- `getAuthQueryParams()` — returns query params for API-key-in-query auth
- OAuth2 token refresh with caching (`getOAuthToken()`)
- Comments documenting which env vars to set

## 6. MCP Server Generator

**What**: Generates a standalone MCP server file.

```js
import { generateMCPServer } from "ay-api-gen";
const source = generateMCPServer(parsed, { name: "my-api" });
writeFileSync("mcp-server.js", source);
```

**Generated server**:
- Uses `@modelcontextprotocol/sdk` with `StdioServerTransport`
- Each endpoint → one `server.tool()` with Zod input schema
- `.env` auto-loading
- Auth-aware headers and query params
- URL builder with path param substitution

## 7. CLI Generator

**What**: Generates a standalone CLI tool.

```js
import { generateCLI } from "ay-api-gen";
const source = generateCLI(parsed, { name: "my-api" });
```

**Generated CLI**:
- Zero external dependencies
- `ay-<name> <resource> <action> [--param value]`
- Built-in `--help` with all resources, actions, and descriptions
- `.env` auto-loading

## 8. Settings Injector

**What**: Registers MCP servers in Claude Code's settings.json.

```js
import { injectSettings } from "ay-api-gen";
injectSettings("/path/to/mcp-server.js", "my-api");
```

**Behavior**: Creates or updates `.claude/settings.local.json`, adds the MCP server config.

## 9. Reverse Generator

**What**: Reads MCP tool definitions and generates an OpenAPI spec.

```js
import { readMCPTools, generateOpenAPIFromTools } from "ay-api-gen";
const { tools } = readMCPTools("mcp-server.js");
const spec = generateOpenAPIFromTools(tools, { title: "My API" });
```

**Infers**: HTTP method from tool name prefix (`list_` → GET, `create_` → POST), path from resource segments, parameters from input schema.

## 10. Runtime Server

**What**: MCP server that reads spec at startup, no codegen.

```json
{
  "mcpServers": {
    "any-api": {
      "command": "node",
      "args": ["node_modules/ay-api-gen/src/runtime/mcp-server.js", "https://api.example.com/spec.json"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

**Advantage**: Zero setup. Point at any OpenAPI spec and it becomes MCP tools instantly.

## Composability

These primitives compose:

```js
// Parse → filter → generate only what you need
const spec = await loadSpec(url);
const parsed = extractEndpoints(spec);

// Filter to only GET endpoints
parsed.endpoints = parsed.endpoints.filter(e => e.method === "GET");

// Generate MCP server with only read operations
const source = generateMCPServer(parsed, { name: "read-only-api" });
```

```js
// Multi-API: merge endpoints from multiple specs
const specs = await Promise.all(urls.map(loadSpec));
const allEndpoints = specs.flatMap(s => extractEndpoints(s).endpoints);
```
