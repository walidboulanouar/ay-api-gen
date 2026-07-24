/**
 * Settings Injector.
 * Adds generated MCP server to Claude Code's settings.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

const NAMESPACE = "ay-api-gen:";

/**
 * Sanitize a spec-derived name for use as a settings.json key segment.
 */
function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/**
 * Inject MCP server config into settings.json.
 * Tries project-local .claude/settings.json first, falls back to ~/.claude/settings.json.
 *
 * Writes under the `ay-api-gen:<name>` namespace (ADR-008) rather than the
 * bare name — a malicious spec named e.g. "github" must not be able to
 * silently shadow (and inherit the env/credentials of) an existing
 * `mcpServers.github` entry from another tool.
 *
 * @param {string} serverPath - Absolute path to generated MCP server file
 * @param {string} name - Server name (spec-derived, untrusted)
 * @param {object} options - { projectDir, force, nonInteractive, confirmOverwrite }
 * @returns {{ settingsPath: string, key: string }}
 */
export function injectSettings(serverPath, name, options = {}) {
  const projectDir = options.projectDir || process.cwd();

  // Try project-local settings first
  const localSettingsDir = resolve(projectDir, ".claude");
  const localSettingsPath = resolve(localSettingsDir, "settings.local.json");

  let settingsPath = localSettingsPath;
  let settings = {};

  // Read existing settings if they exist
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  // Ensure mcpServers section exists
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  const nsKey = NAMESPACE + sanitize(name);
  const unprefixedExists = Object.prototype.hasOwnProperty.call(settings.mcpServers, name);
  const nsExists = Object.prototype.hasOwnProperty.call(settings.mcpServers, nsKey);

  if (unprefixedExists && !options.force) {
    throw new Error(
      `Refusing to write: an entry "${name}" exists in settings.json from another source.\n` +
      `Pass --force to overwrite, or rename your spec.`
    );
  }

  if (nsExists && !options.force) {
    if (options.nonInteractive) {
      throw new Error(`"${nsKey}" already exists. Pass --force to overwrite.`);
    }
    const confirmed = options.confirmOverwrite ? options.confirmOverwrite(nsKey) : false;
    if (!confirmed) {
      throw new Error(`Aborted: "${nsKey}" already exists. Pass --force to overwrite.`);
    }
  }

  // Add the MCP server config under the namespaced key
  settings.mcpServers[nsKey] = {
    command: "node",
    args: [serverPath],
    env: {},
  };

  // Write settings
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  return { settingsPath, key: nsKey };
}

/**
 * Read MCP server configs from settings.json.
 * @param {string} settingsPath - Path to settings.json
 * @returns {object} mcpServers config
 */
export function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) {
    throw new Error(`Settings file not found: ${settingsPath}`);
  }
  const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  return settings.mcpServers || {};
}
