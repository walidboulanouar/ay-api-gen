# Agent Handoffs

Write gotchas, API discoveries, and decisions here.
Other agents read this before starting work.

---
[2026-05-10 19:40] claude > all
Subject: MCP SDK requires Zod schemas, not plain objects
Detail: @modelcontextprotocol/sdk v1.29+ throws "expected a Zod schema or ToolAnnotations" if you pass plain {type: "string"} objects to server.tool(). Must use z.string(), z.coerce.number(), etc. Also use z.coerce for numbers/booleans since MCP tool arguments arrive as strings.
---

[2026-05-10 19:40] claude > all
Subject: Template literal escaping in code generators
Detail: When generating JS code that itself contains template literals (backticks), avoid nesting template literals in the generator. Use string concatenation with a tpl() helper instead. Triple-escaping (\\\`) causes literal backslashes in output.
---

[2026-05-10 19:40] claude > all
Subject: OpenAPI 3.x relative server URLs
Detail: Some specs (like Petstore 3.0) use relative server URLs like "/api/v3". When fetching a spec from a URL, resolve relative server URLs against the source URL origin. The parser attaches _sourceUrl to the spec for this purpose.
---

[2026-05-10 19:40] claude > all
Subject: Swagger 2.0 body params vs OpenAPI 3.x requestBody
Detail: In Swagger 2.0, request bodies are parameters with `in: "body"`. In OpenAPI 3.x, they're under `requestBody.content["application/json"].schema`. The parser handles both but filters body params out of the parameters array (they go to requestBody instead).
---
