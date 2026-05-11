/**
 * Tool Filtering.
 * --only and --exclude patterns to select subsets of endpoints.
 * Matches against: tool name, path segments, tags, HTTP method.
 */

/**
 * Filter endpoints by include/exclude patterns.
 * @param {Array} endpoints
 * @param {object} opts - { only: "users,billing", exclude: "admin,deprecated" }
 * @returns {Array} filtered endpoints
 */
export function filterEndpoints(endpoints, opts = {}) {
  let result = endpoints;

  if (opts.only) {
    const patterns = opts.only.split(",").map(p => p.trim().toLowerCase());
    result = result.filter(ep => {
      const searchable = [
        ep.toolName,
        ep.path,
        ep.method.toLowerCase(),
        ...(ep.tags || []),
      ].join(" ").toLowerCase();
      return patterns.some(p => searchable.includes(p));
    });
  }

  if (opts.exclude) {
    const patterns = opts.exclude.split(",").map(p => p.trim().toLowerCase());
    result = result.filter(ep => {
      const searchable = [
        ep.toolName,
        ep.path,
        ep.method.toLowerCase(),
        ...(ep.tags || []),
      ].join(" ").toLowerCase();
      return !patterns.some(p => searchable.includes(p));
    });
  }

  return result;
}
