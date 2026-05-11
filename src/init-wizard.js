/**
 * Interactive Init Wizard.
 * Guides users through: spec source -> auth detection -> .env -> generate -> register.
 * Uses only Node.js readline (zero deps).
 */

import { createInterface } from "node:readline";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { discover } from "./discover.js";
import { loadSpec, extractEndpoints } from "./parser.js";
import { validateSpec } from "./validator.js";
import { generateEnvExample } from "./env-generator.js";

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

/**
 * Run the interactive init wizard.
 * @returns {Promise<{source, name, apiKey}>} config for generation
 */
export async function runInitWizard() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nay-api-gen init — Connect any API to Claude Code\n");

  // Step 1: Get spec source
  let source;
  const sourceType = await ask(rl, "  How do you want to provide the API spec?\n  1) URL to OpenAPI/Swagger spec\n  2) Local file path\n  3) Auto-discover from domain\n  Choice [1]: ");

  if (sourceType === "3") {
    const domain = await ask(rl, "  Domain (e.g., petstore.swagger.io): ");
    if (!domain) { rl.close(); return null; }

    console.log(`  Searching for OpenAPI specs on ${domain}...`);
    const found = await discover(domain);

    if (found.length === 0) {
      console.log("  No specs found. Try providing the URL directly.");
      rl.close();
      return null;
    }

    console.log(`\n  Found ${found.length} spec(s):`);
    found.forEach((f, i) => {
      console.log(`  ${i + 1}) ${f.title} (${f.version}) — ${f.endpoints} endpoints`);
      console.log(`     ${f.url}`);
    });
    console.log();

    const pick = await ask(rl, `  Which one? [1]: `);
    const idx = Math.max(0, parseInt(pick || "1", 10) - 1);
    source = found[idx]?.url;
    if (!source) { console.log("  Invalid choice."); rl.close(); return null; }
  } else if (sourceType === "2") {
    source = await ask(rl, "  File path: ");
    if (!source || !existsSync(resolve(source))) {
      console.log("  File not found.");
      rl.close();
      return null;
    }
  } else {
    source = await ask(rl, "  Spec URL: ");
    if (!source) { rl.close(); return null; }
  }

  // Step 2: Load and validate
  console.log(`\n  Loading spec: ${source}`);
  let spec, parsed;
  try {
    spec = await loadSpec(source);
    const validation = validateSpec(spec);
    if (!validation.valid) {
      console.log("  Spec has errors:");
      validation.errors.forEach(e => console.log(`    - ${e}`));
      rl.close();
      return null;
    }
    parsed = extractEndpoints(spec);
  } catch (err) {
    console.log(`  Failed: ${err.message}`);
    rl.close();
    return null;
  }

  console.log(`  API: ${parsed.info.title || "Unknown"} (${parsed.endpoints.length} endpoints)`);
  console.log(`  Base URL: ${parsed.baseUrl}`);

  // Step 3: Name
  const defaultName = parsed.info.title?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().replace(/-+/g, "-") || "api";
  const name = await ask(rl, `\n  API name [${defaultName}]: `) || defaultName;

  // Step 4: Auth detection
  const schemes = Object.values(parsed.securitySchemes || {});
  let envVars = {};

  if (schemes.length > 0) {
    console.log("\n  Detected auth:");
    for (const s of schemes) {
      if (s.type === "http" && s.scheme === "bearer") {
        console.log("    - Bearer token");
        const token = await ask(rl, "  API_KEY or Bearer token (or press Enter to skip): ");
        if (token) envVars.API_KEY = token;
      } else if (s.type === "http" && s.scheme === "basic") {
        console.log("    - Basic auth");
        const user = await ask(rl, "  Username: ");
        const pass = await ask(rl, "  Password: ");
        if (user) envVars.API_USERNAME = user;
        if (pass) envVars.API_PASSWORD = pass;
      } else if (s.type === "apiKey") {
        console.log(`    - API Key (${s.in}: ${s.paramName})`);
        const key = await ask(rl, `  API_KEY for ${s.paramName}: `);
        if (key) envVars.API_KEY = key;
      } else if (s.type === "oauth2") {
        console.log("    - OAuth2");
        const token = await ask(rl, "  OAUTH_ACCESS_TOKEN (or press Enter to skip): ");
        if (token) envVars.OAUTH_ACCESS_TOKEN = token;
      }
    }
  } else {
    console.log("\n  No auth detected.");
    const key = await ask(rl, "  API key (if needed, or press Enter to skip): ");
    if (key) envVars.API_KEY = key;
  }

  rl.close();

  return { source, name, envVars, parsed };
}
