# Best Practices & Patterns

## OpenAPI → MCP: The Core Insight

Every OpenAPI endpoint maps directly to an MCP tool:

```
HTTP Endpoint              MCP Tool
───────────────            ─────────
GET    /users              list_users        (read collection)
POST   /users              create_users      (create item)
GET    /users/{id}         get_user          (read item)
PUT    /users/{id}         update_user       (replace item)
PATCH  /users/{id}         patch_user        (partial update)
DELETE /users/{id}         delete_user       (remove item)
```

Parameters map directly to tool input:
- Path params → required string inputs
- Query params → optional inputs with types
- Request body properties → additional inputs
- Header params → handled via env vars (never exposed as tool inputs)

## Auth Best Practices

### Never expose auth in tool inputs

Auth is handled via environment variables, not tool parameters. The generated code reads from env:

```
API_KEY              → Bearer token or API key header
API_BEARER_TOKEN     → Explicit bearer token
API_USERNAME/PASSWORD → Basic auth
OAUTH_ACCESS_TOKEN   → OAuth2 pre-obtained token
OAUTH_CLIENT_ID/SECRET → OAuth2 client credentials flow
```

### Per-API env files

Each generated API gets its own `.env.example`. Copy to `.env` and fill in:

```bash
cp .ay/apis/stripe/.env.example .ay/apis/stripe/.env
```

### OAuth2: prefer access tokens over client credentials

For MCP servers, pre-obtained access tokens are simpler than client credentials flow. Use `OAUTH_ACCESS_TOKEN` when possible.

## Tool Naming Conventions

### Use operationId when available

If the spec has `operationId`, it's converted to snake_case: `getUserById` → `get_user_by_id`.

### Derived names for specs without operationId

The deriver uses HTTP method + path:
- Method determines the verb: GET→list/get, POST→create, PUT→update, DELETE→delete
- Last path segment determines the noun
- `{param}` after a resource = singular operation (get/update/delete)
- No param after resource = collection operation (list/create)

### Nested resources include parent

```
/users/{id}/posts         → list_user_posts
/users/{id}/posts/{id}    → get_user_post
/orgs/{id}/teams/{id}/members → list_org_team_members
```

## Schema Mapping

### OpenAPI types → Zod types

```
string              → z.string()
integer, number     → z.coerce.number()      (coerce handles string→number)
boolean             → z.coerce.boolean()
array               → z.array(z.any())
enum                → z.enum(["a", "b", "c"])
```

`z.coerce` is used because MCP tool arguments often arrive as strings.

### $ref resolution

The parser resolves `$ref` to `#/components/schemas/X` and `#/definitions/X` (Swagger 2.0). Nested $refs in properties and array items are also resolved.

Limitation: only single-level $ref chains. Deep recursive $refs (schema A → B → C) resolve the first level only.

## Runtime vs Generate: When to Use Which

### Use Runtime (`serve`) when:
- Prototyping or testing an API quickly
- The spec URL is stable and always available
- You don't need to customize the generated code
- You want zero maintenance

### Use Generate when:
- You need to customize the MCP server behavior
- The spec is behind auth and can't be fetched at runtime
- You want to commit generated code for reproducibility
- You need offline / air-gapped operation
- You want to add response transforms or caching

## Multi-API Setup

Register multiple APIs — each gets its own MCP server:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "node",
      "args": [".ay/apis/stripe/mcp-server.js"],
      "env": { "API_KEY": "sk_test_..." }
    },
    "github": {
      "command": "node",
      "args": [".ay/apis/github/mcp-server.js"],
      "env": { "API_KEY": "ghp_..." }
    }
  }
}
```

Or use runtime mode for both:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "node",
      "args": ["node_modules/ay-api-gen/src/runtime/mcp-server.js", "./specs/stripe.json"],
      "env": { "API_KEY": "sk_test_..." }
    }
  }
}
```

## Error Handling

Generated MCP servers return errors as tool content (never throw):

```json
{
  "content": [{
    "type": "text",
    "text": "{ \"error\": true, \"status\": 404, \"body\": { \"message\": \"Not found\" } }"
  }]
}
```

This lets Claude Code see the error and decide how to handle it.

## Performance Considerations

- **Spec parsing**: Done once at startup (< 100ms for typical specs)
- **Tool registration**: All tools registered synchronously before server connects
- **API calls**: Direct fetch with no middleware overhead
- **Memory**: Each MCP server process holds the parsed spec in memory (~50KB for Petstore)

## Extending: Adding Custom Middleware

For the runtime MCP server, modify `callApi()` to add:

```js
// Request logging
console.error(`[${method}] ${url}`);

// Response caching
const cacheKey = `${method}:${url}`;
if (cache.has(cacheKey)) return cache.get(cacheKey);

// Rate limiting
await rateLimiter.wait();

// Response transforms
const result = await originalCallApi(...);
return transformResponse(result);
```

## Reverse Engineering: MCP → OpenAPI

The reverse generator is best-effort. It works well for:
- Tools generated by ay-api-gen (roundtrip preserves structure)
- Simple CRUD tools with clear naming

It struggles with:
- Tools with non-standard names (can't infer HTTP method)
- Complex nested paths (information lost in tool name)
- Response schemas (MCP tools don't declare output schemas)
