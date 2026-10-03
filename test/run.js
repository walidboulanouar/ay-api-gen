#!/usr/bin/env node

/**
 * End-to-end test for ay-api-gen.
 * Uses the Petstore Swagger 2.0 spec as proof.
 */

import { loadSpec, extractEndpoints, deriveToolName, readCapped, MAX_SPEC_BYTES } from "../src/parser.js";
import { generateMCPServer } from "../src/mcp-generator.js";
import { generateCLI } from "../src/cli-generator.js";
import { generateOpenAPIFromTools } from "../src/reverse.js";
import { truncateResponse, asMcpContent } from "../src/truncate.js";
import { safeDescription } from "../src/desc-sanitize.js";
import { resolveBaseUrl, assertHostAllowed } from "../src/url-guard.js";
import { lintSpec, parseAcceptRisks } from "../src/spec-linter.js";
import { diffEndpoints } from "../src/diff.js";
import { injectSettings } from "../src/settings-injector.js";
import { parseYaml } from "../src/yaml-parser.js";
import { withFileLock } from "../src/file-lock.js";
import { registerAPI } from "../src/registry.js";
import { isCacheable, cacheKey, getCached, setCached, clearCache, cacheSize } from "../src/response-cache.js";
import { throttle, rpsToMinIntervalMs, resetRateLimiter } from "../src/rate-limiter.js";
import {
  mkdtempSync, mkdirSync, writeFileSync as fsWriteFileSync, readFileSync as fsReadFileSync,
  closeSync, openSync, utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve as resolvePath } from "node:path";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

async function testParser() {
  console.log("\n--- Parser Tests ---");

  // Test tool name derivation
  assert(deriveToolName("get", "/pets") === "list_pets", "GET /pets -> list_pets");
  assert(deriveToolName("post", "/pets") === "create_pets", "POST /pets -> create_pets");
  assert(deriveToolName("get", "/pets/{petId}") === "get_pet", "GET /pets/{petId} -> get_pet");
  assert(deriveToolName("put", "/pets/{petId}") === "update_pet", "PUT /pets/{petId} -> update_pet");
  assert(deriveToolName("delete", "/pets/{petId}") === "delete_pet", "DELETE /pets/{petId} -> delete_pet");

  // Test loading a real spec
  console.log("\n  Loading Petstore spec from URL...");
  const spec = await loadSpec("https://petstore.swagger.io/v2/swagger.json");
  assert(spec.swagger === "2.0", "Spec is Swagger 2.0");
  assert(spec.info.title === "Swagger Petstore", `Title: ${spec.info.title}`);

  const parsed = extractEndpoints(spec);
  assert(parsed.endpoints.length > 0, `Found ${parsed.endpoints.length} endpoints`);
  assert(parsed.baseUrl.includes("petstore"), `Base URL: ${parsed.baseUrl}`);

  // Check specific endpoints exist
  const toolNames = parsed.endpoints.map(e => e.toolName);
  console.log(`  Tool names: ${toolNames.slice(0, 8).join(", ")}...`);

  return parsed;
}

async function testMCPGenerator(parsed) {
  console.log("\n--- MCP Generator Tests ---");

  const src = generateMCPServer(parsed, { name: "petstore" });
  assert(src.includes("McpServer"), "Contains McpServer import");
  assert(src.includes("StdioServerTransport"), "Contains StdioServerTransport import");
  assert(src.includes("server.tool("), "Contains tool definitions");
  assert(src.includes("petstore"), "Contains API name");
  assert(src.includes("callApi"), "Contains API caller");
  assert(src.length > 1000, `Generated ${src.length} chars`);

  return src;
}

async function testCLIGenerator(parsed) {
  console.log("\n--- CLI Generator Tests ---");

  const src = generateCLI(parsed, { name: "petstore" });
  assert(src.includes("#!/usr/bin/env node"), "Has shebang");
  assert(src.includes("register("), "Contains command registrations");
  assert(src.includes("callApi"), "Contains API caller");
  assert(src.includes("parseArgs"), "Contains arg parser");
  assert(src.includes("printHelp"), "Contains help function");
  assert(src.length > 1000, `Generated ${src.length} chars`);

  return src;
}

async function testReverse() {
  console.log("\n--- Reverse Generator Tests ---");

  // Test with mock tools
  const tools = [
    {
      name: "list_users",
      description: "List all users",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "integer", description: "Page number" },
          limit: { type: "integer", description: "Items per page" },
        },
      },
    },
    {
      name: "get_user",
      description: "Get a user by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "User ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_user",
      description: "Create a new user",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "User name" },
          email: { type: "string", description: "User email" },
        },
        required: ["name", "email"],
      },
    },
  ];

  const spec = generateOpenAPIFromTools(tools, { title: "Test API" });
  assert(spec.openapi === "3.0.3", "OpenAPI 3.0.3");
  assert(spec.info.title === "Test API", "Title preserved");
  assert(Object.keys(spec.paths).length > 0, `Generated ${Object.keys(spec.paths).length} paths`);

  // Check that list_users -> GET /users
  assert(spec.paths["/users"]?.get, "list_users -> GET /users");
  assert(spec.paths["/users/{id}"]?.get, "get_user -> GET /users/{id}");
  assert(spec.paths["/users"]?.post, "create_user -> POST /users");

  // Check parameters
  const listOp = spec.paths["/users"].get;
  assert(listOp.parameters.length === 2, "list_users has 2 query params");

  const createOp = spec.paths["/users"].post;
  assert(createOp.requestBody, "create_user has request body");
}

/**
 * S1 security-baseline regression tests (ADR-006 / THREAT-MODEL.md).
 * These use local fixtures only — no network required — so they run even
 * when the network-dependent Petstore tests above are skipped.
 */
