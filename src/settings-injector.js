/**
 * Settings Injector.
 * Adds generated MCP server to Claude Code's settings.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Inject MCP server config into settings.json.
 * Tries project-local .claude/settings.json first, falls back to ~/.claude/settings.json.
 * @param {string} serverPath - Absolute path to generated MCP server file
 * @param {string} name - Server name
 * @param {object} options - { projectDir }
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

  // Add the MCP server config
  settings.mcpServers[name] = {
    command: "node",
    args: [serverPath],
    env: {},
  };

  // Write settings
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  return settingsPath;
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
