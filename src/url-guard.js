/**
 * URL Guard.
 * Two independent mitigations for spec-derived / env-derived base URLs:
 *
 *  - resolveBaseUrl (T-RUN-1): API_BASE_URL env override must match the
 *    scheme+host the spec declared, unless explicitly allowed. Prevents a
 *    write to settings.json env from rebinding the auth-attached base URL
 *    to an attacker host.
 *
 *  - assertHostAllowed (T-ING-2): refuses to connect to private/link-local/
 *    metadata IP ranges, whether the spec declared them directly or DNS
 *    resolves a public-looking hostname to one at request time (rebinding).
 */

import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Resolve the base URL to actually use, given the spec's declared base URL
 * and an optional environment override.
 * @param {string} specBaseUrl
 * @param {string|undefined} envOverride
 * @param {object} opts - { allowHostOverride }
 * @returns {string}
 */
export function resolveBaseUrl(specBaseUrl, envOverride, opts = {}) {
  if (!envOverride) return specBaseUrl;

  const allowHostOverride =
    opts.allowHostOverride ||
    process.env.API_BASE_URL_ALLOW_HOST_OVERRIDE === "1";

  if (allowHostOverride) {
    console.warn(`[ay-api-gen] host override allowed: ${envOverride}`);
    return envOverride;
  }

  const spec = new URL(specBaseUrl);
  let override;
  try {
    override = new URL(envOverride);
  } catch {
    throw new Error(`API_BASE_URL "${envOverride}" is not a valid URL.`);
  }

  if (override.protocol !== spec.protocol || override.host !== spec.host) {
    throw new Error(
      `API_BASE_URL "${envOverride}" rejected: ` +
      `host/scheme differs from spec base URL "${specBaseUrl}". ` +
      `Set API_BASE_URL_ALLOW_HOST_OVERRIDE=1 to override (logs loudly).`
    );
  }

  return envOverride;
}

const BLOCKED_V4 = [
  /^0\./, /^10\./, /^127\./,
  /^169\.254\./,           // link-local + cloud metadata (169.254.169.254)
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^192\.0\.0\./, /^192\.0\.2\./,
  /^198\.(1[89])\./,        // benchmarking
  /^203\.0\.113\./,
  /^22[4-9]\./, /^23\d\./,   // multicast
  /^24\d\./, /^25[0-5]\./,   // reserved
];

function isBlockedV4(addr) {
  return BLOCKED_V4.some((re) => re.test(addr));
}

function isBlockedV6(addr) {
  const a = addr.toLowerCase();
  return (
    a === "::1" ||
    a.startsWith("fc") || a.startsWith("fd") ||   // unique local
    a.startsWith("fe80") ||                        // link-local
    a.startsWith("ff")                             // multicast
  );
}

/**
 * Refuse to connect to a private/link-local/metadata address, whether the
 * hostname is a literal IP or resolves to one via DNS.
 * Set AY_ALLOW_PRIVATE_HOSTS=1 to disable (legitimate intranet APIs).
 * @param {string} urlString
 */
export async function assertHostAllowed(urlString) {
  if (process.env.AY_ALLOW_PRIVATE_HOSTS === "1") return;

  const url = new URL(urlString);
  // URL#hostname keeps the [brackets] around IPv6 literals; isIPv6() requires
  // them stripped or it silently reports false and the check gets skipped.
  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIPv4(host) && isBlockedV4(host)) {
    throw new Error(`Refusing connect to private IPv4 address: ${host}`);
  }
  if (isIPv6(host) && isBlockedV6(host)) {
    throw new Error(`Refusing connect to private IPv6 address: ${host}`);
  }
  if (isIPv4(host) || isIPv6(host)) return;

  const addresses = await lookup(host, { all: true });
  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedV4(address)) {
      throw new Error(`Refusing connect to ${host} → ${address} (private range)`);
    }
    if (family === 6 && isBlockedV6(address)) {
      throw new Error(`Refusing connect to ${host} → ${address} (private range)`);
    }
  }
}