async function testSecurityHardening() {
  console.log("\n--- Security Hardening Tests (S1) ---");

  const maliciousParsed = {
    baseUrl: "https://api.example.com",
    info: {
      title: "Evil */ require('child_process').execSync('touch /tmp/pwned') /*",
      description: "desc */ evil /*",
      version: "1.0.0",
    },
    endpoints: [{
      toolName: "get_thing", method: "GET", path: "/thing", summary: "get thing",
      parameters: [], security: [], cliCommand: { resource: "thing", action: "get" },
    }],
    securitySchemes: {},
  };

  // T-ING-1: JSDoc comment injection via info.title / info.description
  const mcpSrc = generateMCPServer(maliciousParsed, { name: "evil" });
  const mcpJsDoc = mcpSrc.slice(0, mcpSrc.indexOf("import { McpServer }"));
  assert(!mcpJsDoc.includes("*/ require('child_process')"), "T-ING-1: mcp-generator escapes */ in JSDoc header");
  assert(mcpJsDoc.includes("*\\/"), "T-ING-1: mcp-generator emits escaped */ form");

  const cliSrc = generateCLI(maliciousParsed, { name: "evil" });
  const cliJsDoc = cliSrc.slice(0, cliSrc.indexOf("import { readFileSync"));
  assert(!cliJsDoc.includes("*/ require('child_process')"), "T-ING-1: cli-generator escapes */ in JSDoc header");

  // Template-literal breakout via backtick / ${...} in printHelp()
  const backtickParsed = {
    ...maliciousParsed,
    info: { title: "Title`+require('child_process').execSync('x')+`", description: "d", version: "1.0.0" },
  };
  const cliSrc2 = generateCLI(backtickParsed, { name: "evil2" });
  assert(cliSrc2.includes("\\`+require") && cliSrc2.includes("+\\`"), "T-ING-1: cli-generator escapes backtick/${} in generated template literal");

  // T-RUN-3: description sanitization
  const longDesc = "x".repeat(600);
  const safeDesc = safeDescription(longDesc, "tool");
  assert(safeDesc.length < longDesc.length + 100, "T-RUN-3: safeDescription caps length");
  assert(safeDesc.startsWith("[tool description, untrusted]"), "T-RUN-3: safeDescription adds untrusted marker");
  assert(!safeDescription("line1\nline2", "param").includes("\n"), "T-RUN-3: safeDescription collapses multiline");
  assert(safeDescription("", "tool") === "", "T-RUN-3: safeDescription leaves empty description empty");
  assert(mcpSrc.includes("safeDescription("), "T-RUN-3: mcp-generator emits safeDescription() calls");

  // T-RUN-4 / T-RUN-6: truncation + boundary markers
  const bigArray = Array.from({ length: 1000 }, (_, i) => i);
  const truncated = truncateResponse(bigArray);
  assert(truncated._totalCount === 1000 && truncated.items.length === 5, "T-RUN-6: truncateResponse caps arrays at maxItems");
  const bigObject = { blob: "x".repeat(20000) };
  let oversizedOk = true;
  try { truncateResponse(bigObject); } catch { oversizedOk = false; }
  assert(oversizedOk, "T-RUN-6: truncateResponse does not throw on oversized objects");
  const enveloped = asMcpContent(bigObject);
  assert(enveloped.content.length === 3, "T-RUN-4: asMcpContent wraps response in 3-part content array");
  assert(enveloped.content[0].text.includes("begin API response") && enveloped.content[2].text.includes("end API response"), "T-RUN-4: asMcpContent adds boundary markers");
  assert(mcpSrc.includes("asMcpContent("), "T-RUN-4/6: mcp-generator emits asMcpContent() calls");

  // T-RUN-1: same-host base URL guard
  assert(resolveBaseUrl("https://api.example.com/v1", undefined) === "https://api.example.com/v1", "T-RUN-1: resolveBaseUrl passes through with no override");
  assert(resolveBaseUrl("https://api.example.com/v1", "https://api.example.com/v2") === "https://api.example.com/v2", "T-RUN-1: resolveBaseUrl allows same-host path change");
  try {
    resolveBaseUrl("https://api.example.com/v1", "https://evil.com");
    assert(false, "T-RUN-1: resolveBaseUrl should reject cross-host override");
  } catch (e) {
    assert(/rejected/.test(e.message), "T-RUN-1: resolveBaseUrl rejects cross-host override");
  }
  assert(resolveBaseUrl("https://api.example.com", "https://evil.com", { allowHostOverride: true }) === "https://evil.com", "T-RUN-1: resolveBaseUrl allows cross-host with explicit opt-in");
  assert(mcpSrc.includes("resolveBaseUrl("), "T-RUN-1: mcp-generator emits resolveBaseUrl() call");

  // T-ING-2: private/link-local/metadata IP deny-list
  for (const bad of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.1/", "http://[::1]/"]) {
    try {
      await assertHostAllowed(bad);
      assert(false, `T-ING-2: assertHostAllowed should reject ${bad}`);
    } catch (e) {
      assert(/Refusing connect/.test(e.message), `T-ING-2: assertHostAllowed rejects ${bad}`);
    }
  }
  await assertHostAllowed("http://8.8.8.8/"); // should not throw
  assert(true, "T-ING-2: assertHostAllowed allows public IPs");
  process.env.AY_ALLOW_PRIVATE_HOSTS = "1";
  await assertHostAllowed("http://127.0.0.1/"); // should not throw
  assert(true, "T-ING-2: AY_ALLOW_PRIVATE_HOSTS=1 opts out of the deny-list");
  delete process.env.AY_ALLOW_PRIVATE_HOSTS;
  assert(mcpSrc.includes("assertHostAllowed("), "T-ING-2: mcp-generator emits assertHostAllowed() calls");
  assert(cliSrc.includes("resolveBaseUrl(") && cliSrc.includes("assertHostAllowed("), "T-ING-2/T-RUN-1: cli-generator emits resolveBaseUrl()/assertHostAllowed() calls (S2 gap closure)");

  // T-SET-1: settings namespace + collision policy
  const tmpDir = mkdtempSync(resolvePath(tmpdir(), "ay-settings-test-"));
  mkdirSync(resolvePath(tmpDir, ".claude"), { recursive: true });
  fsWriteFileSync(resolvePath(tmpDir, ".claude/settings.local.json"), JSON.stringify({ mcpServers: { foo: { command: "other-tool" } } }), "utf-8");

  const r1 = await injectSettings("/tmp/server.js", "bar", { projectDir: tmpDir, nonInteractive: true });
  assert(r1.key === "ay-api-gen:bar", "T-SET-1: injectSettings writes under the ay-api-gen: namespace");

  let refusedUnprefixed = false;
  try {
    await injectSettings("/tmp/server.js", "foo", { projectDir: tmpDir, nonInteractive: true });
  } catch (e) { refusedUnprefixed = /Refusing to write/.test(e.message); }
  assert(refusedUnprefixed, "T-SET-1: injectSettings refuses to shadow an unprefixed entry from another source");

  await injectSettings("/tmp/server.js", "foo", { projectDir: tmpDir, nonInteractive: true, force: true });
  const settingsAfter = JSON.parse(fsReadFileSync(resolvePath(tmpDir, ".claude/settings.local.json"), "utf-8"));
  assert(settingsAfter.mcpServers.foo.command === "other-tool", "T-SET-1: --force does not touch the original unprefixed entry");
  assert(!!settingsAfter.mcpServers["ay-api-gen:foo"], "T-SET-1: --force writes the namespaced entry");

  let refusedCollision = false;
  try {
    await injectSettings("/tmp/server2.js", "bar", { projectDir: tmpDir, nonInteractive: true });
  } catch (e) { refusedCollision = /already exists/.test(e.message); }
  assert(refusedCollision, "T-SET-1: injectSettings refuses to overwrite same-namespace entry without --force");

  const r3 = await injectSettings("/tmp/x.js", "Foo/Bar Baz", { projectDir: tmpDir, nonInteractive: true });
  assert(r3.key === "ay-api-gen:Foo_Bar_Baz", "T-SET-1: injectSettings sanitizes spec-derived names for the settings key");

  // T-SET-2: confirmOverwrite is properly awaited (a Promise return value must
  // not be treated as truthy just because it exists — that would silently
  // bypass the confirmation prompt regardless of the user's actual answer).
  let asyncConfirmCalled = false;
  const r4 = await injectSettings("/tmp/server3.js", "bar", {
    projectDir: tmpDir, nonInteractive: false,
    confirmOverwrite: async (nsKey) => { asyncConfirmCalled = true; return true; },
  });
  assert(asyncConfirmCalled && r4.key === "ay-api-gen:bar", "T-SET-2: async confirmOverwrite returning true is awaited and honored");

  let deniedByAsyncConfirm = false;
  try {
    await injectSettings("/tmp/server4.js", "bar", {
      projectDir: tmpDir, nonInteractive: false,
      confirmOverwrite: async () => false,
    });
  } catch (e) { deniedByAsyncConfirm = /Aborted/.test(e.message); }
  assert(deniedByAsyncConfirm, "T-SET-2: async confirmOverwrite returning false is awaited and still aborts (not treated as truthy Promise)");

  // T-API-1 / T-API-2 / T-API-3 / T-API-4 / T-API-5: spec-linter
  const dirtySpec = {
    baseUrl: "https://8.8.8.8",
    info: {}, securitySchemes: {}, endpoints: [
      { method: "POST", path: "/charge", security: [], parameters: [] },
      { method: "GET", path: "/pets", security: [], parameters: [] },
      { method: "GET", path: "/users/{ssn}/profile", security: [], parameters: [{ name: "ssn", in: "path" }] },
      { method: "GET", path: "/search", security: [], parameters: [{ name: "api_key", in: "query" }, { name: "q", in: "query" }] },
      {
        method: "PUT", path: "/user", security: [], parameters: [],
        requestBody: { schema: { properties: {
          name: { type: "string" },
          is_admin: { type: "boolean" },
          balance: { type: "number", readOnly: true },
        } } },
      },
    ],
  };
  const findings = lintSpec(dirtySpec);
  assert(findings.some(f => f.id === "T-API-1" && f.endpoint === "POST /charge" && f.severity === "high"), "T-API-1: fires on unauthenticated mutating endpoint");
  assert(!findings.some(f => f.endpoint === "GET /pets"), "T-API-1: does not fire on GET endpoints");
  assert(findings.some(f => f.id === "T-API-2" && f.message.includes("ssn")), "T-API-2: fires on sensitive path param");
  assert(findings.some(f => f.id === "T-API-3" && f.message.includes("is_admin")), "T-API-3: fires on a writable is_admin request-body field");
  assert(!findings.some(f => f.id === "T-API-3" && f.message.includes("balance")), "T-API-3: does not fire on a field explicitly marked readOnly");
  assert(!findings.some(f => f.id === "T-API-3" && f.message.includes('"name"')), "T-API-3: does not fire on an ordinary, non-privilege field name");
  assert(findings.some(f => f.id === "T-API-4" && f.message.includes("api_key") && f.endpoint === "GET /search"), "T-API-4: fires on sensitive query param");
  assert(!findings.some(f => f.id === "T-API-4" && f.message.includes('"q"')), "T-API-4: does not fire on an ordinary, non-sensitive query param");
  assert(findings.some(f => f.id === "T-API-5" && f.severity === "low" && f.message.includes("No security schemes")), "T-API-5: fires (low) when zero security schemes are declared anywhere in the spec");

  const cleanSpec = {
    baseUrl: "https://8.8.8.8",
    info: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, endpoints: [
      { method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [], hasRateLimitSignal: true },
      {
        method: "PUT", path: "/user", security: [{ bearer: [] }], parameters: [], hasRateLimitSignal: true,
        requestBody: { schema: { properties: { role: { type: "string", readOnly: true } } } },
      },
    ],
  };
  assert(lintSpec(cleanSpec).length === 0, "spec-linter: clean spec (incl. a readOnly role field, and a declared rate limit) produces no findings");

  // T-API-6: no endpoint anywhere declares a 429 response or a RateLimit-*
  // header — a single spec-wide low-severity finding, not one per endpoint.
  const noRateLimitSpec = {
    baseUrl: "https://8.8.8.8",
    info: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    endpoints: [
      { method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [] },
      { method: "GET", path: "/orders", security: [{ bearer: [] }], parameters: [] },
    ],
  };
  const noRateLimitFindings = lintSpec(noRateLimitSpec);
  const rateLimitHits = noRateLimitFindings.filter(f => f.id === "T-API-6");
  assert(rateLimitHits.length === 1 && rateLimitHits[0].severity === "low" && rateLimitHits[0].endpoint === "(spec-wide)", "T-API-6: fires exactly once (spec-wide, low) when NO endpoint declares a 429 response or RateLimit header");

  const oneEndpointRateLimitedSpec = {
    ...noRateLimitSpec,
    endpoints: [
      { method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [], hasRateLimitSignal: true },
      { method: "GET", path: "/orders", security: [{ bearer: [] }], parameters: [] },
    ],
  };
  assert(!lintSpec(oneEndpointRateLimitedSpec).some(f => f.id === "T-API-6"), "T-API-6: does not fire if ANY endpoint in the spec declares a rate-limit signal");

  // parser.js: verify hasRateLimitSignal is actually derived correctly from
  // a real spec (429 response code, or a RateLimit-*/X-RateLimit-* header
  // on any declared response), not just trusted as a hand-set test flag.
  const rateLimitParseSpec = {
    openapi: "3.0.0",
    info: { title: "Rate Limit Parse Test", version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/via-429": { get: { operationId: "via429", responses: { "200": { description: "ok" }, "429": { description: "rate limited" } } } },
      "/via-header": { get: { operationId: "viaHeader", responses: { "200": { description: "ok", headers: { "X-RateLimit-Remaining": { schema: { type: "integer" } } } } } } },
      "/via-neither": { get: { operationId: "viaNeither", responses: { "200": { description: "ok" } } } },
    },
  };
  const rateLimitParsed = extractEndpoints(rateLimitParseSpec);
  const via429 = rateLimitParsed.endpoints.find(e => e.path === "/via-429");
  const viaHeader = rateLimitParsed.endpoints.find(e => e.path === "/via-header");
  const viaNeither = rateLimitParsed.endpoints.find(e => e.path === "/via-neither");
  assert(via429.hasRateLimitSignal === true, "parser: hasRateLimitSignal true when a 429 response is declared");
  assert(viaHeader.hasRateLimitSignal === true, "parser: hasRateLimitSignal true when a response declares an X-RateLimit-* header");
  assert(viaNeither.hasRateLimitSignal === false, "parser: hasRateLimitSignal false when neither a 429 nor a RateLimit header is declared");

  // T-API-5: basic auth as the only scheme, over plaintext http:// — the
  // one case severe enough to be "high" (credentials are base64-encoded,
  // not encrypted, so this is real cleartext credential exposure).
  const basicOverHttpSpec = {
    baseUrl: "http://api.example.com",
    info: {}, securitySchemes: { basicAuth: { type: "http", scheme: "basic" } },
    endpoints: [{ method: "GET", path: "/pets", security: [{ basicAuth: [] }], parameters: [] }],
  };
  const basicOverHttpFindings = lintSpec(basicOverHttpSpec);
  assert(basicOverHttpFindings.some(f => f.id === "T-API-5" && f.severity === "high" && f.message.includes("http://")), "T-API-5: fires (high) when the only scheme is HTTP Basic over plaintext http://");

  // Same scheme, but https:// — must NOT fire (the scheme itself is fine, it's the plaintext transport that's the problem).
  const basicOverHttpsSpec = { ...basicOverHttpSpec, baseUrl: "https://api.example.com" };
  assert(!lintSpec(basicOverHttpsSpec).some(f => f.id === "T-API-5"), "T-API-5: does not fire when HTTP Basic is used over https://");

  // Bearer-only over http:// must NOT fire the basic-auth-specific sub-check (bearer tokens aren't base64-reversible credentials the same way).
  const bearerOverHttpSpec = {
    baseUrl: "http://api.example.com",
    info: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    endpoints: [{ method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [] }],
  };
  assert(!lintSpec(bearerOverHttpSpec).some(f => f.id === "T-API-5"), "T-API-5: does not fire for a non-basic scheme over http:// (only the basic-auth-over-plaintext combination is flagged)");

  assert(parseAcceptRisks("T-API-1:POST_charge").has("T-API-1:POST_charge"), "spec-linter: parseAcceptRisks parses comma-separated list");
}

