/**
 * Auth Code Generator.
 * Generates authentication code blocks based on detected OpenAPI security schemes.
 * Shared by both MCP server generator and CLI generator.
 *
 * Uses string concatenation (not template literals) for output lines
 * that themselves contain template literals, to avoid escaping hell.
 */

// Helper: produce a JS template literal string like: `Bearer ${expr}`
// Returns it as a raw source-code string safe to embed in generated output.
function tpl(strings, ...exprs) {
  let out = "`";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < exprs.length) out += "${" + exprs[i] + "}";
  }
  out += "`";
  return out;
}

/**
 * Escape a spec-derived string (security scheme param names, OAuth2 flow
 * URLs/types, scope names) for safe interpolation onto a generated `//`
 * line comment. Unlike a `/* *\/` block comment, a `//` line comment is
 * terminated by ANY raw newline — so a value containing `\n` breaks out
 * onto a fresh line of *executable* generated JS (T-GEN-1). Line comments
 * can't be "escaped" mid-line, so the only safe move is to collapse
 * newlines before they ever reach the comment text.
 */
function safeLineComment(s) {
  if (s == null) return "";
  return String(s).replace(/\r?\n/g, " ").slice(0, 300);
}

/**
 * Escape a spec-derived string for safe interpolation into a *generated*
 * template literal (text embedded at codegen time inside a `...` block in
 * the output source, e.g. cli-generator.js's printHelp()). Without this, a
 * value containing a backtick or `${...}` breaks out of the generated
 * string and injects arbitrary JS that runs when the generated CLI
 * executes (T-GEN-1).
 */
function safeTemplateText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r?\n/g, " ")
    .slice(0, 300);
}

/**
 * Generate auth code block based on detected security schemes.
 * @param {object} securitySchemes
 * @returns {string} JavaScript source code for auth handling
 */
