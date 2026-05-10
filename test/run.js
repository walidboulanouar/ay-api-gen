#!/usr/bin/env node

/**
 * End-to-end test for ay-api-gen.
 * Uses the Petstore Swagger 2.0 spec as proof.
 */

import { loadSpec, extractEndpoints, deriveToolName } from "../src/parser.js";
import { generateMCPServer } from "../src/mcp-generator.js";
import { generateCLI } from "../src/cli-generator.js";
import { generateOpenAPIFromTools } from "../src/reverse.js";

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

// ── Run all tests ──
async function run() {
  console.log("ay-api-gen — End-to-End Tests\n");

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
