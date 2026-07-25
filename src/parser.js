/**
 * OpenAPI / Swagger parser.
 * Supports Swagger 2.0 and OpenAPI 3.0/3.1.
 * Fetches from URL or reads from local file. Zero external deps.
 */

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseYaml } from "./yaml-parser.js";

// T-ING-3: no size cap previously existed on a fetched or on-disk spec —
// a 500MB spec (malicious or just a mistaken URL) would be read fully into
// memory before parsing ever gets a chance to reject it. 25MB is generous
// for any real-world OpenAPI/Swagger document (even large ones — Stripe's
// public spec is ~10MB) while still bounding worst-case memory use to a
// fixed, small multiple of that, not a multiple of whatever an attacker
// chooses to serve.
export const MAX_SPEC_BYTES = 25 * 1024 * 1024;

/**
 * Read a fetch Response body as text, aborting once more than `maxBytes`
 * have arrived rather than buffering the whole thing first. Content-Length
 * isn't trustworthy on its own (can be absent, or a server can lie/chunk
 * past it), so this enforces the cap against the actual bytes read.
 * @param {Response} res
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
export async function readCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== "function") {
    // Environments without a streamable body (rare) — fall back to a
    // single read, still bounded by a post-hoc size check below.
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > maxBytes) {
      throw new Error(`Spec response exceeds the ${maxBytes}-byte size cap (T-ING-3 DoS guard).`);
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Spec response exceeds the ${maxBytes}-byte size cap (T-ING-3 DoS guard).`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/**
 * Fetch spec from URL or read from local file path.
 * @param {string} source - URL or file path
 * @returns {Promise<object>} parsed JSON spec (with _sourceUrl attached if fetched from URL)
 */
export async function loadSpec(source) {
  let raw;
  let sourceUrl = null;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    sourceUrl = source;
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
    raw = await readCapped(res, MAX_SPEC_BYTES);
  } else {
    const filePath = resolve(source);
    const { size } = statSync(filePath);
    if (size > MAX_SPEC_BYTES) {
      throw new Error(`Spec file "${filePath}" (${size} bytes) exceeds the ${MAX_SPEC_BYTES}-byte size cap (T-ING-3 DoS guard).`);
    }
    raw = readFileSync(filePath, "utf-8");
  }

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch {
    // Try parsing as YAML
    spec = parseYaml(raw);
    if (!spec) {
      throw new Error(
        "Failed to parse spec as JSON or YAML. Ensure the file is valid."
      );
    }
  }

  if (sourceUrl) {
    spec._sourceUrl = sourceUrl;
  }
  return spec;
}

/**
 * Normalize a Swagger 2.0 spec to look like OpenAPI 3.0 endpoints.
 */
function normalizeSwagger2(spec) {
  const baseUrl = `${spec.schemes?.[0] || "https"}://${spec.host || "localhost"}${spec.basePath || ""}`;
  return { baseUrl, spec };
}

/**
 * Resolve a $ref in the spec (single level, handles #/definitions/X and #/components/schemas/X).
 */
function resolveRef(ref, spec) {
  if (!ref || !ref.startsWith("#/")) return undefined;
  const parts = ref.replace("#/", "").split("/");
  let obj = spec;
  for (const p of parts) {
    obj = obj?.[p];
  }
  return obj;
}

/**
 * Normalize an OpenAPI 3.1 / JSON Schema 2020-12 `type` onto the single-string
 * + `nullable` boolean shape every downstream type-mapping switch (Zod
 * codegen, form-field generation) already expects from 3.0.
 *
 * 3.1 dropped `nullable: true` in favor of a union `type` array, e.g.
 * `{ "type": ["string", "null"] }` instead of 3.0's
 * `{ "type": "string", "nullable": true }`. Code that reads `schema.type`
 * expecting a string (every `switch (v.type)` in this codebase) silently
 * falls through to a wrong default when handed an array — JS's `switch`
 * doesn't throw on an unmatched value, so this was a silent mistype, not a
 * crash. Real-world specs also mix both conventions non-conformantly even
 * under an `"openapi": "3.1.x"` header, so both forms are normalized
 * regardless of the declared spec version.
 * @param {object} schema - mutated in place
 */
