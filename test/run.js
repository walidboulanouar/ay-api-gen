#!/usr/bin/env node

/**
 * End-to-end test for ay-api-gen.
 * Uses the Petstore Swagger 2.0 spec as proof.
 */

import { loadSpec, extractEndpoints, deriveToolName } from "../src/parser.js";
import { generateMCPServer } from "../src/mcp-generator.js";
import { generateCLI } from "../src/cli-generator.js";
import { generateOpenAPIFromTools } from "../src/reverse.js";
import { truncateResponse, asMcpContent } from "../src/truncate.js";
import { safeDescription } from "../src/desc-sanitize.js";
import { resolveBaseUrl, assertHostAllowed } from "../src/url-guard.js";
import { lintSpec, parseAcceptRisks } from "../src/spec-linter.js";
import { injectSettings } from "../src/settings-injector.js";
import { mkdtempSync, mkdirSync, writeFileSync as fsWriteFileSync, readFileSync as fsReadFileSync } from "node:fs";
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

  // T-SET-1: settings namespace + collision policy
  const tmpDir = mkdtempSync(resolvePath(tmpdir(), "ay-settings-test-"));
  mkdirSync(resolvePath(tmpDir, ".claude"), { recursive: true });
  fsWriteFileSync(resolvePath(tmpDir, ".claude/settings.local.json"), JSON.stringify({ mcpServers: { foo: { command: "other-tool" } } }), "utf-8");

  const r1 = injectSettings("/tmp/server.js", "bar", { projectDir: tmpDir, nonInteractive: true });
  assert(r1.key === "ay-api-gen:bar", "T-SET-1: injectSettings writes under the ay-api-gen: namespace");

  let refusedUnprefixed = false;
  try {
    injectSettings("/tmp/server.js", "foo", { projectDir: tmpDir, nonInteractive: true });
  } catch (e) { refusedUnprefixed = /Refusing to write/.test(e.message); }
  assert(refusedUnprefixed, "T-SET-1: injectSettings refuses to shadow an unprefixed entry from another source");

  injectSettings("/tmp/server.js", "foo", { projectDir: tmpDir, nonInteractive: true, force: true });
  const settingsAfter = JSON.parse(fsReadFileSync(resolvePath(tmpDir, ".claude/settings.local.json"), "utf-8"));
  assert(settingsAfter.mcpServers.foo.command === "other-tool", "T-SET-1: --force does not touch the original unprefixed entry");
  assert(!!settingsAfter.mcpServers["ay-api-gen:foo"], "T-SET-1: --force writes the namespaced entry");

  let refusedCollision = false;
  try {
    injectSettings("/tmp/server2.js", "bar", { projectDir: tmpDir, nonInteractive: true });
  } catch (e) { refusedCollision = /already exists/.test(e.message); }
  assert(refusedCollision, "T-SET-1: injectSettings refuses to overwrite same-namespace entry without --force");

  const r3 = injectSettings("/tmp/x.js", "Foo/Bar Baz", { projectDir: tmpDir, nonInteractive: true });
  assert(r3.key === "ay-api-gen:Foo_Bar_Baz", "T-SET-1: injectSettings sanitizes spec-derived names for the settings key");

  // T-API-1 / T-API-2: spec-linter
  const dirtySpec = {
    info: {}, securitySchemes: {}, endpoints: [
      { method: "POST", path: "/charge", security: [], parameters: [] },
      { method: "GET", path: "/pets", security: [], parameters: [] },
      { method: "GET", path: "/users/{ssn}/profile", security: [], parameters: [{ name: "ssn", in: "path" }] },
    ],
  };
  const findings = lintSpec(dirtySpec);
  assert(findings.some(f => f.id === "T-API-1" && f.endpoint === "POST /charge" && f.severity === "high"), "T-API-1: fires on unauthenticated mutating endpoint");
  assert(!findings.some(f => f.endpoint === "GET /pets"), "T-API-1: does not fire on GET endpoints");
  assert(findings.some(f => f.id === "T-API-2" && f.message.includes("ssn")), "T-API-2: fires on sensitive path param");

  const cleanSpec = {
    info: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, endpoints: [
      { method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [] },
    ],
  };
  assert(lintSpec(cleanSpec).length === 0, "spec-linter: clean spec produces no findings");
  assert(parseAcceptRisks("T-API-1:POST_charge").has("T-API-1:POST_charge"), "spec-linter: parseAcceptRisks parses comma-separated list");
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