/**
 * S2 sprint: T-GEN-1 audit regression tests.
 * Same injection class as the S1 JSDoc/template-literal fixes, but found in
 * src/auth-codegen.js (shared by both generators) and src/env-generator.js —
 * neither was covered by S1's scope. All local fixtures, no network.
 */
function noBareInjectedStatement(src) {
  return !src.split("\n").some(l => /^require\(/.test(l.trim()));
}

async function testGenInterpolationHardening() {
  console.log("\n--- T-GEN-1 Interpolation Audit Regression Tests (S2) ---");

  const NEWLINE_PAYLOAD = "X-Key\nrequire('child_process').execSync('touch /tmp/pwned_gen1');\n//";
  const BACKTICK_PAYLOAD = "X-Key`+require('child_process').execSync('touch /tmp/pwned_gen2')+`";

  const base = {
    baseUrl: "https://api.example.com",
    info: { title: "T", version: "1.0.0" },
    endpoints: [{
      toolName: "get_thing", method: "GET", path: "/thing", summary: "get",
      parameters: [], security: [], cliCommand: { resource: "thing", action: "get" },
    }],
  };

  // auth-codegen.js generateAuthCode(): raw "// comment" + s.paramName concatenation
  // — a bare newline breaks the comment and the payload becomes a real top-level statement.
  const newlineParsed = { ...base, securitySchemes: { apiKeyAuth: { type: "apiKey", in: "header", paramName: NEWLINE_PAYLOAD } } };
  const mcpNewline = generateMCPServer(newlineParsed, { name: "evil1" });
  assert(noBareInjectedStatement(mcpNewline), "T-GEN-1: auth-codegen apiKey paramName newline no longer breaks out of // comment (mcp-generator)");
  const cliNewline = generateCLI(newlineParsed, { name: "evil1" });
  assert(noBareInjectedStatement(cliNewline), "T-GEN-1: auth-codegen apiKey paramName newline no longer breaks out of // comment (cli-generator)");

  // Same bug via OAuth2 flow.tokenUrl
  const oauthNewlineParsed = {
    ...base,
    securitySchemes: { oauth: { type: "oauth2", flows: { clientCredentials: { tokenUrl: NEWLINE_PAYLOAD, scopes: {} } } } },
  };
  assert(noBareInjectedStatement(generateMCPServer(oauthNewlineParsed, { name: "evil1b" })), "T-GEN-1: auth-codegen OAuth2 flow.tokenUrl newline no longer breaks out of // comment");

  // auth-codegen.js generateEnvDocs(): embedded raw inside cli-generator's
  // nested printHelp() template literal — needs backtick/${} escaping, not just newline safety.
  const backtickParsed = { ...base, securitySchemes: { apiKeyAuth: { type: "apiKey", in: "header", paramName: BACKTICK_PAYLOAD } } };
  const cliBacktick = generateCLI(backtickParsed, { name: "evil2" });
  assert(cliBacktick.includes("\\`+require") || !cliBacktick.includes("`+require"), "T-GEN-1: auth-codegen generateEnvDocs backtick/${} breakout escaped, not raw, in generated CLI");

  // env-generator.js: newline in spec-derived fields could spoof an uncommented .env.example line
  const { generateEnvExample } = await import("../src/env-generator.js");
  const envContent = generateEnvExample(
    { apiKeyAuth: { type: "apiKey", in: "header", paramName: "X-Key\nAPI_KEY=attacker-controlled-value" } },
    "https://api.example.com",
    { title: "T" }
  );
  const spoofedLine = envContent.split("\n").find(l => l.trim() === "API_KEY=attacker-controlled-value");
  assert(!spoofedLine, "T-GEN-1: env-generator.js does not let spec data spoof an uncommented .env.example line");

  // All generated sources must still be syntactically valid after escaping
  const { execSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const tmp = mkdtempSync(resolvePath(tmpdir(), "ay-gen-check-"));
  for (const [name, src] of [["mcp1", mcpNewline], ["cli1", cliNewline], ["cli2", cliBacktick]]) {
    const p = resolvePath(tmp, `${name}.js`);
    writeFileSync(p, src);
    try {
      execSync(`node --check ${JSON.stringify(p)}`, { stdio: "pipe" });
      assert(true, `T-GEN-1: generated ${name}.js is still syntactically valid after escaping`);
    } catch (e) {
      assert(false, `T-GEN-1: generated ${name}.js syntax check failed: ${e.message}`);
    }
  }
}

/**
 * S2 sprint: YAML adversarial mini-corpus (S2-06).
 * src/yaml-parser.js is a deliberately minimal, zero-dep YAML subset parser
 * (documented as NOT handling anchors/aliases, complex keys, or true
 * multi-line block scalars). The bar here is not "parses every case
 * correctly" — it's "never throws, hangs, or silently produces something
 * that breaks a downstream consumer" on adversarial input. Hand-built,
 * not the full external yaml-test-suite (that needs a network fetch).
 */
async function testYamlAdversarialCorpus() {
  console.log("\n--- YAML Adversarial Mini-Corpus (S2) ---");

  const cases = [
    { name: "tab indentation (invalid YAML)", yaml: "openapi: 3.0.0\npaths:\n\t/users:\n\t\tget: {}\n" },
    // The real `yaml` package (YAML 1.2 core schema) rejects duplicate map
    // keys by default (`Map keys must be unique`) instead of the old custom
    // parser's silent last-key-wins behavior. That's arguably more correct —
    // duplicate keys in a spec are a genuine smell — and the wrapper still
    // degrades to `null` rather than letting the exception escape.
    { name: "duplicate keys (now rejected, not silently last-key-wins)", yaml: "openapi: 3.0.0\ninfo:\n  title: First\n  title: Second\n" },
    { name: "anchors/aliases (now actually resolved, must not throw)", yaml: "defaults: &defaults\n  type: string\nfield:\n  <<: *defaults\n" },
    { name: "deeply nested flow arrays", yaml: `a: ${"[".repeat(200)}1${"]".repeat(200)}` },
    { name: "multi-document YAML (---)", yaml: "openapi: 3.0.0\n---\nopenapi: 3.0.1\n" },
    { name: "unicode in strings", yaml: 'title: "API éèê 中文 😀"\nversion: "1.0"\n' },
    { name: "comment-like text inside quotes", yaml: 'title: "not a # comment"\nversion: "1.0"\n' },
    { name: "colon inside unquoted value (URL)", yaml: "servers:\n  - url: https://api.example.com:8443/v1\n" },
    { name: "empty file", yaml: "" },
    { name: "whitespace-only file", yaml: "   \n\t\n   \n" },
    { name: "CRLF line endings", yaml: "openapi: 3.0.0\r\ninfo:\r\n  title: CRLF Test\r\n" },
    { name: "very deep block nesting (stack safety)", yaml: Array.from({ length: 300 }, (_, i) => "  ".repeat(i) + "a:").join("\n") },
    { name: "null/tilde/bool coercion edge cases", yaml: "a: ~\nb: null\nc: TRUE\nd: False\ne: 1.0\nf: 007\n" },
  ];

  for (const c of cases) {
    let threw = false;
    let result;
    try {
      result = parseYaml(c.yaml);
    } catch {
      threw = true;
    }
    assert(!threw, `YAML corpus: "${c.name}" does not throw`);
  }

  // Positive case: a realistically-shaped OpenAPI YAML doc must still parse
  // correctly end-to-end, including through extractEndpoints().
  const validYaml = `
openapi: 3.0.3
info:
  title: YAML Positive Case
  version: "1.0.0"
servers:
  - url: https://api.example.com:8443/v1
paths:
  /widgets:
    get:
      operationId: listWidgets
      summary: "List widgets" # trailing comment
      responses:
        "200":
          description: ok
  /widgets/{id}:
    get:
      operationId: getWidget
      summary: Get a widget
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: ok
`.trim();

  const parsedYaml = parseYaml(validYaml);
  assert(parsedYaml !== null, "YAML corpus: valid OpenAPI YAML parses to a non-null object");
  assert(parsedYaml?.info?.title === "YAML Positive Case", "YAML corpus: nested info.title parses correctly");
  assert(parsedYaml?.servers?.[0]?.url === "https://api.example.com:8443/v1", "YAML corpus: URL with colon+port inside an array item parses correctly");
  assert(Object.keys(parsedYaml?.paths || {}).length === 2, "YAML corpus: both paths are present");

  const endpoints = extractEndpoints(parsedYaml).endpoints;
  assert(endpoints.length === 2, "YAML corpus: extractEndpoints() finds both operations from the YAML-parsed spec");
  assert(endpoints.some(e => e.toolName === "list_widgets"), "YAML corpus: operationId-derived tool name survives the YAML round-trip");

  // Explicitly confirm the duplicate-keys behavior change: the real `yaml`
  // package rejects duplicate map keys, and the wrapper degrades that to
  // `null` (per the "never throws" contract) rather than silently picking
  // a winner like the old custom parser did.
  const dupKeysResult = parseYaml("openapi: 3.0.0\ninfo:\n  title: First\n  title: Second\n");
  assert(dupKeysResult === null, "YAML corpus: duplicate map keys now degrade to null instead of silent last-key-wins");

  // ── New capability proofs (real `yaml` package vs. old custom parser) ──

  // (a) Anchors/aliases actually resolve to the right value. The old parser
  // could only avoid throwing on this syntax; it never resolved the alias —
  // it had no notion of & / * at all, so an anchored value would just come
  // through as a literal "&base ..." string instead of an object, and an
  // alias site would come through as a literal "*base" string.
  const anchorYaml = [
    "components:",
    "  schemas:",
    "    Base: &base",
    "      type: string",
    "      format: uuid",
    "    Other: *base",
  ].join("\n");
  const anchorResult = parseYaml(anchorYaml);
  assert(anchorResult !== null, "YAML corpus: anchor/alias doc parses to a non-null object");
  assert(
    anchorResult?.components?.schemas?.Base?.type === "string" &&
      anchorResult?.components?.schemas?.Base?.format === "uuid",
    "YAML corpus: anchored value (&base) parses as a real nested object, not a literal string"
  );
  assert(
    anchorResult?.components?.schemas?.Other?.type === "string" &&
      anchorResult?.components?.schemas?.Other?.format === "uuid",
    "YAML corpus: alias (*base) resolves to the same value as its anchor"
  );

  // (b) A real multi-line block scalar preserves its content. The old parser
  // treated a bare `|` or `>` value as "start a nested block" (i.e. it just
  // recursed into a child object), which is not the same as actually parsing
  // literal/folded block scalar text.
  const blockScalarYaml = [
    "description: |",
    "  Line one.",
    "  Line two.",
    "summary: >",
    "  This folds",
    "  into one line.",
  ].join("\n");
  const blockScalarResult = parseYaml(blockScalarYaml);
  assert(blockScalarResult !== null, "YAML corpus: block scalar doc parses to a non-null object");
  assert(
    blockScalarResult?.description === "Line one.\nLine two.\n",
    "YAML corpus: literal block scalar (|) preserves line breaks verbatim"
  );
  assert(
    blockScalarResult?.summary === "This folds into one line.\n",
    "YAML corpus: folded block scalar (>) folds line breaks into spaces"
  );

  // ── T-ING-4 positive audit ──
  // THREAT-MODEL.md flagged "custom YAML parsers have historically had
  // RCE/DoS issues (tag handlers, anchor/alias bombs)... needs a positive
  // audit, not negative inference." That was written against the OLD
  // hand-rolled parser; nobody had actually re-verified it against the
  // real `yaml` package this project switched to in S3 (ADR-013). Verified
  // empirically here, not assumed from the package's reputation:

  // (a) Billion-laughs / alias-bomb resource-exhaustion protection. The
  // `yaml` package enforces a default maxAliasCount cap and throws once an
  // alias chain's expansion exceeds it — confirmed by actually constructing
  // an exponential alias-expansion chain (each level references the
  // previous level 8x) rather than trusting the package's own docs. The
  // parseYaml() wrapper's "never throws" contract degrades this to `null`,
  // same as any other malformed input — a spec that trips this is rejected
  // outright, not silently truncated or partially expanded.
  let aliasBomb = 'a: &a0 ["x","x","x","x","x","x","x","x"]\n';
  for (let i = 1; i <= 12; i++) {
    aliasBomb += `a${i}: &a${i} [*a${i - 1}, *a${i - 1}, *a${i - 1}, *a${i - 1}, *a${i - 1}, *a${i - 1}, *a${i - 1}, *a${i - 1}]\n`;
  }
  const aliasBombResult = parseYaml(aliasBomb);
  assert(aliasBombResult === null, "T-ING-4: an exponential alias-expansion (\"billion laughs\") chain is rejected (degrades to null), not expanded into a resource-exhausting object");

  // A single, ordinary, non-exponential anchor/alias (already proven above
  // to resolve correctly) must NOT be caught by the same guard — the DoS
  // protection has to have a real, usable threshold, not fire on any use
  // of `&`/`*` at all.
  assert(anchorResult !== null, "T-ING-4: the alias-bomb guard does not false-positive on an ordinary single anchor/alias pair (already asserted above, restated here as the explicit contrast case)");

  // (b) Merge keys (`<<: *anchor`) are NOT auto-expanded into the parent
  // object by this package's default options — `<<` comes through as a
  // literal own key whose value is the referenced object, not merged in.
  // This matters because OpenAPI itself has no notion of YAML merge keys,
  // so there's no legitimate spec content this could silently corrupt, and
  // it forecloses a merge-key-based prototype-pollution vector some YAML
  // implementations have historically had (a malicious `<<: *proto` merging
  // attacker-controlled keys onto a shared object).
  const mergeKeyYaml = "base: &base\n  role: user\nchild:\n  <<: *base\n  name: bob\n";
  const mergeKeyResult = parseYaml(mergeKeyYaml);
  assert(mergeKeyResult?.child?.name === "bob", "T-ING-4: a document using merge-key syntax still parses (does not throw)");
  assert(mergeKeyResult?.child?.role === undefined, "T-ING-4: merge keys (<<: *anchor) are NOT auto-merged into the parent object by default — '<<' stays a literal key, not expanded (forecloses a merge-key prototype-pollution vector)");

  // (c) A literal `__proto__` map key does not pollute Object.prototype.
  // Checked via JSON.stringify (which only serializes real own-enumerable
  // properties, never the actual prototype chain) to confirm the key
  // round-tripped as ordinary data, plus a direct check that the global
  // Object.prototype was never touched — the actual security invariant.
  const protoYaml = "__proto__:\n  polluted: true\n";
  const protoResult = parseYaml(protoYaml);
  assert(JSON.stringify(protoResult).includes('"polluted":true'), "T-ING-4: a literal '__proto__' YAML key round-trips as ordinary data (visible via JSON.stringify)");
  assert(({}).polluted === undefined, "T-ING-4: parsing a spec with a literal '__proto__' key does NOT pollute the global Object.prototype");
}

/**
 * B-09: file-lock.js regression tests.
 *
 * A real cross-process race (spawning many `ay-api-gen generate` child
 * processes concurrently) is covered in test/integration-cli.js, but that
 * test can only prove "no data loss WITH the lock" — it can't reliably
 * prove "data loss WITHOUT the lock" as a red/green check, because the
 * actual read-modify-write critical section (readFileSync -> mutate ->
 * writeFileSync, all synchronous) is narrow enough relative to full CLI
 * process startup that even 20 real concurrent processes rarely land in
 * it at the same instant on a fast local disk — confirmed by manually
 * disabling the lock and re-running that test 3x at N=6 and once at
 * N=20 with zero reproductions. Race conditions are probabilistic; failing
 * to reproduce one under light load doesn't mean it can't happen under
 * real-world conditions (slower disks, heavier concurrency, network
 * filesystems) — which is exactly why it's worth fixing regardless.
 *
 * These tests instead exercise the locking PRIMITIVE directly and
 * deterministically, by making the critical section artificially slow
 * (a real `await new Promise(setTimeout)` inside the lock) so mutual
 * exclusion is provable without depending on process-scheduling luck.
 */
async function testFileLock() {
  console.log("\n--- B-09: file-lock.js Regression Tests ---");

  const lockTestDir = mkdtempSync(resolvePath(tmpdir(), "ay-file-lock-test-"));
  const targetFile = resolvePath(lockTestDir, "shared.json");

  // Mutual exclusion: N concurrent critical sections against the same path
  // must never overlap, even when each one is artificially slow.
  let concurrentCount = 0;
  let maxObservedConcurrent = 0;
  const completedOrder = [];

  async function slowCriticalSection(id) {
    return withFileLock(targetFile, async () => {
      concurrentCount++;
      maxObservedConcurrent = Math.max(maxObservedConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 40));
      completedOrder.push(id);
      concurrentCount--;
    });
  }

  await Promise.all([0, 1, 2, 3, 4].map(slowCriticalSection));
  assert(maxObservedConcurrent === 1, `file-lock: withFileLock enforces mutual exclusion (max concurrent observed: ${maxObservedConcurrent})`);
  assert(completedOrder.length === 5, "file-lock: all 5 queued critical sections eventually ran");

  // The return value of fn() must propagate through withFileLock.
  const returned = await withFileLock(targetFile, () => 42);
  assert(returned === 42, "file-lock: withFileLock returns fn()'s return value");

  // A throw inside fn() must propagate (not be swallowed) AND still release the lock.
  let threw = false;
  try {
    await withFileLock(targetFile, () => { throw new Error("boom"); });
  } catch (e) {
    threw = e.message === "boom";
  }
  assert(threw, "file-lock: an error thrown inside fn() propagates to the caller");

  const afterThrow = await withFileLock(targetFile, () => "still works");
  assert(afterThrow === "still works", "file-lock: the lock is released even when fn() throws (no deadlock)");

  // A stale lock (simulating a crashed process that never released it)
  // must be broken rather than blocking forever.
  const staleLockPath = `${targetFile}.lock`;
  closeSync(openSync(staleLockPath, "w"));
  const oldTime = new Date(Date.now() - 60_000); // 60s old, past the default 15s staleMs
  utimesSync(staleLockPath, oldTime, oldTime);
  const staleResult = await withFileLock(targetFile, () => "broke the stale lock", { timeoutMs: 2000 });
  assert(staleResult === "broke the stale lock", "file-lock: a stale lock (older than staleMs) is broken rather than blocking indefinitely");

  // A genuinely held lock should cause a short-timeout acquire to fail cleanly.
  let releaseHeldLock;
  const heldLockPromise = withFileLock(targetFile, () => new Promise((res) => { releaseHeldLock = res; }));
  await new Promise((r) => setTimeout(r, 20)); // let the first call actually acquire the lock
  let timedOut = false;
  try {
    await withFileLock(targetFile, () => "should not get here", { timeoutMs: 300 });
  } catch (e) {
    timedOut = /Timed out waiting for lock/.test(e.message);
  }
  assert(timedOut, "file-lock: a short acquire timeout against a genuinely held lock fails with a clear error, not a hang");
  releaseHeldLock();
  await heldLockPromise;

  // registerAPI() (registry.js) must be usable concurrently without losing
  // an entry — same lock, different consumer, deterministic via in-process
  // concurrency rather than spawned child processes.
  const registryProjectDir = mkdtempSync(resolvePath(tmpdir(), "ay-registry-lock-test-"));
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      registerAPI(`api-${i}`, { source: "x", baseUrl: "https://8.8.8.8", outputDir: "x", endpointCount: 1, authTypes: ["none"] }, registryProjectDir)
    )
  );
  const registryContent = JSON.parse(fsReadFileSync(resolvePath(registryProjectDir, ".ay/apis/registry.json"), "utf-8"));
  assert(Object.keys(registryContent.apis).length === 8, `file-lock: registerAPI() called 8x concurrently in-process loses no entries (found ${Object.keys(registryContent.apis).length})`);
}

