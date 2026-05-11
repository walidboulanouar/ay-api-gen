/**
 * Spec Diff.
 * Compare two OpenAPI specs and show what tools changed/added/removed.
 */

import { loadSpec, extractEndpoints } from "./parser.js";

/**
 * Diff two parsed endpoint lists.
 * @param {Array} oldEndpoints
 * @param {Array} newEndpoints
 * @returns {{ added, removed, changed }}
 */
function diffEndpoints(oldEndpoints, newEndpoints) {
  const oldMap = new Map(oldEndpoints.map(e => [e.toolName, e]));
  const newMap = new Map(newEndpoints.map(e => [e.toolName, e]));

  const added = [];
  const removed = [];
  const changed = [];

  // Find added and changed
  for (const [name, ep] of newMap) {
    if (!oldMap.has(name)) {
      added.push(ep);
    } else {
      const old = oldMap.get(name);
      const changes = [];

      // Check path change
      if (old.path !== ep.path) changes.push(`path: ${old.path} -> ${ep.path}`);
      if (old.method !== ep.method) changes.push(`method: ${old.method} -> ${ep.method}`);

      // Check params
      const oldParams = old.parameters.map(p => p.name).sort().join(",");
      const newParams = ep.parameters.map(p => p.name).sort().join(",");
      if (oldParams !== newParams) changes.push(`params: [${oldParams}] -> [${newParams}]`);

      // Check body
      const oldBodyKeys = Object.keys(old.requestBody?.schema?.properties || {}).sort().join(",");
      const newBodyKeys = Object.keys(ep.requestBody?.schema?.properties || {}).sort().join(",");
      if (oldBodyKeys !== newBodyKeys) changes.push(`body: [${oldBodyKeys}] -> [${newBodyKeys}]`);

      // Check summary
      if (old.summary !== ep.summary) changes.push(`summary changed`);

      if (changes.length > 0) {
        changed.push({ tool: name, changes, oldEp: old, newEp: ep });
      }
    }
  }

  // Find removed
  for (const [name, ep] of oldMap) {
    if (!newMap.has(name)) {
      removed.push(ep);
    }
  }

  return { added, removed, changed };
}

/**
 * Run a diff between two specs.
 * @param {string} oldSource - URL or path to old spec
 * @param {string} newSource - URL or path to new spec
 * @returns {Promise<object>}
 */
export async function runDiff(oldSource, newSource) {
  const oldSpec = await loadSpec(oldSource);
  const newSpec = await loadSpec(newSource);

  const oldParsed = extractEndpoints(oldSpec);
  const newParsed = extractEndpoints(newSpec);

  const diff = diffEndpoints(oldParsed.endpoints, newParsed.endpoints);

  return {
    old: { source: oldSource, title: oldParsed.info.title, count: oldParsed.endpoints.length },
    new: { source: newSource, title: newParsed.info.title, count: newParsed.endpoints.length },
    ...diff,
  };
}

/**
 * Print diff results to console.
 */
export function printDiff(result) {
  const green = "\x1b[32m";
  const red = "\x1b[31m";
  const yellow = "\x1b[33m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  console.log(`\nay-api-gen diff\n`);
  console.log(`  Old: ${result.old.title || result.old.source} (${result.old.count} endpoints)`);
  console.log(`  New: ${result.new.title || result.new.source} (${result.new.count} endpoints)\n`);

  if (result.added.length === 0 && result.removed.length === 0 && result.changed.length === 0) {
    console.log("  No changes detected.\n");
    return;
  }

  if (result.added.length > 0) {
    console.log(`  ${green}+ Added (${result.added.length}):${reset}`);
    for (const ep of result.added) {
      console.log(`    ${green}+${reset} ${ep.method.padEnd(7)} ${ep.path.padEnd(35)} ${ep.toolName}`);
    }
    console.log();
  }

  if (result.removed.length > 0) {
    console.log(`  ${red}- Removed (${result.removed.length}):${reset}`);
    for (const ep of result.removed) {
      console.log(`    ${red}-${reset} ${ep.method.padEnd(7)} ${ep.path.padEnd(35)} ${ep.toolName}`);
    }
    console.log();
  }

  if (result.changed.length > 0) {
    console.log(`  ${yellow}~ Changed (${result.changed.length}):${reset}`);
    for (const c of result.changed) {
      console.log(`    ${yellow}~${reset} ${c.tool}`);
      for (const change of c.changes) {
        console.log(`      ${dim}${change}${reset}`);
      }
    }
    console.log();
  }

  console.log(`  Summary: ${green}+${result.added.length}${reset} ${red}-${result.removed.length}${reset} ${yellow}~${result.changed.length}${reset}\n`);
}
