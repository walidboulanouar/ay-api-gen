/**
 * Spec Linter — T0 static baseline (ADR-006 §3).
 * Warn-only by default (mode a); mode b blocks generation on HIGH/CRITICAL
 * findings unless explicitly accepted via --accept-risks.
 */

const SENSITIVE_PATH_PATTERNS = [
  { re: /ssn|social[_-]?security/i, severity: "high" },
  { re: /credit[_-]?card/i, severity: "high" },
  { re: /password/i, severity: "high" },
  { re: /token/i, severity: "high" },
  { re: /secret/i, severity: "high" },
  { re: /api[_-]?key/i, severity: "high" },
  { re: /email/i, severity: "medium" },
];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// T-API-3: request-body field names that commonly gate privilege/value and
// have no legitimate reason to be client-settable unless explicitly marked
// readOnly (which would mean the field only ever appears in *responses* —
// OpenAPI reuses the same schema for request/response bodies, so a
// writable-looking `role`/`balance` field here is a mass-assignment smell).
const MASS_ASSIGNMENT_FIELD_PATTERNS = [
  /^is[_-]?admin$/i, /^admin$/i,
  /^role(s)?$/i,
  /^permission(s)?$/i,
  /^privilege(s)?$/i,
  /^balance$/i,
  /^credit(s)?$/i,
  /^is[_-]?verified$/i, /^verified$/i,
  /^is[_-]?superuser$/i, /^superuser$/i,
  /^account[_-]?type$/i,
];

/**
 * @param {object} ep - endpoint from extractEndpoints()
 * @returns {string} stable slug for --accept-risks matching, e.g. "POST_charge"
 */
export function endpointSlug(ep) {
  if (typeof ep === "string") return ep;
  const path = (ep.path || "").replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${ep.method}_${path}`;
}

function checkApi1_UnauthMutating(parsed) {
  const findings = [];
  const specHasSecuritySchemes = Object.keys(parsed.securitySchemes || {}).length > 0;

  for (const ep of parsed.endpoints) {
    if (!MUTATING_METHODS.has(ep.method)) continue;

    const security = ep.security;
    const hasNoSecurity = !security || security.length === 0;
    if (!hasNoSecurity) continue;

    const endpointLabel = `${ep.method} ${ep.path}`;
    if (specHasSecuritySchemes) {
      // Deliberate opt-out via `security: []` on an otherwise-secured spec.
      findings.push({
        id: "T-API-1",
        severity: "medium",
        endpoint: endpointLabel,
        endpointSlug: endpointSlug(ep),
        message: `Mutating endpoint "${endpointLabel}" explicitly opts out of the spec's security scheme(s) (security: []).`,
        remediation: "Confirm this is intentional (e.g. a webhook receiver). Otherwise add a `security:` requirement.",
      });
    } else {
      findings.push({
        id: "T-API-1",
        severity: "high",
        endpoint: endpointLabel,
        endpointSlug: endpointSlug(ep),
        message: `Mutating endpoint "${endpointLabel}" has no declared security requirement.`,
        remediation: "Add a `security:` requirement at the operation or spec level.",
      });
    }
  }

  return findings;
}

function checkApi2_SensitiveInPath(parsed) {
  const findings = [];

  for (const ep of parsed.endpoints) {
    for (const param of ep.parameters) {
      if (param.in !== "path") continue;
      for (const { re, severity } of SENSITIVE_PATH_PATTERNS) {
        if (re.test(param.name)) {
          const endpointLabel = `${ep.method} ${ep.path}`;
          findings.push({
            id: "T-API-2",
            severity,
            endpoint: endpointLabel,
            endpointSlug: endpointSlug(ep),
            message: `Path param "${param.name}" on "${endpointLabel}" matches a sensitive-identifier pattern.`,
            remediation: "Move the identifier to the request body or use an opaque ID instead.",
          });
          break; // one finding per param is enough
        }
      }
    }
  }

  return findings;
}

function checkApi4_SensitiveInQuery(parsed) {
  const findings = [];

  for (const ep of parsed.endpoints) {
    for (const param of ep.parameters) {
      if (param.in !== "query") continue;
      for (const { re, severity } of SENSITIVE_PATH_PATTERNS) {
        if (re.test(param.name)) {
          const endpointLabel = `${ep.method} ${ep.path}`;
          findings.push({
            id: "T-API-4",
            severity,
            endpoint: endpointLabel,
            endpointSlug: endpointSlug(ep),
            message: `Query param "${param.name}" on "${endpointLabel}" matches a sensitive-identifier pattern — query strings land in server logs, browser history, and Referer headers.`,
            remediation: "Move the value to the request body or an Authorization header instead of a query parameter.",
          });
          break; // one finding per param is enough
        }
      }
    }
  }

  return findings;
}

/**
 * T-API-5: the spec's global security posture, not per-endpoint. Two
 * distinct sub-smells: (a) zero security schemes declared anywhere — a
 * genuinely open API, which may be intentional (a public read-only demo
 * spec) so kept low severity; (b) the ONLY declared scheme is HTTP Basic
 * AND the base URL is unencrypted `http://` — basic auth sends
 * base64-encoded (trivially decoded, not encrypted) credentials on every
 * request, so doing that over plaintext HTTP is a real, well-known
 * credential-exposure anti-pattern, kept high severity.
 *
 * Complements rather than duplicates T-API-1: T-API-1 only fires on
 * mutating endpoints with no security *requirement*; an all-GET spec with
 * zero auth, or a spec whose declared scheme is itself weak, triggers no
 * T-API-1 finding at all.
 */
