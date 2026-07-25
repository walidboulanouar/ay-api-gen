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
import { parseYaml } from "../src/yaml-parser.js";
import { withFileLock } from "../src/file-lock.js";
import { registerAPI } from "../src/registry.js";
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

  // T-API-1 / T-API-2 / T-API-3: spec-linter
  const dirtySpec = {
    info: {}, securitySchemes: {}, endpoints: [
      { method: "POST", path: "/charge", security: [], parameters: [] },
      { method: "GET", path: "/pets", security: [], parameters: [] },
      { method: "GET", path: "/users/{ssn}/profile", security: [], parameters: [{ name: "ssn", in: "path" }] },
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

  const cleanSpec = {
    info: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, endpoints: [
      { method: "GET", path: "/pets", security: [{ bearer: [] }], parameters: [] },
      {
        method: "PUT", path: "/user", security: [{ bearer: [] }], parameters: [],
        requestBody: { schema: { properties: { role: { type: "string", readOnly: true } } } },
      },
    ],
  };
  assert(lintSpec(cleanSpec).length === 0, "spec-linter: clean spec (incl. a readOnly role field) produces no findings");
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