function normalizeSchemaType(schema) {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema.type)) {
    const hasNull = schema.type.includes("null");
    const primary = schema.type.find((t) => t !== "null");
    schema.type = primary; // undefined for a pure `type: ["null"]` schema — no non-null type to map to
    if (hasNull) schema.nullable = true;
  }
  // 3.0's boolean `nullable` alongside a plain string `type` needs no
  // change — it's already in the shape downstream code expects.

  return schema;
}

/**
 * Build a JSON Schema from OpenAPI parameter/schema, resolving $ref.
 */
function buildSchema(schema, spec) {
  if (!schema) return undefined;
  if (schema.$ref) {
    schema = resolveRef(schema.$ref, spec) || schema;
  }
  // Deep clone to avoid mutation
  const clone = JSON.parse(JSON.stringify(schema));
  normalizeSchemaType(clone);
  // Recursively resolve $ref in properties
  if (clone.properties) {
    for (const [key, val] of Object.entries(clone.properties)) {
      if (val.$ref) {
        clone.properties[key] = resolveRef(val.$ref, spec) || val;
      }
      normalizeSchemaType(clone.properties[key]);
      if (val.items?.$ref) {
        clone.properties[key].items = resolveRef(val.items.$ref, spec) || val.items;
      }
      if (clone.properties[key].items) normalizeSchemaType(clone.properties[key].items);
    }
  }
  if (clone.items?.$ref) {
    clone.items = resolveRef(clone.items.$ref, spec) || clone.items;
  }
  if (clone.items) normalizeSchemaType(clone.items);
  return clone;
}

/**
 * Naive singularize: handles common English plural patterns.
 * "deliveries" -> "delivery", "users" -> "user", "posts" -> "post", "statuses" -> "status"
 */
function singularize(word) {
  if (word.endsWith("ies") && word.length > 4) {
    return word.slice(0, -3) + "y"; // deliveries -> delivery
  }
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2); // statuses -> status, boxes -> box
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) {
    return word.slice(0, -1); // users -> user
  }
  return word;
}

/**
 * Derive a tool name from HTTP method + path.
 * GET /pets -> list_pets
 * POST /pets -> create_pets
 * GET /pets/{petId} -> get_pet
 * PUT /pets/{petId} -> update_pet
 * DELETE /pets/{petId} -> delete_pet
 * PATCH /pets/{petId} -> patch_pet
 * GET /users/{id}/posts -> list_user_posts
 * GET /users/{id}/posts/{id}/comments -> list_user_post_comments
 */
export function deriveToolName(method, path) {
  // Split path into segments, tracking which are params
  const rawSegments = path.split("/").filter(Boolean);
  const segments = rawSegments.filter(s => !s.startsWith("{"));
  const resource = segments[segments.length - 1] || "resource";

  // Determine if the last segment is followed by a path param (i.e., it's a single-resource op)
  // /users/{id} -> last resource "users" is followed by {id} -> single resource
  // /users/{id}/posts -> last resource "posts" is NOT followed by {id} -> collection
  const lastResourceIdx = rawSegments.lastIndexOf(resource);
  const nextAfterResource = rawSegments[lastResourceIdx + 1];
  const isItemOperation = nextAfterResource && nextAfterResource.startsWith("{");

  const prefixMap = {
    get: isItemOperation ? "get" : "list",
    post: "create",
    put: "update",
    patch: "patch",
    delete: "delete",
  };

  const prefix = prefixMap[method.toLowerCase()] || method.toLowerCase();

  // Clean resource name
  let name = resource.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  if (isItemOperation) {
    name = singularize(name);
  }

  // Include parent resource for nested paths: /users/{id}/posts -> list_user_posts
  if (segments.length > 1) {
    const parentSegments = segments.slice(0, -1).map(s => {
      const cleaned = s.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      return singularize(cleaned); // parents are always singularized
    });
    const parent = parentSegments.join("_");
    return `${prefix}_${parent}_${name}`.toLowerCase();
  }

  return `${prefix}_${name}`.toLowerCase();
}

/**
 * Derive a CLI command name from HTTP method + path.
 * GET /pets -> pets list
 * POST /pets -> pets create
 * GET /pets/{petId} -> pets get
 */
export function deriveCLICommand(method, path) {
  const segments = path.split("/").filter(s => s && !s.startsWith("{"));
  const resource = segments[segments.length - 1] || "resource";
  const hasId = path.includes("{");

  const actionMap = {
    get: hasId ? "get" : "list",
    post: "create",
    put: "update",
    patch: "patch",
    delete: "delete",
  };

  const action = actionMap[method.toLowerCase()] || method.toLowerCase();
  return { resource: resource.toLowerCase(), action };
}

