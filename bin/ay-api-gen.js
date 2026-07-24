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
import { mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
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
    } else if (arg === "--only") {
      opts.only = argv[++i];
    } else if (arg === "--exclude") {
      opts.exclude = argv[++i];
    } else if (arg === "--slim") {
      opts.slim = true;
    } else if (arg === "--token-budget") {
      opts.tokenBudget = parseInt(argv[++i], 10);
    } else if (arg === "--max-tools") {
      opts.maxTools = parseInt(argv[++i], 10);
    } else if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--allow-host-override") {
      opts.allowHostOverride = true;
    } else if (arg === "--accept-risks") {
      opts.acceptRisks = argv[++i];
    } else if (arg === "--mode") {
      opts.mode = argv[++i];
    } else if (arg === "--baseline") {
      opts.baseline = true;
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
  ay-api-gen init                              Interactive setup wizard
  ay-api-gen discover <domain>                 Auto-find OpenAPI specs on a domain
  ay-api-gen serve <spec>                      Start MCP server directly (no codegen)
  ay-api-gen run <spec> <resource> <action>    Call API directly (no codegen)
  ay-api-gen list                              List all generated APIs
  ay-api-gen doctor                            Health check all registered APIs
  ay-api-gen audit --baseline <spec>           Free T0 static security lint (no license needed)
  ay-api-gen diff <old-spec> <new-spec>        Compare two spec versions
  ay-api-gen remove <name>                     Remove a generated API from registry
  ay-api-gen regen [name|--all]                Regenerate from saved config
  ay-api-gen --from-mcp <file> [options]       Reverse: MCP tools -> OpenAPI

OPTIONS
  --output, -o <dir>   Output directory (default: .ay/apis/<name>/)
  --name, -n <name>    API name override
  --no-settings        Skip auto-registering MCP server in settings.json
  --from-mcp <file>    Read MCP tools from settings.json or server file
  --all                Regenerate all APIs (with regen command)
  --only <patterns>    Only include matching endpoints (comma-separated)
  --exclude <patterns> Exclude matching endpoints (comma-separated)
  --slim               Smart pruning: keep only essential tools within token budget
  --token-budget <n>   Token budget for --slim (default: 8000)
  --max-tools <n>      Max tools for --slim (default: 50)
  --verbose, -v        Verbose output
  --force              Overwrite colliding settings.json entries (see Security)
  --allow-host-override  Allow API_BASE_URL to rebind to a different host
  --accept-risks <ids> Comma-separated spec-linter findings to downgrade (mode b), e.g. T-API-1:POST_charge
  --mode <a|b>         Spec-lint mode: a=warn-only (default), b=block on HIGH/CRITICAL
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
      ...opts,
      name: api.name,
      output: api.outputDir,
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
  const { assertHostAllowed } = await import("../src/url-guard.js");
  const { lintSpec, printLintFindings, parseAcceptRisks } = await import("../src/spec-linter.js");

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

  // Refuse to generate a server pointed at a private/metadata IP (T-ING-2)
  await assertHostAllowed(parsed.baseUrl);

  // Spec-lint (T-API-1, T-API-2) — warn-only by default, blocking in --mode=b
  const lintFindings = lintSpec(parsed);
  if (lintFindings.length > 0) {
    printLintFindings(lintFindings);
    if (opts.mode === "b") {
      const accepted = parseAcceptRisks(opts.acceptRisks);
      const blocking = lintFindings.filter(f =>
        (f.severity === "high" || f.severity === "critical") &&
        !accepted.has(`${f.id}:${f.endpointSlug}`)
      );
      if (blocking.length > 0) {
        console.error(`\n[spec-lint] ${blocking.length} blocking finding(s) in --mode=b. Pass --accept-risks=<id>:<endpoint-slug>,... to override.`);
        process.exit(1);
      }
    }
  }

  const apiName = opts.name ||
    parsed.info.title?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().replace(/-+/g, "-") ||
    "api";

  console.log(`API: ${parsed.info.title || apiName} (${parsed.endpoints.length} endpoints)`);
  console.log(`Base URL: ${parsed.baseUrl}`);

  // Show detected auth
  const authTypes = formatAuthTypes(parsed.securitySchemes);
  console.log(`Auth:     ${Array.isArray(authTypes) ? authTypes.join(", ") : authTypes}`);

  // Apply filters
  if (opts.only || opts.exclude) {
    const { filterEndpoints } = await import("../src/filter.js");
    const before = parsed.endpoints.length;
    parsed.endpoints = filterEndpoints(parsed.endpoints, { only: opts.only, exclude: opts.exclude });
    console.log(`Filter:   ${before} -> ${parsed.endpoints.length} endpoints`);
  }

  // Apply smart pruning
  if (opts.slim) {
    const { pruneEndpoints, printSlimResults } = await import("../src/slim.js");
    const originalCount = parsed.endpoints.length;
    const result = pruneEndpoints(parsed.endpoints, {
      tokenBudget: opts.tokenBudget,
      maxTools: opts.maxTools,
    });
    parsed.endpoints = result.kept;
    printSlimResults(result, originalCount);
  }

  // Output directory
  const outputDir = resolve(opts.output || `.ay/apis/${apiName}`);
  mkdirSync(outputDir, { recursive: true });

  // Copy runtime security helpers into the output dir — the generated
  // server and CLI are standalone and import these by relative path.
  for (const helper of ["truncate.js", "desc-sanitize.js", "url-guard.js"]) {
    const src = resolve(__dirname, "../src", helper);
    writeFileSync(resolve(outputDir, helper), readFileSync(src, "utf-8"), "utf-8");
  }

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
  const envContent = generateEnvExample(parsed.securitySchemes, parsed.baseUrl, parsed.info, {
    allowHostOverride: opts.allowHostOverride,
  });
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
        "@modelcontextprotocol/sdk": "1.29.0",
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
    try {
      const nonInteractive = !process.stdout.isTTY || !process.stdin.isTTY;
      const { settingsPath, key } = await injectSettings(mcpPath, apiName, {
        force: opts.force,
        nonInteractive,
        confirmOverwrite: nonInteractive ? undefined : async (nsKey) => {
          const { createInterface } = await import("node:readline");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise(res => rl.question(`"${nsKey}" already exists in settings.json. Overwrite? [y/N]: `, res));
          rl.close();
          return /^y(es)?$/i.test(answer.trim());
        },
      });
      console.log(`Settings:   ${settingsPath}`);
      console.log(`  -> MCP server "${key}" registered.`);
    } catch (err) {
      console.error(`Settings:   ${err.message}`);
    }
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

  // Init: interactive wizard
  if (cmd === "init") {
    const { runInitWizard } = await import("../src/init-wizard.js");
    const config = await runInitWizard();
    if (config) {
      console.log(`\n  Generating ${config.name}...`);
      // Write .env if auth was provided
      if (Object.keys(config.envVars).length > 0) {
        const outputDir = resolve(opts.output || `.ay/apis/${config.name}`);
        mkdirSync(outputDir, { recursive: true });
        const envLines = Object.entries(config.envVars).map(([k, v]) => `${k}=${v}`);
        writeFileSync(resolve(outputDir, ".env"), envLines.join("\n") + "\n", "utf-8");
      }
      await cmdGenerate(config.source, { ...opts, name: config.name });
    }
    return;
  }

  // Discover: auto-find OpenAPI specs on a domain
  if (cmd === "discover") {
    const domain = opts.positional[1];
    if (!domain) { console.error("Usage: ay-api-gen discover <domain>"); process.exit(1); }
    const { discover } = await import("../src/discover.js");
    console.log(`\nSearching for OpenAPI specs on ${domain}...\n`);
    const results = await discover(domain, { verbose: opts.verbose });
    if (results.length === 0) {
      console.log("  No specs found. Try providing the URL directly.");
    } else {
      console.log(`  Found ${results.length} spec(s):\n`);
      for (const r of results) {
        console.log(`  ${r.title} (${r.version}) — ${r.endpoints} endpoints`);
        console.log(`    ${r.url}`);
        console.log(`    Generate: ay-api-gen ${r.url}\n`);
      }
    }
    return;
  }

  // Diff: compare two spec versions
  if (cmd === "diff") {
    const oldSpec = opts.positional[1];
    const newSpec = opts.positional[2];
    if (!oldSpec || !newSpec) { console.error("Usage: ay-api-gen diff <old-spec> <new-spec>"); process.exit(1); }
    const { runDiff, printDiff } = await import("../src/diff.js");
    const result = await runDiff(oldSpec, newSpec);
    printDiff(result);
    return;
  }

  // Audit: free T0 static spec-lint baseline (ADR-010). No license, no network
  // probing beyond fetching the spec itself, no code generation.
  if (cmd === "audit") {
    const specSource = opts.positional[1];
    if (!specSource) { console.error("Usage: ay-api-gen audit --baseline <spec-url-or-file>"); process.exit(1); }

    const { loadSpec, extractEndpoints } = await import("../src/parser.js");
    const { lintSpec, printLintFindings, parseAcceptRisks } = await import("../src/spec-linter.js");

    const spec = await loadSpec(specSource);
    const parsed = extractEndpoints(spec);

    console.log(`\nay-api-gen audit --baseline (T0 static analysis, free)\n`);
    console.log(`  API: ${parsed.info.title || specSource} (${parsed.endpoints.length} endpoints)`);

    const findings = lintSpec(parsed);
    if (findings.length === 0) {
      console.log(`\n  No T0 findings. ${parsed.endpoints.length} endpoint(s) checked.\n`);
      return;
    }

    printLintFindings(findings);
    console.log();

    if (opts.mode === "b") {
      const accepted = parseAcceptRisks(opts.acceptRisks);
      const blocking = findings.filter(f =>
        (f.severity === "high" || f.severity === "critical") &&
        !accepted.has(`${f.id}:${f.endpointSlug}`)
      );
      if (blocking.length > 0) {
        console.error(`[spec-lint] ${blocking.length} blocking finding(s) in --mode=b. Pass --accept-risks=<id>:<endpoint-slug>,... to override.`);
        process.exit(1);
      }
    }
    return;
  }

  // Doctor: health check all registered APIs
  if (cmd === "doctor") {
    const { runDoctor, printDoctorResults } = await import("../src/doctor.js");
    const results = await runDoctor();
    printDoctorResults(results);
    const hasFail = results.apis?.some(a => a.checks.some(c => c.status === "fail"));
    process.exit(hasFail ? 1 : 0);
  }

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