/**
 * Item 23: response-cache.js unit tests. The end-to-end proof that this is
 * correctly wired into runtime/mcp-server.js (real MCP client/server
 * roundtrip, real ephemeral HTTP fixture, hit-count assertions) lives in
 * test/integration-cli.js's testResponseCaching() — these are the
 * fast, deterministic tests of the caching primitive itself.
 */
async function testResponseCache() {
  console.log("\n--- Item 23: response-cache.js Unit Tests ---");
  clearCache();

  assert(isCacheable("GET") && isCacheable("get") && isCacheable("HEAD"), "response-cache: GET and HEAD are cacheable");
  assert(!isCacheable("POST") && !isCacheable("PUT") && !isCacheable("PATCH") && !isCacheable("DELETE"), "response-cache: mutating methods are never cacheable");

  const key = cacheKey("GET", "https://api.example.com/x?a=1");
  assert(getCached(key) === undefined, "response-cache: a miss returns undefined");

  setCached(key, { hello: "world" }, 1000);
  assert(cacheSize() === 1, "response-cache: setCached adds one entry");
  const hit = getCached(key);
  assert(hit && hit.hello === "world", "response-cache: a fresh entry within its TTL is returned on getCached");

  // Different query string -> different key, no cross-contamination.
  const key2 = cacheKey("GET", "https://api.example.com/x?a=2");
  assert(getCached(key2) === undefined, "response-cache: a different query string is a distinct cache key (miss)");

  // ttlMs <= 0 is a no-op — caching must stay opt-in.
  const key3 = cacheKey("GET", "https://api.example.com/y");
  setCached(key3, "should not be cached", 0);
  assert(getCached(key3) === undefined, "response-cache: setCached with ttlMs<=0 is a no-op (opt-in only)");

  // Expiry: an entry with a near-zero TTL is gone shortly after.
  const key4 = cacheKey("GET", "https://api.example.com/z");
  setCached(key4, "short-lived", 20);
  await new Promise((r) => setTimeout(r, 60));
  assert(getCached(key4) === undefined, "response-cache: an entry past its TTL is treated as a miss (lazy expiry on read)");

  clearCache();
  assert(cacheSize() === 0, "response-cache: clearCache() empties the store");
}

