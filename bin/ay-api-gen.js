#!/usr/bin/env node

/**
 * ay-api-gen CLI
 *
 * Commands:
 *   ay-api-gen <spec-url-or-file> [options]     Generate MCP server + CLI from OpenAPI spec
 *   ay-api-gen list                              List all generated APIs
 *   ay-api-gen remove <name>                     Remove a generated API
 *   ay-api-gen regen [name|--all]                Regenerate API(s) from saved config
 *   ay-api-gen --from-mcp <file> [options]       Generate OpenAPI spec from MCP tools
 */

import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ──
function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--no-settings") {
      opts.noSettings = true;
    } else if (arg === "--output" || arg === "-o") {
      opts.output = argv[++i];
    } else if (arg === "--name" || arg === "-n") {
      opts.name = argv[++i];
    } else if (arg === "--from-mcp") {
      opts.fromMcp = argv[++i];
    } else if (arg === "--all") {
      opts.all = true;
    } else if (!arg.startsWith("-")) {
      opts.positional.push(arg);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
ay-api-gen — Generate MCP servers + CLI tools from OpenAPI specs

COMMANDS
  ay-api-gen <spec-url-or-file> [options]     Generate MCP server + CLI
  ay-api-gen serve <spec>                      Start MCP server directly (no codegen)
  ay-api-gen run <spec> <resource> <action>    Call API directly (no codegen)
  ay-api-gen list                              List all generated APIs
  ay-api-gen remove <name>                     Remove a generated API from registry
  ay-api-gen regen [name|--all]                Regenerate from saved config
  ay-api-gen --from-mcp <file> [options]       Reverse: MCP tools -> OpenAPI

OPTIONS
  --output, -o <dir>   Output directory (default: .ay/apis/<name>/)
  --name, -n <name>    API name override
  --no-settings        Skip auto-registering MCP server in settings.json
  --from-mcp <file>    Read MCP tools from settings.json or server file
  --all                Regenerate all APIs (with regen command)
  --help, -h           Show this help

EXAMPLES
  # Generate from Petstore spec
  ay-api-gen https://petstore.swagger.io/v2/swagger.json

  # Generate from local file with custom output
  ay-api-gen ./my-api.json --output ./generated --name my-api

  # List all generated APIs
  ay-api-gen list

  # Regenerate all APIs
  ay-api-gen regen --all

  # Direct MCP server (no codegen, use in settings.json)
  ay-api-gen serve https://petstore.swagger.io/v2/swagger.json

  # Direct API call (no codegen)
  ay-api-gen run https://petstore.swagger.io/v2/swagger.json inventory list

  # Reverse: MCP tools -> OpenAPI
  ay-api-gen --from-mcp .claude/settings.local.json --output ./openapi.json
`);
}

function formatAuthTypes(securitySchemes) {
  const schemes = Object.values(securitySchemes || {});
  if (schemes.length === 0) return "none";
  return schemes.map(s => {
    if (s.type === "oauth2") return "OAuth2 (" + Object.keys(s.flows || {}).join(", ") + ")";
    if (s.type === "http") return "HTTP " + s.scheme;
    if (s.type === "apiKey") return "API Key in " + s.in + ": " + s.paramName;
    return s.type;
  });
}

// ── Subcommands ──

async function cmdList() {
  const { listAPIs } = await import("../src/registry.js");
  const apis = listAPIs();

  if (apis.length === 0) {
    console.log("No APIs generated yet. Run: ay-api-gen <spec-url-or-file>");
    return;
  }

  console.log(`\n  ${apis.length} API(s) registered:\n`);
  for (const api of apis) {
    const auth = Array.isArray(api.authTypes) ? api.authTypes.join(", ") : (api.authTypes || "none");
    console.log(`  ${api.name}`);
    console.log(`    Source:    ${api.source}`);
    console.log(`    Base URL:  ${api.baseUrl}`);
    console.log(`    Endpoints: ${api.endpointCount}`);
    console.log(`    Auth:      ${auth}`);
    console.log(`    Output:    ${api.outputDir}`);
    console.log(`    Generated: ${api.generatedAt}`);
    console.log();
  }
}

async function cmdRemove(name) {
  const { unregisterAPI } = await import("../src/registry.js");
  if (unregisterAPI(name)) {
    console.log(`Removed "${name}" from registry.`);
    console.log(`Note: Files in .ay/apis/${name}/ were NOT deleted. Remove manually if needed.`);
  } else {
    console.error(`API "${name}" not found in registry.`);
    process.exit(1);
  }
}

async function cmdRegen(name, opts) {
  const { listAPIs } = await import("../src/registry.js");
  const apis = listAPIs();

  let toRegen;
  if (opts.all) {
    toRegen = apis;
  } else if (name) {
    toRegen = apis.filter(a => a.name === name);
    if (toRegen.length === 0) {
      console.error(`API "${name}" not found in registry. Run "ay-api-gen list" to see available APIs.`);
      process.exit(1);
    }
  } else {
    console.error("Specify an API name or --all. Run \"ay-api-gen list\" to see available APIs.");
    process.exit(1);
  }

  for (const api of toRegen) {
    console.log(`\nRegenerating: ${api.name} from ${api.source}`);
    await cmdGenerate(api.source, {
      name: api.name,
      output: api.outputDir,
      noSettings: opts.noSettings,
    });
  }
}

async function cmdReverse(opts) {
  const { readMCPTools, generateOpenAPIFromTools } = await import("../src/reverse.js");

  console.log(`Reading MCP tools from: ${opts.fromMcp}`);
  const result = readMCPTools(resolve(opts.fromMcp));

  if (result.type === "settings") {
    console.log(`Found ${Object.keys(result.servers).length} MCP server(s) in settings.`);
    console.log("Servers:", Object.keys(result.servers).join(", "));
    console.log("\nNote: To extract full tool definitions, point --from-mcp at the generated MCP server file.");
    process.exit(0);
  }

  console.log(`Found ${result.tools.length} tool(s).`);

  const spec = generateOpenAPIFromTools(result.tools, {
    title: opts.name || "API from MCP tools",
    baseUrl: process.env.API_BASE_URL,
  });

  const outputPath = opts.output || "openapi-from-mcp.json";
  writeFileSync(resolve(outputPath), JSON.stringify(spec, null, 2) + "\n", "utf-8");
  console.log(`OpenAPI spec written to: ${outputPath}`);
}

async function cmdGenerate(source, opts) {
  const { loadSpec, extractEndpoints } = await import("../src/parser.js");
  const { validateSpec } = await import("../src/validator.js");
  const { generateMCPServer } = await import("../src/mcp-generator.js");
  const { generateCLI } = await import("../src/cli-generator.js");
  const { generateEnvExample } = await import("../src/env-generator.js");
  const { injectSettings } = await import("../src/settings-injector.js");
  const { registerAPI } = await import("../src/registry.js");

  console.log(`Parsing OpenAPI spec: ${source}`);

  // Load and validate
  const spec = await loadSpec(source);
  const validation = validateSpec(spec);

  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      console.log(`  warn: ${w}`);
    }
  }
  if (!validation.valid) {
    for (const e of validation.errors) {
      console.error(`  error: ${e}`);
    }
    process.exit(1);
  }

  // Parse
  const parsed = extractEndpoints(spec);

  const apiName = opts.name ||
    parsed.info.title?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().replace(/-+/g, "-") ||
    "api";

  console.log(`API: ${parsed.info.title || apiName} (${parsed.endpoints.length} endpoints)`);
  console.log(`Base URL: ${parsed.baseUrl}`);

  // Show detected auth
  const authTypes = formatAuthTypes(parsed.securitySchemes);
  console.log(`Auth:     ${Array.isArray(authTypes) ? authTypes.join(", ") : authTypes}`);

  // Output directory
  const outputDir = resolve(opts.output || `.ay/apis/${apiName}`);
  mkdirSync(outputDir, { recursive: true });

  // Generate MCP server
  const mcpSource = generateMCPServer(parsed, { name: apiName });
  const mcpPath = resolve(outputDir, "mcp-server.js");
  writeFileSync(mcpPath, mcpSource, "utf-8");
  chmodSync(mcpPath, 0o755);
  console.log(`MCP server: ${mcpPath}`);

  // Generate CLI
  const cliSource = generateCLI(parsed, { name: apiName });
  const cliPath = resolve(outputDir, "cli.js");
  writeFileSync(cliPath, cliSource, "utf-8");
  chmodSync(cliPath, 0o755);
  console.log(`CLI tool:   ${cliPath}`);

  // Generate .env.example
  const envContent = generateEnvExample(parsed.securitySchemes, parsed.baseUrl, parsed.info);
  const envPath = resolve(outputDir, ".env.example");
  writeFileSync(envPath, envContent, "utf-8");
  console.log(`Env file:   ${envPath}`);

  // Generate package.json for standalone use (if outside a project with deps)
  const outPkgPath = resolve(outputDir, "package.json");
  if (!existsSync(outPkgPath)) {
    writeFileSync(outPkgPath, JSON.stringify({
      name: apiName + "-mcp",
      version: "1.0.0",
      type: "module",
      private: true,
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.12.1",
      },
    }, null, 2) + "\n", "utf-8");
  }

  // Save parsed spec summary
  const summaryPath = resolve(outputDir, "endpoints.json");
  writeFileSync(summaryPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");

  // Save config for regen
  const configPath = resolve(outputDir, "config.json");
  writeFileSync(configPath, JSON.stringify({
    source,
    name: apiName,
    outputDir,
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n", "utf-8");

  // Register in API registry
  registerAPI(apiName, {
    source,
    baseUrl: parsed.baseUrl,
    outputDir,
    endpointCount: parsed.endpoints.length,
    authTypes: Array.isArray(authTypes) ? authTypes : [authTypes],
  });

  // Auto-register in settings.json
  if (!opts.noSettings) {
    const settingsPath = injectSettings(mcpPath, apiName);
    console.log(`Settings:   ${settingsPath}`);
    console.log(`  -> MCP server "${apiName}" registered.`);
  }

  // Print summary
  console.log(`\n--- Generated ${parsed.endpoints.length} tools ---`);
  for (const ep of parsed.endpoints.slice(0, 15)) {
    console.log(`  ${ep.method.padEnd(7)} ${ep.path.padEnd(35)} -> ${ep.toolName}`);
  }
  if (parsed.endpoints.length > 15) {
    console.log(`  ... and ${parsed.endpoints.length - 15} more`);
  }

  // Auto-install deps if node_modules doesn't exist in output dir
  const outNodeModules = resolve(outputDir, "node_modules");
  if (!existsSync(outNodeModules)) {
    try {
      const { execSync } = await import("node:child_process");
      console.log(`\nInstalling dependencies in ${outputDir}...`);
      execSync("npm install --production --silent", { cwd: outputDir, stdio: "pipe" });
      console.log(`  -> Dependencies installed.`);
    } catch {
      console.log(`  -> Run "npm install" in ${outputDir} to install dependencies.`);
    }
  }

  console.log(`\nUsage:`);
  console.log(`  MCP:  Restart Claude Code — the "${apiName}" server is auto-registered.`);
  console.log(`  CLI:  node ${cliPath} --help`);
  if (!existsSync(resolve(outputDir, ".env"))) {
    console.log(`  Auth: cp ${envPath} ${resolve(outputDir, ".env")} && edit .env`);
  }
}

// ── Main ──
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts.positional[0];

  if (opts.help && !cmd) {
    printHelp();
    process.exit(0);
  }

  // Subcommands
  if (cmd === "list") return cmdList();
  if (cmd === "remove") {
    const name = opts.positional[1];
    if (!name) { console.error("Usage: ay-api-gen remove <name>"); process.exit(1); }
    return cmdRemove(name);
  }
  if (cmd === "regen") return cmdRegen(opts.positional[1], opts);

  // Runtime serve: start MCP server directly from spec (no codegen)
  if (cmd === "serve") {
    const specSource = opts.positional[1];
    if (!specSource) { console.error("Usage: ay-api-gen serve <spec-url-or-file>"); process.exit(1); }
    // Re-exec with the runtime MCP server
    const { execSync } = await import("node:child_process");
    const runtimePath = resolve(__dirname, "../src/runtime/mcp-server.js");
    try {
      execSync(`node ${JSON.stringify(runtimePath)} ${JSON.stringify(specSource)}`, { stdio: "inherit" });
    } catch { /* server exited */ }
    return;
  }

  // Runtime run: call API directly from spec (no codegen)
  if (cmd === "run") {
    const runArgs = process.argv.slice(3); // everything after "run"
    const runtimePath = resolve(__dirname, "../src/runtime/cli.js");
    const { execSync } = await import("node:child_process");
    try {
      execSync(`node ${JSON.stringify(runtimePath)} ${runArgs.map(a => JSON.stringify(a)).join(" ")}`, { stdio: "inherit" });
    } catch { process.exit(1); }
    return;
  }

  // Reverse mode
  if (opts.fromMcp) return cmdReverse(opts);

  // Forward mode
  if (!cmd) {
    printHelp();
    process.exit(0);
  }
  return cmdGenerate(cmd, opts);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
