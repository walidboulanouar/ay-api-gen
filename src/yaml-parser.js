/**
 * YAML parsing for OpenAPI specs.
 *
 * Thin compatibility wrapper around the `yaml` npm package
 * (https://www.npmjs.com/package/yaml), which is exact-pinned in
 * package.json. This module used to be a hand-rolled, deliberately
 * minimal YAML subset parser; it now just delegates to the real,
 * spec-compliant parser and preserves the original contract:
 *
 *   - Same exported signature: parseYaml(yamlString) -> object|null
 *   - Never throws. Any parse failure (malformed YAML, multi-document
 *     input without an explicit document selector, duplicate map keys,
 *     tabs used for indentation, etc.) results in `null`, not an
 *     exception, so callers (see src/parser.js's loadSpec()) can rely
 *     on try/catch-free null-checking.
 */

import { parse } from "yaml";

/**
 * Parse a YAML string into a JavaScript object.
 * @param {string} yaml
 * @returns {object|null} parsed object, or null if parsing fails
 */
export function parseYaml(yaml) {
  if (!yaml || typeof yaml !== "string") return null;

  try {
    const result = parse(yaml);
    return result === undefined ? null : result;
  } catch {
    return null;
  }
}
