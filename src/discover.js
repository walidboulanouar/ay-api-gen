/**
 * API Discovery.
 * Given a domain, auto-find OpenAPI/Swagger specs by probing known paths.
 */

import { readCapped, MAX_SPEC_BYTES } from "./parser.js";

const PROBE_PATHS = [
  "/openapi.json",
  "/swagger.json",
  "/api-docs",
  "/api/openapi.json",
  "/api/swagger.json",
  "/v1/openapi.json",
  "/v2/openapi.json",
  "/v2/swagger.json",
  "/v3/openapi.json",
  "/api/v1/openapi.json",
  "/api/v2/swagger.json",
  "/api/v3/openapi.json",
  "/.well-known/openapi",
  "/.well-known/openapi.json",
  "/docs/openapi.json",
  "/docs/swagger.json",
  "/swagger/v1/swagger.json",
  "/api-docs/swagger.json",
  "/spec.json",
];

/**
 * Normalize a domain input to a base URL.
 * "stripe.com" -> "https://stripe.com"
 * "https://api.example.com" -> "https://api.example.com"
 */
function normalizeBase(input) {
  let base = input.trim();
  if (!base.startsWith("http://") && !base.startsWith("https://")) base = "https://" + base;
  return base.replace(/\/$/, "");
}

/**
 * Check if a URL returns an OpenAPI/Swagger spec.
 */
async function probeUrl(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json") && !contentType.includes("yaml") && !contentType.includes("text")) {
      return null;
    }

    const text = await readCapped(res, MAX_SPEC_BYTES);
    try {
      const json = JSON.parse(text);
      // Check if it looks like an OpenAPI/Swagger spec
      if (json.swagger || json.openapi) {
        return {
          url,
          title: json.info?.title || "Unknown API",
          version: json.openapi || json.swagger,
          endpoints: Object.keys(json.paths || {}).length,
        };
      }
    } catch {
      // Not JSON, could be YAML — check for openapi: or swagger: at start
      if (text.match(/^(openapi|swagger):/m)) {
        return {
          url,
          title: "Unknown API (YAML)",
          version: "unknown",
          endpoints: 0,
          isYaml: true,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Discover OpenAPI specs for a domain.
 * @param {string} domain - Domain or URL to probe
 * @param {object} opts - { verbose }
 * @returns {Promise<Array<{url, title, version, endpoints}>>}
 */
export async function discover(domain, opts = {}) {
  const base = normalizeBase(domain);
  const results = [];
  const verbose = opts.verbose || false;

  // Also try common API subdomains
  const bases = [base];
  try {
    const url = new URL(base);
    if (!url.hostname.startsWith("api.")) {
      bases.push(`https://api.${url.hostname}`);
    }
  } catch { /* ignore */ }

  for (const b of bases) {
    // Probe paths in batches of 5 to avoid rate limiting
    for (let i = 0; i < PROBE_PATHS.length; i += 5) {
      const batch = PROBE_PATHS.slice(i, i + 5).map(path => {
        const url = b + path;
        if (verbose) process.stderr.write(`  probing ${url}\n`);
        return probeUrl(url).then(r => r ? { ...r, probed: url } : null);
      });

      const batchResults = await Promise.all(batch);
      for (const r of batchResults) {
        if (r) results.push(r);
      }

      // If we found something, no need to probe more paths on this base
      if (results.length > 0) break;
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
