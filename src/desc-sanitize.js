/**
 * Description Sanitizer.
 * Tool/parameter descriptions are spec-derived strings handed to Claude's
 * context as instructions (T-RUN-3). Cap length, force single-line, and
 * prefix with an untrusted-source marker so the model has an anchor to
 * discount injected instructions.
 */

const MAX_CHARS = 500;

/**
 * @param {string} s - raw description from the spec
 * @param {string} kind - "tool" | "param"
 * @returns {string}
 */
export function safeDescription(s, kind = "tool") {
  if (!s) return "";
  const oneLine = String(s).replace(/\r?\n/g, " ").trim();
  if (!oneLine) return "";
  const truncated = oneLine.length > MAX_CHARS
    ? oneLine.slice(0, MAX_CHARS) + ` … [${kind} description truncated, untrusted source]`
    : oneLine;
  return `[${kind} description, untrusted] ${truncated}`;
}
