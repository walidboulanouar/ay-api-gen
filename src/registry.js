/**
 * API Registry.
 * Tracks all generated APIs in .ay/apis/registry.json.
 * Supports listing, removing, and regenerating.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const REGISTRY_PATH = ".ay/apis/registry.json";

/**
 * Load the registry, creating it if it doesn't exist.
 * @param {string} projectDir
 * @returns {object} registry
 */
export function loadRegistry(projectDir = process.cwd()) {
  const path = resolve(projectDir, REGISTRY_PATH);
  if (!existsSync(path)) {
    return { apis: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { apis: {} };
  }
}

/**
 * Save the registry.
 * @param {object} registry
 * @param {string} projectDir
 */
export function saveRegistry(registry, projectDir = process.cwd()) {
  const path = resolve(projectDir, REGISTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(registry, null, 2) + "\n", "utf-8");
}

/**
 * Register a generated API.
 * @param {string} name
 * @param {object} config - { source, baseUrl, outputDir, endpointCount, authTypes, generatedAt }
 * @param {string} projectDir
 */
export function registerAPI(name, config, projectDir = process.cwd()) {
  const registry = loadRegistry(projectDir);
  registry.apis[name] = {
    ...config,
    generatedAt: new Date().toISOString(),
  };
  saveRegistry(registry, projectDir);
}

/**
 * Remove an API from the registry.
 * @param {string} name
 * @param {string} projectDir
 * @returns {boolean} true if found and removed
 */
export function unregisterAPI(name, projectDir = process.cwd()) {
  const registry = loadRegistry(projectDir);
  if (!registry.apis[name]) return false;
  delete registry.apis[name];
  saveRegistry(registry, projectDir);
  return true;
}

/**
 * List all registered APIs.
 * @param {string} projectDir
 * @returns {Array<{name, source, baseUrl, endpointCount, authTypes, generatedAt}>}
 */
export function listAPIs(projectDir = process.cwd()) {
  const registry = loadRegistry(projectDir);
  return Object.entries(registry.apis).map(([name, config]) => ({
    name,
    ...config,
  }));
}