export function generateAuthCode(securitySchemes) {
  const schemes = Object.values(securitySchemes || {});

  if (schemes.length === 0) {
    const lines = [];
    lines.push("// ── Auth (no security schemes detected — using generic env vars) ──");
    lines.push("function getAuthHeaders() {");
    lines.push('  const headers = { "Content-Type": "application/json" };');
    lines.push("  if (process.env.API_KEY) headers[\"Authorization\"] = " + tpl`Bearer ${"process.env.API_KEY"}` + ";");
    lines.push("  if (process.env.API_TOKEN) headers[\"Authorization\"] = " + tpl`Bearer ${"process.env.API_TOKEN"}` + ";");
    lines.push("  if (process.env.API_HEADER_NAME && process.env.API_HEADER_VALUE) {");
    lines.push("    headers[process.env.API_HEADER_NAME] = process.env.API_HEADER_VALUE;");
    lines.push("  }");
    lines.push("  return headers;");
    lines.push("}");
    lines.push("");
    lines.push("function getAuthQueryParams() {");
    lines.push("  return {};");
    lines.push("}");
    return lines.join("\n");
  }

  const hasBearer = schemes.some(s => s.type === "http" && s.scheme === "bearer");
  const hasBasic = schemes.some(s => s.type === "http" && s.scheme === "basic");
  const hasApiKeyHeader = schemes.filter(s => s.type === "apiKey" && s.in === "header");
  const hasApiKeyQuery = schemes.filter(s => s.type === "apiKey" && s.in === "query");
  const hasApiKeyCookie = schemes.filter(s => s.type === "apiKey" && s.in === "cookie");
  const hasOAuth2 = schemes.some(s => s.type === "oauth2");

  const lines = [];

  // Comment block
  lines.push("// ── Auth (detected security schemes) ──");
  if (hasBearer) lines.push("//   - Bearer token (HTTP Bearer)");
  if (hasBasic) lines.push("//   - Basic auth (HTTP Basic)");
  for (const s of hasApiKeyHeader) lines.push("//   - API Key in header: " + safeLineComment(s.paramName));
  for (const s of hasApiKeyQuery) lines.push("//   - API Key in query: " + safeLineComment(s.paramName));
  for (const s of hasApiKeyCookie) lines.push("//   - API Key in cookie: " + safeLineComment(s.paramName));
  if (hasOAuth2) {
    const oauthScheme = schemes.find(s => s.type === "oauth2");
    const flowTypes = Object.keys(oauthScheme.flows || {}).map(safeLineComment);
    lines.push("//   - OAuth2 (flows: " + flowTypes.join(", ") + ")");
    for (const [, flow] of Object.entries(oauthScheme.flows || {})) {
      if (flow.tokenUrl) lines.push("//     tokenUrl: " + safeLineComment(flow.tokenUrl));
      if (flow.authorizationUrl) lines.push("//     authorizationUrl: " + safeLineComment(flow.authorizationUrl));
      if (flow.scopes && Object.keys(flow.scopes).length > 0) {
        lines.push("//     scopes: " + Object.keys(flow.scopes).map(safeLineComment).join(", "));
      }
    }
  }
  lines.push("//");
  lines.push("// Environment variables:");
  if (hasBearer) lines.push("//   API_BEARER_TOKEN  - Bearer token for Authorization header");
  if (hasBasic) lines.push("//   API_USERNAME / API_PASSWORD  - Basic auth credentials");
  for (const s of hasApiKeyHeader) lines.push("//   API_KEY  - Value for " + safeLineComment(s.paramName) + " header");
  for (const s of hasApiKeyQuery) lines.push("//   API_KEY  - Value for " + safeLineComment(s.paramName) + " query param");
  if (hasOAuth2) {
    lines.push("//   OAUTH_CLIENT_ID       - OAuth2 client ID");
    lines.push("//   OAUTH_CLIENT_SECRET   - OAuth2 client secret");
    lines.push("//   OAUTH_ACCESS_TOKEN    - Pre-obtained OAuth2 access token");
    const oauthScheme = schemes.find(s => s.type === "oauth2");
    const flow = Object.values(oauthScheme.flows || {})[0];
    if (flow?.tokenUrl) lines.push("//   OAUTH_TOKEN_URL       - Token endpoint (default: " + safeLineComment(flow.tokenUrl) + ")");
  }
  lines.push("");

  // OAuth2 token helper
  if (hasOAuth2) {
    const oauthScheme = schemes.find(s => s.type === "oauth2");
    const flow = Object.values(oauthScheme.flows || {})[0];
    const tokenUrl = flow?.tokenUrl || "";
    lines.push("// ── OAuth2 token helper ──");
    lines.push("let _cachedToken = null;");
    lines.push("let _tokenExpiry = 0;");
    lines.push("");
    lines.push("async function getOAuthToken() {");
    lines.push("  if (process.env.OAUTH_ACCESS_TOKEN) return process.env.OAUTH_ACCESS_TOKEN;");
    lines.push("  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;");
    lines.push("");
    lines.push("  const clientId = process.env.OAUTH_CLIENT_ID;");
    lines.push("  const clientSecret = process.env.OAUTH_CLIENT_SECRET;");
    lines.push("  const tokenUrl = process.env.OAUTH_TOKEN_URL || " + JSON.stringify(tokenUrl) + ";");
    lines.push("");
    lines.push('  if (!clientId || !clientSecret || !tokenUrl) {');
    lines.push('    console.error("OAuth2: set OAUTH_CLIENT_ID + OAUTH_CLIENT_SECRET + OAUTH_TOKEN_URL, or OAUTH_ACCESS_TOKEN");');
    lines.push("    return null;");
    lines.push("  }");
    lines.push("");
    lines.push("  try {");
    lines.push("    const res = await fetch(tokenUrl, {");
    lines.push('      method: "POST",');
    lines.push("      headers: {");
    lines.push('        "Content-Type": "application/x-www-form-urlencoded",');
    lines.push('        "Authorization": ' + tpl`Basic ${"Buffer.from(clientId + \":\" + clientSecret).toString(\"base64\")"}` + "");
    lines.push("      },");
    lines.push('      body: "grant_type=client_credentials"');
    lines.push("    });");
    lines.push("    const data = await res.json();");
    lines.push("    if (data.access_token) {");
    lines.push("      _cachedToken = data.access_token;");
    lines.push("      _tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;");
    lines.push("      return _cachedToken;");
    lines.push("    }");
    lines.push('    console.error("OAuth2 token error:", data);');
    lines.push("    return null;");
    lines.push("  } catch (err) {");
    lines.push('    console.error("OAuth2 token fetch failed:", err.message);');
    lines.push("    return null;");
    lines.push("  }");
    lines.push("}");
    lines.push("");
  }

  // getAuthHeaders()
  lines.push("function getAuthHeaders() {");
  lines.push('  const headers = { "Content-Type": "application/json" };');

  if (hasBearer) {
    lines.push("  // Bearer token auth");
    lines.push("  if (process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN) {");
    lines.push("    headers[\"Authorization\"] = " + tpl`Bearer ${"process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN"}` + ";");
    lines.push("  }");
  }

  if (hasBasic) {
    lines.push("  // Basic auth");
    lines.push("  if (process.env.API_USERNAME && process.env.API_PASSWORD) {");
    lines.push("    const creds = Buffer.from(process.env.API_USERNAME + \":\" + process.env.API_PASSWORD).toString(\"base64\");");
    lines.push("    headers[\"Authorization\"] = " + tpl`Basic ${"creds"}` + ";");
    lines.push("  }");
  }

  for (const s of hasApiKeyHeader) {
    lines.push("  // API Key in header: " + safeLineComment(s.paramName));
    lines.push("  if (process.env.API_KEY) {");
    lines.push("    headers[" + JSON.stringify(s.paramName) + "] = process.env.API_KEY;");
    lines.push("  }");
  }

  for (const s of hasApiKeyCookie) {
    lines.push("  // API Key in cookie: " + safeLineComment(s.paramName));
    lines.push("  if (process.env.API_KEY) {");
    lines.push("    headers[\"Cookie\"] = " + JSON.stringify(s.paramName + "=") + " + process.env.API_KEY;");
    lines.push("  }");
  }

  if (hasOAuth2) {
    lines.push("  // OAuth2");
    lines.push("  if (process.env.OAUTH_ACCESS_TOKEN) {");
    lines.push("    headers[\"Authorization\"] = " + tpl`Bearer ${"process.env.OAUTH_ACCESS_TOKEN"}` + ";");
    lines.push("  }");
  }

  lines.push("  return headers;");
  lines.push("}");
  lines.push("");

  // getAuthQueryParams()
  lines.push("function getAuthQueryParams() {");
  lines.push("  const params = {};");

  for (const s of hasApiKeyQuery) {
    lines.push("  // API Key in query: " + safeLineComment(s.paramName));
    lines.push("  if (process.env.API_KEY) {");
    lines.push("    params[" + JSON.stringify(s.paramName) + "] = process.env.API_KEY;");
    lines.push("  }");
  }

  lines.push("  return params;");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate env var documentation for help text.
 */
export function generateEnvDocs(securitySchemes) {
  const schemes = Object.values(securitySchemes || {});
  if (schemes.length === 0) {
    return [
      "  API_BASE_URL    Override base URL",
      "  API_KEY         Bearer token for Authorization header",
      "  API_TOKEN       Alternative bearer token",
    ].join("\n");
  }

  const lines = ["  API_BASE_URL    Override base URL"];
  const hasBearer = schemes.some(s => s.type === "http" && s.scheme === "bearer");
  const hasBasic = schemes.some(s => s.type === "http" && s.scheme === "basic");
  const hasApiKeyHeader = schemes.filter(s => s.type === "apiKey" && s.in === "header");
  const hasApiKeyQuery = schemes.filter(s => s.type === "apiKey" && s.in === "query");
  const hasOAuth2 = schemes.some(s => s.type === "oauth2");

  if (hasBearer) lines.push("  API_BEARER_TOKEN  Bearer token");
  if (hasBasic) {
    lines.push("  API_USERNAME      Basic auth username");
    lines.push("  API_PASSWORD      Basic auth password");
  }
  for (const s of hasApiKeyHeader) lines.push("  API_KEY           " + safeTemplateText(s.paramName) + " header value");
  for (const s of hasApiKeyQuery) lines.push("  API_KEY           " + safeTemplateText(s.paramName) + " query param value");
  if (hasOAuth2) {
    lines.push("  OAUTH_CLIENT_ID       OAuth2 client ID");
    lines.push("  OAUTH_CLIENT_SECRET   OAuth2 client secret");
    lines.push("  OAUTH_ACCESS_TOKEN    Pre-obtained access token");
    lines.push("  OAUTH_TOKEN_URL       Token endpoint override");
  }
  return lines.join("\n");
}