/**
 * Item 24: rate-limiter.js unit tests. End-to-end wiring proof (real MCP
 * roundtrip, wall-clock timing between real upstream hits) lives in
 * test/integration-cli.js's testRateLimiting().
 */
async function testRateLimiter() {
  console.log("\n--- Item 24: rate-limiter.js Unit Tests ---");
  resetRateLimiter();

  assert(rpsToMinIntervalMs(0) === 0 && rpsToMinIntervalMs(undefined) === 0 && rpsToMinIntervalMs(-1) === 0, "rate-limiter: rpsToMinIntervalMs treats 0/undefined/negative as disabled (0ms)");
  assert(rpsToMinIntervalMs(2) === 500, "rate-limiter: rpsToMinIntervalMs(2) is 500ms between requests");
  assert(rpsToMinIntervalMs(10) === 100, "rate-limiter: rpsToMinIntervalMs(10) is 100ms between requests");

  // Disabled (minIntervalMs=0): back-to-back calls do not wait.
  const disabledStart = Date.now();
  await throttle("api.example.com", 0);
  await throttle("api.example.com", 0);
  assert(Date.now() - disabledStart < 50, "rate-limiter: throttle() with minIntervalMs=0 never delays");

  // Enabled: second call to the SAME host within the interval is delayed.
  resetRateLimiter();
  const start = Date.now();
  await throttle("api.example.com", 150);
  await throttle("api.example.com", 150);
  const elapsed = Date.now() - start;
  assert(elapsed >= 130, `rate-limiter: throttle() delays a second same-host call within the interval (waited ${elapsed}ms, wanted >=~150ms)`);

  // Different hosts are throttled independently — one host's rate does not
  // penalize a different host.
  resetRateLimiter();
  const multiHostStart = Date.now();
  await throttle("host-a.example.com", 500);
  await throttle("host-b.example.com", 500);
  assert(Date.now() - multiHostStart < 100, "rate-limiter: different hosts are throttled independently (second host's first call is not delayed)");

  resetRateLimiter();
}