function checkApi5_WeakGlobalAuth(parsed) {
  const findings = [];
  const schemes = Object.values(parsed.securitySchemes || {});
  const specLabel = "(spec-wide)";
  const specSlug = "SPEC";

  if (schemes.length === 0) {
    findings.push({
      id: "T-API-5",
      severity: "low",
      endpoint: specLabel,
      endpointSlug: `${specSlug}_no_auth_schemes`,
      message: "No security schemes are declared anywhere in the spec.",
      remediation: "Confirm this is intentional (a public/read-only API). Otherwise declare a security scheme in `components.securitySchemes`.",
    });
  } else if (
    schemes.every((s) => s.type === "http" && s.scheme === "basic") &&
    typeof parsed.baseUrl === "string" && parsed.baseUrl.startsWith("http://")
  ) {
    findings.push({
      id: "T-API-5",
      severity: "high",
      endpoint: specLabel,
      endpointSlug: `${specSlug}_basic_auth_over_http`,
      message: `The only declared auth scheme is HTTP Basic, and the base URL ("${parsed.baseUrl}") is unencrypted http://. Basic auth credentials are base64-encoded, not encrypted — sending them over plaintext HTTP exposes them to anyone on the network path.`,
      remediation: "Use https:// for the base URL, or switch to a scheme that doesn't transmit reusable credentials on every request (Bearer token, OAuth2).",
    });
  }

  return findings;
}

function checkApi3_MassAssignment(parsed) {
  const findings = [];

  for (const ep of parsed.endpoints) {
    if (!MUTATING_METHODS.has(ep.method)) continue;

    const props = ep.requestBody?.schema?.properties;
    if (!props) continue;

    for (const [key, propSchema] of Object.entries(props)) {
      if (propSchema?.readOnly === true) continue; // response-only per the spec's own schema

      if (MASS_ASSIGNMENT_FIELD_PATTERNS.some((re) => re.test(key))) {
        const endpointLabel = `${ep.method} ${ep.path}`;
        findings.push({
          id: "T-API-3",
          severity: "medium",
          endpoint: endpointLabel,
          endpointSlug: endpointSlug(ep),
          message: `Request body field "${key}" on "${endpointLabel}" matches a privilege/value-sensitive name and is not marked readOnly.`,
          remediation: "Mark the field `readOnly: true` if clients should never set it, or move privilege/balance changes to a separate, more tightly-scoped endpoint.",
        });
      }
    }
  }

  return findings;
}

/**
 * T-API-6: no declared rate limiting anywhere in the spec — no endpoint
 * declares a 429 response, and no response declares a RateLimit- or
 * X-RateLimit-prefixed header. Lower severity than the other T-API checks:
 * this is primarily a cost/availability concern (an LLM-driven caller has
 * no signal to back off), not a credential or authorization issue, and
 * plenty of legitimately unlimited internal/low-traffic APIs will
 * correctly trigger it. Spec-wide, one finding — mirrors T-API-5's
 * spec-wide-not-per-endpoint shape, since "add rate limiting" isn't an
 * endpoint-by-endpoint fix.
 */
function checkApi6_NoRateLimit(parsed) {
  const findings = [];
  if (parsed.endpoints.length === 0) return findings;

  const anyEndpointDeclaresRateLimit = parsed.endpoints.some((ep) => ep.hasRateLimitSignal);
  if (!anyEndpointDeclaresRateLimit) {
    findings.push({
      id: "T-API-6",
      severity: "low",
      endpoint: "(spec-wide)",
      endpointSlug: "SPEC_no_rate_limit",
      message: "No endpoint declares a 429 response or a RateLimit-*/X-RateLimit-* header anywhere in the spec.",
      remediation: "If the upstream API does rate-limit, document it (a 429 response + RateLimit headers) so callers — including an LLM-driven MCP client — have a signal to back off instead of hammering the API on retry.",
    });
  }

  return findings;
}

/**
 * @param {object} parsed - Output from extractEndpoints()
 * @returns {Array<object>} findings
 */
export function lintSpec(parsed) {
  const findings = [];
  findings.push(...checkApi1_UnauthMutating(parsed));
  findings.push(...checkApi2_SensitiveInPath(parsed));
  findings.push(...checkApi3_MassAssignment(parsed));
  findings.push(...checkApi4_SensitiveInQuery(parsed));
  findings.push(...checkApi5_WeakGlobalAuth(parsed));
  findings.push(...checkApi6_NoRateLimit(parsed));
  return findings;
}

const SEVERITY_LABEL = { critical: "CRIT", high: "HIGH", medium: "MED ", low: "LOW ", info: "INFO" };

/**
 * Print findings in the CLI's summary format.
 * @param {Array<object>} findings
 */
export function printLintFindings(findings) {
  console.log(`\n[spec-lint] ${findings.length} finding(s):`);
  for (const f of findings) {
    const label = SEVERITY_LABEL[f.severity] || f.severity.toUpperCase();
    console.log(`  ${label}  ${f.id}  ${f.endpoint}   ${f.message}`);
    console.log(`  ${" ".repeat(label.length + f.id.length + 4)}→ ${f.remediation}`);
  }
}

/**
 * Parse a --accept-risks value into a Set of "<id>:<endpoint-slug>" strings.
 * @param {string|undefined} value - e.g. "T-API-1:POST_charge,T-API-2:GET_users_ssn_profile"
 * @returns {Set<string>}
 */
export function parseAcceptRisks(value) {
  if (!value) return new Set();
  return new Set(
    value.split(",").map(s => s.trim()).filter(Boolean)
  );
}
