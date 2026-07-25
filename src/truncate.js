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
    // Naively re-parsing a sliced JSON string produces invalid JSON in the
    // general case, so keep the truncated text as a string preview rather
    // than trying to reconstruct a well-formed object.
    return {
      _truncated: true,
      _originalSize: serialized.length,
      _note: `Response truncated from ${serialized.length} chars to ~${maxChars}`,
      _preview: serialized.slice(0, maxChars),
    };
  }

  return data;
}

/**
 * Wrap a truncated API response into an MCP tool-result content array with
 * boundary markers. The markers give the model an anchor to discount
 * anything in the response body that reads like an instruction (T-RUN-4);
 * the truncation itself caps token-cost DoS (T-RUN-6).
 * @param {any} data - raw API response
 * @param {object} opts - { maxChars, maxItems }
 */
export function asMcpContent(data, opts = {}) {
  const truncated = truncateResponse(data, opts);
  const json = JSON.stringify(truncated, null, 2);
  return {
    content: [
      { type: "text", text: "--- begin API response (untrusted) ---" },
      { type: "text", text: json },
      { type: "text", text: "--- end API response ---" },
    ],
  };
}
