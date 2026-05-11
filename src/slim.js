/**
 * Smart Tool Pruning.
 * Reduces a large spec to essential tools within a token budget.
 * Heuristics: drop deprecated, prioritize CRUD, remove duplicates, limit by tag.
 */

/**
 * Estimate token count for a tool definition.
 * Rough estimate: tool name + description + params schema ~ chars/4.
 */
function estimateToolTokens(endpoint) {
  let chars = endpoint.toolName.length + (endpoint.summary?.length || 0);
  for (const p of endpoint.parameters) {
    chars += p.name.length + (p.description?.length || 0) + 20;
  }
  if (endpoint.requestBody?.schema?.properties) {
    for (const [k, v] of Object.entries(endpoint.requestBody.schema.properties)) {
      chars += k.length + (v.description?.length || 0) + 20;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Score an endpoint by importance.
 * Higher = more important = keep.
 */
function scoreEndpoint(ep) {
  let score = 50;

  // CRUD operations are core
  if (ep.method === "GET") score += 20;
  if (ep.method === "POST") score += 15;
  if (ep.method === "PUT" || ep.method === "PATCH") score += 10;
  if (ep.method === "DELETE") score += 10;

  // HEAD/OPTIONS are low value
  if (ep.method === "HEAD" || ep.method === "OPTIONS") score -= 30;

  // List endpoints (no path params on last segment) are high value
  const hasPathParam = ep.path.endsWith("}");
  if (ep.method === "GET" && !hasPathParam) score += 15;

  // Short paths = top-level resources = more important
  const depth = ep.path.split("/").filter(Boolean).length;
  score -= depth * 3;

  // Has a description = better documented = more useful
  if (ep.description && ep.description.length > 20) score += 5;

  // Deprecated = drop
  if (ep.summary?.toLowerCase().includes("deprecated")) score -= 50;
  if (ep.description?.toLowerCase().includes("deprecated")) score -= 50;

  return score;
}

/**
 * Prune endpoints to fit within a token budget.
 * @param {Array} endpoints - Parsed endpoints
 * @param {object} opts - { tokenBudget, maxTools }
 * @returns {{ kept: Array, dropped: Array, totalTokens: number }}
 */
export function pruneEndpoints(endpoints, opts = {}) {
  const tokenBudget = opts.tokenBudget || 8000;
  const maxTools = opts.maxTools || 50;

  // Score and sort
  const scored = endpoints.map(ep => ({
    ...ep,
    score: scoreEndpoint(ep),
    tokens: estimateToolTokens(ep),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Greedy pick within budget
  const kept = [];
  const dropped = [];
  let totalTokens = 0;

  for (const ep of scored) {
    if (kept.length >= maxTools) {
      dropped.push(ep);
      continue;
    }
    if (totalTokens + ep.tokens > tokenBudget) {
      dropped.push(ep);
      continue;
    }
    kept.push(ep);
    totalTokens += ep.tokens;
  }

  return { kept, dropped, totalTokens };
}

/**
 * Print slim results.
 */
export function printSlimResults(result, originalCount) {
  const green = "\x1b[32m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  console.log(`\n  Smart pruning: ${originalCount} -> ${green}${result.kept.length}${reset} tools (~${result.totalTokens} tokens)`);
  if (result.dropped.length > 0) {
    console.log(`  ${dim}Dropped ${result.dropped.length} lower-priority tools${reset}`);
  }
}