/**
 * Extract all endpoints from a parsed spec.
 * @param {object} spec - Parsed OpenAPI/Swagger JSON
 * @returns {object} { baseUrl, endpoints: Array<Endpoint> }
 */
export function extractEndpoints(spec) {
  const isSwagger2 = spec.swagger && spec.swagger.startsWith("2");

  let baseUrl;
  if (isSwagger2) {
    const info = normalizeSwagger2(spec);
    baseUrl = info.baseUrl;
  } else {
    // OpenAPI 3.x
    const server = spec.servers?.[0];
    baseUrl = server?.url || "http://localhost";

    // Resolve relative server URLs against the source URL
    if (baseUrl.startsWith("/") && spec._sourceUrl) {
      try {
        const origin = new URL(spec._sourceUrl).origin;
        baseUrl = origin + baseUrl;
      } catch {
        // keep relative URL as-is
      }
    }
  }

  const endpoints = [];
  const paths = spec.paths || {};
  const usedToolNames = new Set();

  for (const [path, rawPathItem] of Object.entries(paths)) {
    // OpenAPI 3.1: a whole PathItem can itself be a $ref into the new
    // components.pathItems bucket (e.g. `"/pets": { "$ref": "#/components/pathItems/PetPath" }`).
    // resolveRef() already walks any "#/..." pointer generically, so no
    // special-casing of "pathItems" as a bucket name is needed here — the
    // gap was that this loop never checked for a $ref at this level at
    // all, silently treating every method lookup below as undefined and
    // dropping the whole path's operations with no error.
    const pathItem = rawPathItem.$ref ? (resolveRef(rawPathItem.$ref, spec) || rawPathItem) : rawPathItem;

    // Shared parameters at path level
    const sharedParams = pathItem.parameters || [];

    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const operation = pathItem[method];
      if (!operation) continue;

      let toolName = operation.operationId
        ? operation.operationId
            .replace(/([a-z])([A-Z])/g, "$1_$2") // camelCase -> snake_case
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .toLowerCase()
        : deriveToolName(method, path);

      // Deduplicate: if name already used, append a suffix
      if (usedToolNames.has(toolName)) {
        const base = toolName;
        let i = 2;
        while (usedToolNames.has(toolName)) {
          toolName = `${base}_${i}`;
          i++;
        }
      }
      usedToolNames.add(toolName);

      const cliCommand = deriveCLICommand(method, path);

      // Collect parameters
      const allParams = [...sharedParams, ...(operation.parameters || [])];
      const params = allParams.map(p => {
        const resolved = p.$ref ? resolveRef(p.$ref, spec) || p : p;
        return {
          name: resolved.name,
          in: resolved.in, // path, query, header, cookie
          required: resolved.required || false,
          description: resolved.description || "",
          schema: buildSchema(resolved.schema, spec) || { type: resolved.type || "string" },
        };
      });

      // Request body (OpenAPI 3.x)
      let requestBody = undefined;
      if (operation.requestBody) {
        const content = operation.requestBody.content || {};
        const jsonContent = content["application/json"];
        if (jsonContent?.schema) {
          requestBody = {
            required: operation.requestBody.required || false,
            schema: buildSchema(jsonContent.schema, spec),
          };
        }
      }

      // Swagger 2.0 body parameter
      if (isSwagger2) {
        const bodyParam = allParams.find(p => p.in === "body");
        if (bodyParam) {
          requestBody = {
            required: bodyParam.required || false,
            schema: buildSchema(bodyParam.schema, spec),
          };
        }
      }

      // Response schema (first success response)
      let responseSchema = undefined;
      const responses = operation.responses || {};
      const successCode = Object.keys(responses).find(c => c.startsWith("2")) || "200";
      const successResponse = responses[successCode];
      if (successResponse) {
        if (isSwagger2 && successResponse.schema) {
          responseSchema = buildSchema(successResponse.schema, spec);
        } else if (successResponse.content?.["application/json"]?.schema) {
          responseSchema = buildSchema(successResponse.content["application/json"].schema, spec);
        }
      }

      // Security requirements
      const security = operation.security || spec.security || [];

      // Rate-limit signal (T-API-6): a declared 429 response, or a
      // response header matching the de-facto RateLimit-*/X-RateLimit-*
      // convention (RFC-in-draft draft-ietf-httpapi-ratelimit-headers and
      // the older de-facto GitHub/Twitter convention both use this name
      // shape), on ANY declared response — not just the success one.
      const hasRateLimitSignal = Boolean(responses["429"]) || Object.values(responses).some(
        (r) => Object.keys(r?.headers || {}).some((h) => /rate.?limit/i.test(h))
      );

      endpoints.push({
        path,
        method: method.toUpperCase(),
        toolName,
        cliCommand,
        summary: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
        description: operation.description || operation.summary || "",
        parameters: params.filter(p => p.in !== "body"), // body handled separately
        requestBody,
        responseSchema,
        security,
        tags: operation.tags || [],
        operationId: operation.operationId || null,
        hasRateLimitSignal,
      });
    }
  }

  // Extract security schemes
  const securitySchemes = extractSecuritySchemes(spec);

  // OpenAPI 3.1: `webhooks` describes requests the API sends OUTBOUND to a
  // URL the consumer registers out-of-band — the reverse direction of
  // everything in `paths`. Parsed structurally (same PathItem/Operation
  // shape as `paths`, reusing the same $ref resolution) so a spec that
  // has them doesn't silently lose data, but deliberately NOT turned into
  // generated tools: there's no URL to call (the webhook's map key is a
  // name, not a route), and a "call this webhook" tool would be
  // nonsensical for a client-side codegen tool — you can't invoke an
  // inbound handler contract from the outside. Exposed here so callers
  // (validateSpec, doctor, generate output) can at least tell the user
  // webhooks exist and explain why nothing was generated for them.
  const webhooks = [];
  for (const [name, rawWebhookItem] of Object.entries(spec.webhooks || {})) {
    const webhookItem = rawWebhookItem.$ref ? (resolveRef(rawWebhookItem.$ref, spec) || rawWebhookItem) : rawWebhookItem;
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const operation = webhookItem[method];
      if (!operation) continue;
      webhooks.push({
        name,
        method: method.toUpperCase(),
        summary: operation.summary || operation.description || `${method.toUpperCase()} ${name}`,
        operationId: operation.operationId || null,
      });
    }
  }

  return {
    baseUrl,
    info: spec.info || {},
    endpoints,
    securitySchemes,
    webhooks,
  };
}

