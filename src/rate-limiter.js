/**
 * Rate Limiter (item 24).
 * Simple per-host request throttle for outgoing API calls from the runtime
 * MCP server / CLI. Delays (rather than rejects) requests that would
 * exceed the configured rate — an LLM-driven tool caller has no good way
 * to "retry later" on a hard rejection, so smoothing via delay is
 * friendlier and still protects the upstream API and the operator's own
 * API key from being hammered / rate-limited by their own agent.
 *
 * Opt-in (disabled unless AY_RATE_LIMIT_RPS is set) — the right limit
 * varies per API and an unrequested default delay would be a surprising,
 * unrequested behavior change for existing generated servers.
 */

const lastRequestAt = new Map(); // host -> timestamp (ms) of last allowed request

/**
 * Delay the caller, if needed, so no more than one request per
 * `minIntervalMs` reaches a given host.
 * @param {string} host
 * @param {number} minIntervalMs - <= 0 is a no-op (rate limiting disabled)
 */
export async function throttle(host, minIntervalMs) {
  if (!minIntervalMs || minIntervalMs <= 0) return;

  const last = lastRequestAt.get(host) || 0;
  const now = Date.now();
  const wait = last + minIntervalMs - now;

  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt.set(host, Date.now());
}

/**
 * @param {number} rps - requests per second; <= 0 or falsy means disabled
 * @returns {number} minimum milliseconds between requests to the same host
 */
export function rpsToMinIntervalMs(rps) {
  const n = Number(rps);
  if (!n || n <= 0) return 0;
  return 1000 / n;
}

/** Clears throttle state — used by tests. */
export function resetRateLimiter() {
  lastRequestAt.clear();
}
