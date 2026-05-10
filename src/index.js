/**
 * ay-api-gen — Main module exports.
 */

export { loadSpec, extractEndpoints, deriveToolName, deriveCLICommand } from "./parser.js";
export { generateMCPServer } from "./mcp-generator.js";
export { generateCLI } from "./cli-generator.js";
export { injectSettings, readSettings } from "./settings-injector.js";
export { readMCPTools, generateOpenAPIFromTools } from "./reverse.js";
export { generateAuthCode, generateEnvDocs } from "./auth-codegen.js";
export { generateEnvExample } from "./env-generator.js";
export { validateSpec } from "./validator.js";
export { loadRegistry, registerAPI, unregisterAPI, listAPIs } from "./registry.js";
