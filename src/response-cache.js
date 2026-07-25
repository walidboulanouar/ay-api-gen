/**
 * Response Cache (item 23).
 * Simple in-memory TTL cache for idempotent (GET/HEAD) API calls made by
 * the runtime MCP server / CLI. Reduces redundant upstream calls and token
 * cost when Claude re-queries the same resource within a short window.
 *
 * Opt-in (disabled unless AY_CACHE_TTL_MS is set) — caching trades
 * freshness for speed/cost, which the operator should consciously choose
 * per-API rather than have silently applied.
 *
 * Never caches mutating methods (POST/PUT/PATCH/DELETE) — those must
 * always reach the upstream API.
 */

const store = new Map(); // key -> { value, expiresAt }
const CACHEABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * @param {string} method
 * @returns {boolean}
 */
export function isCacheable(method) {
  return CACHEABLE_METHODS.has(String(method || "").toUpperCase());
}

/**
 * @param {string} method
 * @param {string} url - fully-built request URL (query params included, so
 *   distinct query strings are cached separately)
 * @returns {string}
 */
export function cacheKey(method, url) {
  return `${String(method).toUpperCase()} ${url}`;
}

/**
 * @param {string} key
 * @returns {any|undefined} the cached value, or undefined on a miss/expiry
 */
export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - <= 0 is a no-op (caching disabled)
 */
export function setCached(key, value, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Clears every cached entry — used by tests and available for a future `--no-cache` escape hatch. */
export function clearCache() {
  store.clear();
}

/** @returns {number} current number of live (non-expired-on-read) entries, for tests/diagnostics */
export function cacheSize() {
  return store.size;
}
