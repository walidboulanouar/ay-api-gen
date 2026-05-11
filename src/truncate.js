/**
 * Response Truncation.
 * Auto-truncates large API responses to stay within Claude's context window.
 * Shows record count + first N items for arrays, truncated text for large objects.
 */

const DEFAULT_MAX_CHARS = 8000;
const DEFAULT_MAX_ITEMS = 5;

/**
 * Truncate an API response to a reasonable size.
 * @param {any} data - Parsed API response
 * @param {object} opts - { maxChars, maxItems }
 * @returns {any} truncated data
 */
export function truncateResponse(data, opts = {}) {
  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;
  const maxItems = opts.maxItems || DEFAULT_MAX_ITEMS;

  if (data === null || data === undefined) return data;

  // Array responses: show count + first N items
  if (Array.isArray(data)) {
    if (data.length <= maxItems) return data;
    return {
      _truncated: true,
      _totalCount: data.length,
      _showing: maxItems,
      items: data.slice(0, maxItems),
    };
  }

  // Object with a data/results/items array inside
  if (typeof data === "object") {
    const arrayKeys = ["data", "results", "items", "records", "entries", "list", "rows"];
    for (const key of arrayKeys) {
      if (Array.isArray(data[key]) && data[key].length > maxItems) {
        return {
          ...data,
          [key]: data[key].slice(0, maxItems),
          _truncated: true,
          _totalCount: data[key].length,
          _showing: maxItems,
          _truncatedField: key,
        };
      }
    }
  }

  // String responses: truncate if too long
  if (typeof data === "string" && data.length > maxChars) {
    return data.slice(0, maxChars) + `\n\n... [truncated, ${data.length} total chars]`;
  }

  // Object responses: check serialized size
  const serialized = JSON.stringify(data);
  if (serialized.length > maxChars) {
    // Try to keep the structure but truncate deep values
    return {
      _truncated: true,
      _originalSize: serialized.length,
      _note: `Response truncated from ${serialized.length} chars to ~${maxChars}`,
      data: JSON.parse(serialized.slice(0, maxChars).replace(/[^}]*$/, "}}") || "{}"),
    };
  }

  return data;
}