/**
 * Item 19: OpenAPI 3.1 support.
 *
 * Scope decision (see PROGRESS-LOG.md for the full writeup): 3.1's most
 * impactful, actively-triggered gap is `nullable` — 3.0's `nullable: true`
 * became a `type` array (`["string", "null"]`) in 3.1's JSON-Schema-2020-12
 * Schema Objects, and every `switch (schema.type)` in this codebase reads
 * `type` expecting a string, silently falling through to a wrong default
 * ("z.string()") when handed an array. Fixed at the single source of
 * truth (parser.js's buildSchema()) so every consumer needed zero or
 * minimal changes. Also closed: components.pathItems / webhooks $ref
 * resolution (both new 3.1 constructs whose $ref target was previously
 * never even attempted), and webhooks structural parsing (deliberately
 * NOT turned into generated tools — see the code comment in parser.js for
 * why that's the technically-correct choice, not just a punt).
 * NOT implemented (research showed no current code reads these fields at
 * all, so there's no existing behavior to fix): exclusiveMinimum/Maximum
 * numeric-vs-boolean form, `examples` (plural) vs `example`, `$ref`
 * sibling-keyword semantics (research flagged this as genuinely contested
 * even within the spec community).
 */
async function testOpenAPI31Support() {
  console.log("\n--- Item 19: OpenAPI 3.1 Support ---");

  // ── nullable: array-valued `type` (the 3.1-native form) ──
  const nullableArraySpec = {
    openapi: "3.1.0",
    info: { title: "3.1 Nullable Test", version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/widgets": {
        get: {
          operationId: "listWidgets",
          summary: "List widgets",
          parameters: [
            { name: "category", in: "query", schema: { type: ["string", "null"] } },
            { name: "limit", in: "query", schema: { type: ["integer", "null"] } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  const nullableArrayParsed = extractEndpoints(nullableArraySpec);
  const categoryParam = nullableArrayParsed.endpoints[0].parameters.find(p => p.name === "category");
  const limitParam = nullableArrayParsed.endpoints[0].parameters.find(p => p.name === "limit");
  assert(categoryParam.schema.type === "string", `3.1 nullable: type:["string","null"] normalizes to a plain string type (got ${JSON.stringify(categoryParam.schema.type)})`);
  assert(categoryParam.schema.nullable === true, "3.1 nullable: type:[\"string\",\"null\"] sets schema.nullable = true");
  assert(limitParam.schema.type === "integer", `3.1 nullable: type:["integer","null"] normalizes to a plain integer type, not silently lost (got ${JSON.stringify(limitParam.schema.type)})`);
  assert(limitParam.schema.nullable === true, "3.1 nullable: type:[\"integer\",\"null\"] sets schema.nullable = true");

  // ── nullable: legacy `nullable: true` form must still work (real-world specs mix conventions even under a 3.1 header) ──
  const nullableLegacySpec = {
    ...nullableArraySpec,
    paths: {
      "/widgets": {
        get: {
          operationId: "listWidgets",
          summary: "List widgets",
          parameters: [{ name: "category", in: "query", schema: { type: "string", nullable: true } }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  const nullableLegacyParsed = extractEndpoints(nullableLegacySpec);
  const legacyParam = nullableLegacyParsed.endpoints[0].parameters[0];
  assert(legacyParam.schema.type === "string" && legacyParam.schema.nullable === true, "3.1 nullable: legacy 3.0-style {type:'string',nullable:true} still normalizes correctly (mixed-convention specs are common in the wild)");

  // ── nullable flows through to generated Zod code as .nullable(), not silently z.string() ──
  const nullableMcpSrc = generateMCPServer(nullableArrayParsed, { name: "nullable-test" });
  assert(nullableMcpSrc.includes("z.coerce.number()") && /z\.coerce\.number\(\)[^,\n]*\.nullable\(\)/.test(nullableMcpSrc), "3.1 nullable: generated server maps a nullable integer param to z.coerce.number().nullable(), not a wrong-type fallback");
  assert(/z\.string\(\)[^,\n]*\.nullable\(\)/.test(nullableMcpSrc), "3.1 nullable: generated server maps a nullable string param to z.string().nullable()");

  // ── nullable request-body property (not just parameters) ──
  const nullableBodySpec = {
    openapi: "3.1.0",
    info: { title: "3.1 Nullable Body Test", version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/widgets": {
        post: {
          operationId: "createWidget",
          summary: "Create widget",
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: {
              name: { type: "string" },
              parentId: { type: ["string", "null"] },
            } } } },
          },
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  const nullableBodyParsed = extractEndpoints(nullableBodySpec);
  const parentIdProp = nullableBodyParsed.endpoints[0].requestBody.schema.properties.parentId;
  assert(parentIdProp.type === "string" && parentIdProp.nullable === true, "3.1 nullable: a nullable request-body property normalizes the same way as a nullable parameter");

  // ── components.pathItems: whole-PathItem $ref from `paths` ──
  const pathItemsSpec = {
    openapi: "3.1.0",
    info: { title: "3.1 pathItems Test", version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/widgets": { $ref: "#/components/pathItems/WidgetPath" },
    },
    components: {
      pathItems: {
        WidgetPath: {
          get: { operationId: "listWidgets", summary: "List widgets", responses: { "200": { description: "ok" } } },
        },
      },
    },
  };
  const pathItemsParsed = extractEndpoints(pathItemsSpec);
  assert(pathItemsParsed.endpoints.length === 1 && pathItemsParsed.endpoints[0].toolName === "list_widgets", "3.1 pathItems: a whole-PathItem $ref in `paths` resolves and its operations are extracted (previously silently dropped — pathItem.get was undefined on the raw {$ref} object)");

  // ── webhooks: parsed structurally, NOT turned into callable tools ──
  const webhooksSpec = {
    openapi: "3.1.0",
    info: { title: "3.1 Webhooks Test", version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/widgets": { get: { operationId: "listWidgets", summary: "List widgets", responses: { "200": { description: "ok" } } } },
    },
    webhooks: {
      widgetCreated: {
        post: { operationId: "widgetCreatedWebhook", summary: "Fired when a widget is created", responses: { "200": { description: "ack" } } },
      },
    },
  };
  const webhooksParsed = extractEndpoints(webhooksSpec);
  assert(webhooksParsed.endpoints.length === 1 && webhooksParsed.endpoints.every(e => e.toolName !== "widget_created_webhook"), "3.1 webhooks: webhook operations are NOT added to endpoints (never become callable tools)");
  assert(webhooksParsed.webhooks.length === 1 && webhooksParsed.webhooks[0].name === "widgetCreated" && webhooksParsed.webhooks[0].method === "POST", "3.1 webhooks: webhook operations ARE captured structurally in the separate `webhooks` array");

  // ── webhooks via components.pathItems $ref too ──
  const webhooksRefSpec = {
    ...webhooksSpec,
    webhooks: { widgetCreated: { $ref: "#/components/pathItems/WidgetCreatedHook" } },
    components: { pathItems: { WidgetCreatedHook: { post: { operationId: "hook", summary: "hook", responses: { "200": { description: "ok" } } } } } },
  };
  const webhooksRefParsed = extractEndpoints(webhooksRefSpec);
  assert(webhooksRefParsed.webhooks.length === 1 && webhooksRefParsed.webhooks[0].method === "POST", "3.1 webhooks: a $ref'd webhook PathItem resolves correctly too");

  // ── validator: webhooks-only spec (valid 3.1, no `paths`) gets a specific, honest error, not a generic one ──
  const { validateSpec } = await import("../src/validator.js");
  const webhooksOnlySpec = { openapi: "3.1.0", info: { title: "x", version: "1.0.0" }, webhooks: webhooksSpec.webhooks };
  const webhooksOnlyResult = validateSpec(webhooksOnlySpec);
  assert(!webhooksOnlyResult.valid, "3.1 webhooks-only spec: still correctly reports invalid (nothing to generate)");
  assert(webhooksOnlyResult.errors.some(e => e.includes("webhooks")), "3.1 webhooks-only spec: the error specifically explains why (webhooks present, but not callable), not a generic 'no paths' message");

  // ── validator: a spec with BOTH paths and webhooks gets an informational warning, not an error ──
  const bothResult = validateSpec(webhooksSpec);
  assert(bothResult.valid, "3.1 spec with both paths and webhooks: still valid (paths exist)");
  assert(bothResult.warnings.some(w => w.includes("webhook")), "3.1 spec with both paths and webhooks: gets an informational warning about the webhooks not being generated");
}

/**
 * T-ING-3: DoS via a large or maliciously nested spec. Previously
 * `loadSpec()` had no size cap at all — a 500MB spec (malicious URL, or
 * just a bad copy-paste) would be read fully into memory before parsing
 * ever got a chance to reject it. Fixed with a 25MB cap enforced two ways:
 * a `statSync` pre-check for local files (never opens the file), and a
 * streaming byte-counter for fetched URLs (aborts mid-stream rather than
 * buffering the whole response first — a lying/absent Content-Length
 * header can't bypass it). All offline — no real network calls.
 */
async function testSpecSizeCap() {
  console.log("\n--- T-ING-3: Spec Size Cap (DoS Guard) ---");

  // Local file over the cap: rejected via a cheap statSync, before ever
  // reading the file into memory.
  const bigDir = mkdtempSync(resolvePath(tmpdir(), "ay-spec-size-test-"));
  const bigFile = resolvePath(bigDir, "huge-spec.json");
  fsWriteFileSync(bigFile, Buffer.alloc(MAX_SPEC_BYTES + 1024, "a"));
  let bigFileRejected = false;
  try {
    await loadSpec(bigFile);
  } catch (e) {
    bigFileRejected = /size cap/.test(e.message);
  }
  assert(bigFileRejected, "T-ING-3: loadSpec() rejects a local spec file over the 25MB cap without reading its contents");

  // Local file comfortably under the cap: unaffected, still loads normally.
  const smallFile = resolvePath(bigDir, "small-spec.json");
  fsWriteFileSync(smallFile, JSON.stringify({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} }));
  const smallSpec = await loadSpec(smallFile);
  assert(smallSpec.openapi === "3.0.0", "T-ING-3: loadSpec() loads a normal, well-under-cap local spec file unaffected");

  // readCapped() directly, against a real Response with a streamable body
  // (Node's built-in Response — no network involved), proving the cap is
  // enforced against actual bytes read, not just a header a server could
  // lie about or omit.
  const smallBody = "x".repeat(50);
  const smallRes = new Response(smallBody);
  const smallRead = await readCapped(smallRes, 100);
  assert(smallRead === smallBody, "T-ING-3: readCapped() returns the full body when it's under the cap");

  const oversizedBody = "y".repeat(500);
  const oversizedRes = new Response(oversizedBody);
  let streamRejected = false;
  try {
    await readCapped(oversizedRes, 100);
  } catch (e) {
    streamRejected = /size cap/.test(e.message);
  }
  assert(streamRejected, "T-ING-3: readCapped() aborts mid-stream once more than maxBytes have arrived, even with no/lying Content-Length");
}

/**
 * diff.js: diffEndpoints() used to match old/new endpoints by `toolName`,
 * which can carry an order-dependent "_2"/"_3" dedup suffix (see parser.js's
 * extractEndpoints() -> `usedToolNames`) assigned during iteration over the
 * spec's `paths` object. Two specs describing the EXACT same endpoints,
 * just with their paths declared in a different key order, could get that
 * suffix attached to different (but equally-colliding) physical endpoints
 * between the old and new spec — producing false "changed" (path/summary
 * "changed") diff entries for an API that hadn't actually changed at all.
 * Fixed by matching on the stable (method, path) identity instead. Found
 * and confirmed via a real, triggerable repro during a source-code survey,
 * not a hypothetical — this test locks that repro in permanently.
 */
async function testDiffOrderIndependentMatching() {
  console.log("\n--- diff.js: order-independent endpoint matching ---");

  // Two colliding endpoints (same derived base tool name "list_users" via
  // the trailing-slash duplicate — a real thing that happens with legacy
  // routing), declared in opposite order between the "old" and "new" spec.
  // Nothing about either endpoint actually changed.
  const mkSpec = (order) => {
    const a = { get: { summary: "List users", responses: { "200": { description: "ok" } } } };
    const b = { get: { summary: "List users trailing slash", responses: { "200": { description: "ok" } } } };
    return {
      openapi: "3.0.0",
      info: { title: "Dup Order Test", version: "1.0" },
      servers: [{ url: "https://8.8.8.8" }],
      paths: order === 1 ? { "/users": a, "/users/": b } : { "/users/": b, "/users": a },
    };
  };

  const oldParsed = extractEndpoints(mkSpec(1));
  const newParsed = extractEndpoints(mkSpec(2));
  // Sanity: confirm the reorder actually does flip which physical endpoint
  // gets the "_2" suffix — otherwise this test wouldn't be exercising the
  // bug at all.
  const oldSlash = oldParsed.endpoints.find(e => e.path === "/users/");
  const newSlash = newParsed.endpoints.find(e => e.path === "/users/");
  assert(oldSlash.toolName !== newSlash.toolName, "diff.js test setup: the declaration-order flip actually does swap which endpoint gets the dedup suffix (confirms this exercises the real bug, not a no-op)");

  const result = diffEndpoints(oldParsed.endpoints, newParsed.endpoints);
  assert(result.added.length === 0, "diff order-independence: no false 'added' entries for an unchanged API, just because paths were declared in a different order");
  assert(result.removed.length === 0, "diff order-independence: no false 'removed' entries either");
  assert(!result.changed.some(c => c.changes.some(ch => ch.startsWith("path:"))), "diff order-independence: no endpoint is falsely reported as having a changed path — neither endpoint's path actually changed");
  assert(!result.changed.some(c => c.changes.includes("summary changed")), "diff order-independence: no endpoint is falsely reported as having a changed summary — neither endpoint's summary actually changed");

  // The one legitimate, accurate side-effect: since the two endpoints
  // genuinely collide on their base derived name, the LITERAL generated
  // tool name for a given URL really does swap between the two orderings
  // (regenerating from either spec produces different function names) —
  // that's real, user-relevant information, not noise, and should still
  // be reported as a "tool name" change.
  assert(result.changed.length === 2 && result.changed.every(c => c.changes.length === 1 && c.changes[0].startsWith("tool name:")), "diff order-independence: the only real change reported is the tool-name swap itself, which is accurate (a real consequence of the naming collision), not a false positive");

  // Positive control: a genuine path rename (not just a reorder) must
  // still be detected as a real change — the fix must not overcorrect
  // into silence.
  const renamedSpec = {
    openapi: "3.0.0",
    info: { title: "Dup Order Test", version: "1.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: {
      "/users": { get: { summary: "List users", responses: { "200": { description: "ok" } } } },
      "/accounts": { get: { summary: "List users trailing slash", responses: { "200": { description: "ok" } } } },
    },
  };
  const renamedParsed = extractEndpoints(renamedSpec);
  const renameResult = diffEndpoints(oldParsed.endpoints, renamedParsed.endpoints);
  assert(renameResult.added.some(e => e.path === "/accounts"), "diff order-independence: a genuinely renamed path is still correctly detected as added...");
  assert(renameResult.removed.some(e => e.path === "/users/"), "diff order-independence: ...and the old path is still correctly detected as removed (the fix doesn't mask real changes)");
}

// ── Run all tests ──
async function run() {
  console.log("ay-api-gen — End-to-End Tests\n");

  try {
    await testSecurityHardening();
  } catch (err) {
    console.error(`\nFATAL (security hardening): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testGenInterpolationHardening();
  } catch (err) {
    console.error(`\nFATAL (T-GEN-1 audit): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testYamlAdversarialCorpus();
  } catch (err) {
    console.error(`\nFATAL (YAML corpus): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testFileLock();
  } catch (err) {
    console.error(`\nFATAL (file-lock): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testResponseCache();
  } catch (err) {
    console.error(`\nFATAL (response-cache): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testRateLimiter();
  } catch (err) {
    console.error(`\nFATAL (rate-limiter): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testOpenAPI31Support();
  } catch (err) {
    console.error(`\nFATAL (OpenAPI 3.1 support): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testSpecSizeCap();
  } catch (err) {
    console.error(`\nFATAL (T-ING-3 spec size cap): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    await testDiffOrderIndependentMatching();
  } catch (err) {
    console.error(`\nFATAL (diff.js order-independent matching): ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  try {
    const parsed = await testParser();
    await testMCPGenerator(parsed);
    await testCLIGenerator(parsed);
    await testReverse();
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