/**
 * Extract and normalize security schemes from spec.
 * Swagger 2.0: securityDefinitions
 * OpenAPI 3.x: components.securitySchemes
 *
 * Returns a map: { schemeName: { type, scheme, in, name, flows, ... } }
 */
function extractSecuritySchemes(spec) {
  const raw = spec.securityDefinitions || spec.components?.securitySchemes || {};
  const schemes = {};

  for (const [name, def] of Object.entries(raw)) {
    const scheme = { name, originalType: def.type };

    switch (def.type) {
      case "apiKey":
        scheme.type = "apiKey";
        scheme.in = def.in;         // "header" | "query" | "cookie"
        scheme.paramName = def.name; // e.g. "X-API-Key", "api_key"
        break;

      case "http":
        scheme.type = "http";
        scheme.scheme = def.scheme;  // "bearer" | "basic" | "digest"
        scheme.bearerFormat = def.bearerFormat; // e.g. "JWT"
        break;

      case "oauth2":
        scheme.type = "oauth2";
        // OpenAPI 3.x
        if (def.flows) {
          scheme.flows = {};
          for (const [flowType, flow] of Object.entries(def.flows)) {
            scheme.flows[flowType] = {
              authorizationUrl: flow.authorizationUrl,
              tokenUrl: flow.tokenUrl,
              refreshUrl: flow.refreshUrl,
              scopes: flow.scopes || {},
            };
          }
        }
        // Swagger 2.0
        if (def.flow) {
          scheme.flows = {
            [def.flow]: {
              authorizationUrl: def.authorizationUrl,
              tokenUrl: def.tokenUrl,
              scopes: def.scopes || {},
            },
          };
        }
        break;

      case "openIdConnect":
        scheme.type = "openIdConnect";
        scheme.openIdConnectUrl = def.openIdConnectUrl;
        break;

      // Swagger 2.0 "basic"
      case "basic":
        scheme.type = "http";
        scheme.scheme = "basic";
        break;

      default:
        scheme.type = def.type || "unknown";
        break;
    }

    schemes[name] = scheme;
  }

  return schemes;
}
