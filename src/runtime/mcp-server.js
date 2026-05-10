#!/usr/bin/env node

/**
 * Runtime MCP Server.
 *
 * No code generation — reads an OpenAPI spec at startup and
 * dynamically registers one MCP tool per endpoint.
 *
 * Usage (in .claude/settings.json):
 *   {
 *     "mcpServers": {
 *       "my-api": {
 *         "command": "node",
 *         "args": ["node_modules/ay-api-gen/src/runtime/mcp-server.js", "https://api.example.com/openapi.json"],
 *         "env": { "API_KEY": "..." }
 *       }
 *     }
 *   }
 *
 * Or from CLI:
 *   ay-api-gen serve https://petstore.swagger.io/v2/swagger.json
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpec, extractEndpoints } from "../parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── .env loader ──
function loadEnv() {
  for (const p of [resolve(process.cwd(), ".env"), resolve(__dirname, ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  }
}
loadEnv();

// ── Auth ──
function getAuthHeaders(securitySchemes) {
  const headers = { "Content-Type": "application/json" };
  const schemes = Object.values(securitySchemes || {});

  for (const s of schemes) {
    if (s.type === "http" && s.scheme === "bearer") {
      const token = process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    if (s.type === "http" && s.scheme === "basic") {
      if (process.env.API_USERNAME && process.env.API_PASSWORD) {
        const creds = Buffer.from(`${process.env.API_USERNAME}:${process.env.API_PASSWORD}`).toString("base64");
        headers["Authorization"] = `Basic ${creds}`;
      }
    }
    if (s.type === "apiKey" && s.in === "header") {
      if (process.env.API_KEY) headers[s.paramName] = process.env.API_KEY;
    }
    if (s.type === "apiKey" && s.in === "cookie") {
      if (process.env.API_KEY) headers["Cookie"] = `${s.paramName}=${process.env.API_KEY}`;
    }
    if (s.type === "oauth2") {
      if (process.env.OAUTH_ACCESS_TOKEN) headers["Authorization"] = `Bearer ${process.env.OAUTH_ACCESS_TOKEN}`;
    }
  }

  // Fallback
  if (!headers["Authorization"] && process.env.API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.API_KEY}`;
  }

  return headers;
}

function getAuthQueryParams(securitySchemes) {
  const params = {};
  for (const s of Object.values(securitySchemes || {})) {
    if (s.type === "apiKey" && s.in === "query" && process.env.API_KEY) {
      params[s.paramName] = process.env.API_KEY;
    }
  }
  return params;
}

// ── HTTP ──
function buildUrl(baseUrl, pathTemplate, params, authQuery) {
  let url = pathTemplate;
  const queryParts = [];

  for (const [k, v] of Object.entries(authQuery)) {
    queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (url.includes(`{${k}}`)) {
      url = url.replace(`{${k}}`, encodeURIComponent(v));
    } else {
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }

  const fullUrl = baseUrl.replace(/\/$/, "") + url;
  return queryParts.length > 0 ? `${fullUrl}?${queryParts.join("&")}` : fullUrl;
}

async function callApi(baseUrl, method, path, params, bodyParams, securitySchemes) {
  const authQuery = getAuthQueryParams(securitySchemes);
  const url = buildUrl(baseUrl, path, params, authQuery);
  const headers = getAuthHeaders(securitySchemes);

  const opts = { method, headers };
  if (bodyParams && Object.keys(bodyParams).length > 0 && method !== "GET" && method !== "HEAD") {
    opts.body = JSON.stringify(bodyParams);
  }

  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) return { error: true, status: res.status, statusText: res.statusText, body: data };
    return data;
  } catch (err) {
    return { error: true, message: err.message };
  }
}

// ── Zod schema builder ──
function zodForParam(param) {
  const type = param.schema?.type || "string";
  let schema;
  if (param.schema?.enum) {
    schema = z.enum(param.schema.enum);
  } else {
    switch (type) {
      case "integer": case "number": schema = z.coerce.number(); break;
      case "boolean": schema = z.coerce.boolean(); break;
      case "array": schema = z.array(z.any()); break;
      default: schema = z.string(); break;
    }
  }
  if (param.description) schema = schema.describe(param.description);
  if (!param.required) schema = schema.optional();
  return schema;
}

// ── Main ──
const specSource = process.argv[2];
if (!specSource) {
  console.error("Usage: mcp-server.js <openapi-spec-url-or-path>");
  process.exit(1);
}

const spec = await loadSpec(specSource);
const parsed = extractEndpoints(spec);
const { baseUrl, info, endpoints, securitySchemes } = parsed;

const apiName = process.env.MCP_SERVER_NAME ||
  info.title?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().replace(/-+/g, "-") ||
  "api";

const overrideBaseUrl = process.env.API_BASE_URL || baseUrl;

const server = new McpServer({
  name: apiName,
  version: info.version || "1.0.0",
});

// Register each endpoint as a tool
for (const ep of endpoints) {
  // Build Zod schema
  const schemaObj = {};
  for (const param of ep.parameters) {
    if (param.in === "header") continue;
    schemaObj[param.name] = zodForParam(param);
  }
  if (ep.requestBody?.schema?.properties) {
    for (const [key, val] of Object.entries(ep.requestBody.schema.properties)) {
      const isRequired = ep.requestBody.schema.required?.includes(key);
      let s;
      if (val.enum) {
        s = z.enum(val.enum);
      } else {
        switch (val.type) {
          case "integer": case "number": s = z.coerce.number(); break;
          case "boolean": s = z.coerce.boolean(); break;
          case "array": s = z.array(z.any()); break;
          default: s = z.string(); break;
        }
      }
      if (val.description) s = s.describe(val.description);
      if (!isRequired) s = s.optional();
      schemaObj[key] = s;
    }
  }

  const pathParams = ep.parameters.filter(p => p.in === "path").map(p => p.name);
  const queryParams = ep.parameters.filter(p => p.in === "query").map(p => p.name);
  const hasBody = !!ep.requestBody;

  server.tool(
    ep.toolName,
    ep.summary || `${ep.method} ${ep.path}`,
    schemaObj,
    async (params) => {
      const pathQueryParams = {};
      const bodyParams = {};

      for (const [k, v] of Object.entries(params)) {
        if (pathParams.includes(k) || queryParams.includes(k)) {
          pathQueryParams[k] = v;
        } else if (hasBody) {
          bodyParams[k] = v;
        } else {
          pathQueryParams[k] = v;
        }
      }

      const result = await callApi(overrideBaseUrl, ep.method, ep.path, pathQueryParams, bodyParams, securitySchemes);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
