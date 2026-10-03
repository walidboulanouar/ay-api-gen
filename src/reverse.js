/**
 * Reverse Generator.
 * Reads MCP tool definitions and generates an OpenAPI 3.0 spec from them.
 * Maps tool names back to HTTP methods and paths.
 */

import { readFileSync, existsSync } from "node:fs";

/**
 * Infer HTTP method and path from an MCP tool name.
 * list_pets -> GET /pets
 * create_pet -> POST /pets
 * get_pet -> GET /pets/{id}
 * update_pet -> PUT /pets/{id}
 * delete_pet -> DELETE /pets/{id}
 * patch_pet -> PATCH /pets/{id}
 */
function inferMethodAndPath(toolName) {
  const parts = toolName.split("_");
  const action = parts[0];
  const resource = parts.slice(1).join("_");

  // Pluralize resource for path
  const plural = resource.endsWith("s") ? resource : resource + "s";
  const pathBase = `/${plural.replace(/_/g, "/")}`;

  const methodMap = {
    list: { method: "GET", path: pathBase },
    get: { method: "GET", path: `${pathBase}/{id}` },
    create: { method: "POST", path: pathBase },
    update: { method: "PUT", path: `${pathBase}/{id}` },
    delete: { method: "DELETE", path: `${pathBase}/{id}` },
    patch: { method: "PATCH", path: `${pathBase}/{id}` },
  };

  return methodMap[action] || { method: "POST", path: `/${toolName.replace(/_/g, "/")}` };
}

/**
 * Convert MCP tool input schema to OpenAPI parameter/requestBody schemas.
 */
function toolToOpenAPIOperation(tool) {
  const { method, path } = inferMethodAndPath(tool.name);

  // Extract path parameters from path template
  const pathParamNames = (path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));

  const operation = {
    operationId: tool.name,
    summary: tool.description || tool.name,
    parameters: [],
  };

  const bodyProperties = {};
  const bodyRequired = [];

  if (tool.inputSchema?.properties) {
    for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
      if (pathParamNames.includes(key)) {
        // Path parameter
        operation.parameters.push({
          name: key,
          in: "path",
          required: true,
          schema: { type: schema.type || "string" },
          description: schema.description || "",
        });
      } else if (method === "GET" || method === "DELETE") {
        // Query parameter for GET/DELETE
        operation.parameters.push({
          name: key,
          in: "query",
          required: tool.inputSchema.required?.includes(key) || false,
          schema: { type: schema.type || "string" },
          description: schema.description || "",
        });
      } else {
        // Body property for POST/PUT/PATCH
        bodyProperties[key] = {
          type: schema.type || "string",
          description: schema.description || "",
        };
        if (tool.inputSchema.required?.includes(key)) {
          bodyRequired.push(key);
        }
      }
    }
  }

  // Add request body for non-GET methods
  if (Object.keys(bodyProperties).length > 0) {
    operation.requestBody = {
      required: bodyRequired.length > 0,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: bodyProperties,
            ...(bodyRequired.length > 0 ? { required: bodyRequired } : {}),
          },
        },
      },
    };
  }

  // Response
  operation.responses = {
    "200": {
      description: "Successful response",
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
  };

  return { method: method.toLowerCase(), path, operation };
}

/**
 * Read MCP tools from a server file by looking for server.tool() calls,
 * or from a settings.json mcpServers config.
 * @param {string} source - Path to settings.json or MCP server file
 * @returns {Array<object>} tool definitions
 */
export function readMCPTools(source) {
  if (!existsSync(source)) {
    throw new Error(`File not found: ${source}`);
  }

  const content = readFileSync(source, "utf-8");

  // Try parsing as settings.json
  try {
    const settings = JSON.parse(content);
    if (settings.mcpServers) {
      // Return info about discovered servers (tools must be read at runtime)
      return {
        type: "settings",
        servers: settings.mcpServers,
      };
    }
    // Maybe it's a raw tool definition array
    if (Array.isArray(settings)) {
      return { type: "tools", tools: settings };
    }
  } catch {
    // Not JSON — try extracting from source code
  }

  // Parse server.tool() calls from JS source. The second argument can be
  // EITHER a plain quoted string literal (a hand-written or third-party MCP
  // server) OR `safeDescription(<raw>, "tool") || "<fallback>"` — the shape
  // this project's OWN generator has emitted since the T-RUN-3 security fix
  // wrapped every tool description for prompt-injection sanitization. The
  // old plain-string-only pattern silently matched ZERO tools against any
  // file this tool itself generated (confirmed: readMCPTools() on a real
  // generateMCPServer() output returned an empty tools array) — the second
  // argument no longer starts with a quote character at all. The
  // alternation below extracts the original raw description from inside
  // safeDescription(...) when present, falling back to the plain-literal
  // form for non-generated input.
  const tools = [];
  const toolRegex = /server\.tool\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:safeDescription\(\s*["'`]([^"'`]*)["'`][\s\S]*?\)\s*\|\|\s*["'`][^"'`]*["'`]|["'`]([^"'`]+)["'`])\s*,\s*(\{[\s\S]*?\})\s*,/g;
  let match;

  while ((match = toolRegex.exec(content)) !== null) {
    const name = match[1];
    const description = match[2] ?? match[3];
    // Try to parse the schema object (best effort)
    let inputSchema = { type: "object", properties: {} };
    try {
      // Clean up the schema string for JSON parsing
      const schemaStr = match[4]
        .replace(/(\w+):/g, '"$1":')  // quote keys
        .replace(/'/g, '"')           // single to double quotes
        .replace(/,\s*}/g, "}")       // trailing commas
        .replace(/,\s*]/g, "]");
      inputSchema = JSON.parse(schemaStr);
    } catch {
      // Schema extraction failed, use empty
    }

    tools.push({ name, description, inputSchema });
  }

  return { type: "tools", tools };
}

/**
 * Generate OpenAPI 3.0 spec from MCP tool definitions.
 * @param {Array<object>} tools - Array of { name, description, inputSchema }
 * @param {object} options - { title, version, baseUrl }
 * @returns {object} OpenAPI spec object
 */
export function generateOpenAPIFromTools(tools, options = {}) {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: options.title || "API generated from MCP tools",
      version: options.version || "1.0.0",
      description: "Auto-generated from MCP tool definitions by ay-api-gen",
    },
    servers: [
      { url: options.baseUrl || "https://api.example.com" },
    ],
    paths: {},
  };

  for (const tool of tools) {
    const { method, path, operation } = toolToOpenAPIOperation(tool);

    if (!spec.paths[path]) {
      spec.paths[path] = {};
    }
    spec.paths[path][method] = operation;
  }

  return spec;
}
