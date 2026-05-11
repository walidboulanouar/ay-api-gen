/**
 * Doctor — Health check for all registered APIs.
 *
 * Tests:
 * 1. Spec source is reachable/readable
 * 2. Spec parses without errors
 * 3. Base URL is reachable
 * 4. Auth is configured (env vars present)
 * 5. A safe GET endpoint returns non-401/403
 */

import { loadSpec, extractEndpoints } from "./parser.js";
import { listAPIs } from "./registry.js";

/**
 * Find a safe GET endpoint to test (no required path params, no side effects).
 */
function findSafeEndpoint(endpoints) {
  // Prefer GET endpoints with no required path params
  const safe = endpoints.filter(ep => {
    if (ep.method !== "GET") return false;
    const hasRequiredPath = ep.parameters.some(p => p.in === "path" && p.required);
    return !hasRequiredPath;
  });
  return safe[0] || null;
}

/**
 * Build auth headers from env for a given set of security schemes.
 */
function buildAuthHeaders(securitySchemes) {
  const headers = { "Content-Type": "application/json" };
  for (const s of Object.values(securitySchemes || {})) {
    if (s.type === "http" && s.scheme === "bearer") {
      const t = process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN;
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }
    if (s.type === "http" && s.scheme === "basic" && process.env.API_USERNAME && process.env.API_PASSWORD) {
      headers["Authorization"] = `Basic ${Buffer.from(process.env.API_USERNAME + ":" + process.env.API_PASSWORD).toString("base64")}`;
    }
    if (s.type === "apiKey" && s.in === "header" && process.env.API_KEY) {
      headers[s.paramName] = process.env.API_KEY;
    }
    if (s.type === "oauth2" && process.env.OAUTH_ACCESS_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.OAUTH_ACCESS_TOKEN}`;
    }
  }
  if (!headers["Authorization"] && process.env.API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.API_KEY}`;
  }
  return headers;
}

/**
 * Check what auth env vars are set for the detected schemes.
 */
function checkAuthEnv(securitySchemes) {
  const schemes = Object.values(securitySchemes || {});
  if (schemes.length === 0) return { configured: true, detail: "no auth required" };

  for (const s of schemes) {
    if (s.type === "http" && s.scheme === "bearer") {
      if (process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN) {
        return { configured: true, detail: "bearer token set" };
      }
      return { configured: false, detail: "missing API_BEARER_TOKEN or API_KEY" };
    }
    if (s.type === "http" && s.scheme === "basic") {
      if (process.env.API_USERNAME && process.env.API_PASSWORD) {
        return { configured: true, detail: "basic auth set" };
      }
      return { configured: false, detail: "missing API_USERNAME / API_PASSWORD" };
    }
    if (s.type === "apiKey") {
      if (process.env.API_KEY) return { configured: true, detail: `API_KEY set for ${s.paramName}` };
      return { configured: false, detail: `missing API_KEY for ${s.paramName}` };
    }
    if (s.type === "oauth2") {
      if (process.env.OAUTH_ACCESS_TOKEN) return { configured: true, detail: "OAuth token set" };
      if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET) return { configured: true, detail: "OAuth client creds set" };
      return { configured: false, detail: "missing OAUTH_ACCESS_TOKEN" };
    }
  }
  return { configured: true, detail: "unknown scheme" };
}

/**
 * Run doctor checks for a single API.
 * @returns {object} { name, checks: [{ name, status, detail }] }
 */
async function checkAPI(api) {
  const checks = [];

  // 1. Spec reachable
  let spec, parsed;
  try {
    spec = await loadSpec(api.source);
    checks.push({ name: "spec reachable", status: "pass", detail: api.source });
  } catch (err) {
    checks.push({ name: "spec reachable", status: "fail", detail: err.message });
    return { name: api.name, checks };
  }

  // 2. Spec parses
  try {
    parsed = extractEndpoints(spec);
    checks.push({ name: "spec parses", status: "pass", detail: `${parsed.endpoints.length} endpoints` });
  } catch (err) {
    checks.push({ name: "spec parses", status: "fail", detail: err.message });
    return { name: api.name, checks };
  }

  // 3. Auth configured
  const auth = checkAuthEnv(parsed.securitySchemes);
  checks.push({
    name: "auth configured",
    status: auth.configured ? "pass" : "warn",
    detail: auth.detail,
  });

  // 4. Base URL reachable
  const baseUrl = process.env.API_BASE_URL || parsed.baseUrl;
  try {
    const res = await fetch(baseUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    checks.push({ name: "base URL reachable", status: "pass", detail: `${baseUrl} -> ${res.status}` });
  } catch (err) {
    checks.push({ name: "base URL reachable", status: "warn", detail: `${baseUrl} -> ${err.message}` });
  }

  // 5. Safe endpoint test
  const safeEp = findSafeEndpoint(parsed.endpoints);
  if (safeEp) {
    try {
      const url = baseUrl.replace(/\/$/, "") + safeEp.path;
      const headers = buildAuthHeaders(parsed.securitySchemes);
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401 || res.status === 403) {
        checks.push({ name: "API responds", status: "fail", detail: `${safeEp.path} -> ${res.status} (auth rejected)` });
      } else {
        checks.push({ name: "API responds", status: "pass", detail: `${safeEp.path} -> ${res.status}` });
      }
    } catch (err) {
      checks.push({ name: "API responds", status: "warn", detail: `${safeEp.path} -> ${err.message}` });
    }
  } else {
    checks.push({ name: "API responds", status: "skip", detail: "no safe GET endpoint to test" });
  }

  return { name: api.name, checks };
}

/**
 * Run doctor on all registered APIs.
 * @returns {Array<{name, checks}>}
 */
export async function runDoctor() {
  const apis = listAPIs();

  if (apis.length === 0) {
    return { apis: [], summary: "No APIs registered. Run: ay-api-gen <spec-url-or-file>" };
  }

  const results = [];
  for (const api of apis) {
    const result = await checkAPI(api);
    results.push(result);
  }

  // Summary
  let totalChecks = 0, passed = 0, failed = 0, warned = 0;
  for (const r of results) {
    for (const c of r.checks) {
      totalChecks++;
      if (c.status === "pass") passed++;
      else if (c.status === "fail") failed++;
      else if (c.status === "warn") warned++;
    }
  }

  return {
    apis: results,
    summary: `${passed}/${totalChecks} checks passed` +
      (failed > 0 ? `, ${failed} failed` : "") +
      (warned > 0 ? `, ${warned} warnings` : ""),
  };
}

/**
 * Print doctor results to console with colors.
 */
export function printDoctorResults(results) {
  const green = "\x1b[32m";
  const red = "\x1b[31m";
  const yellow = "\x1b[33m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  const icons = {
    pass: `${green}+${reset}`,
    fail: `${red}x${reset}`,
    warn: `${yellow}!${reset}`,
    skip: `${dim}-${reset}`,
  };

  if (results.apis.length === 0) {
    console.log(results.summary);
    return;
  }

  console.log("\nay-api-gen doctor\n");

  for (const api of results.apis) {
    console.log(`  ${api.name}`);
    for (const check of api.checks) {
      const icon = icons[check.status] || "?";
      console.log(`    ${icon} ${check.name}: ${dim}${check.detail}${reset}`);
    }
    console.log();
  }

  console.log(`  ${results.summary}\n`);
}
