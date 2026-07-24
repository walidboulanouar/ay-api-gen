#!/usr/bin/env node

/**
 * Runtime CLI.
 *
 * No code generation — reads an OpenAPI spec and creates commands on the fly.
 *
 * Usage:
 *   ay-api-gen run <spec-url-or-path> <resource> <action> [--param value ...]
 *   ay-api-gen run https://petstore.swagger.io/v2/swagger.json pet get --petId 1
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec, extractEndpoints, deriveCLICommand } from "../parser.js";
import { resolveBaseUrl, assertHostAllowed } from "../url-guard.js";

// ── .env loader ──
function loadEnv() {
  for (const p of [resolve(process.cwd(), ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  }
}
loadEnv();

// ── Auth ──
function getAuthHeaders(securitySchemes) {
  const headers = { "Content-Type": "application/json" };
  for (const s of Object.values(securitySchemes || {})) {
    if (s.type === "http" && s.scheme === "bearer") {
      const t = process.env.API_BEARER_TOKEN || process.env.API_KEY || process.env.API_TOKEN;
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }
    if (s.type === "http" && s.scheme === "basic" && process.env.API_USERNAME && process.env.API_PASSWORD) {
      headers["Authorization"] = `Basic ${Buffer.from(process.env.API_USERNAME + ":" + process.env.API_PASSWORD).toString("base64")}`;
    }
    if (s.type === "apiKey" && s.in === "header" && process.env.API_KEY) headers[s.paramName] = process.env.API_KEY;
    if (s.type === "oauth2" && process.env.OAUTH_ACCESS_TOKEN) headers["Authorization"] = `Bearer ${process.env.OAUTH_ACCESS_TOKEN}`;
  }
  if (!headers["Authorization"] && process.env.API_KEY) headers["Authorization"] = `Bearer ${process.env.API_KEY}`;
  return headers;
}

function getAuthQueryParams(securitySchemes) {
  const params = {};
  for (const s of Object.values(securitySchemes || {})) {
    if (s.type === "apiKey" && s.in === "query" && process.env.API_KEY) params[s.paramName] = process.env.API_KEY;
  }
  return params;
}

// ── HTTP ──
async function callApi(baseUrl, method, path, params, body, securitySchemes) {
  let url = path;
  const qp = [];

  for (const [k, v] of Object.entries(getAuthQueryParams(securitySchemes))) {
    qp.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }

  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (url.includes(`{${k}}`)) url = url.replace(`{${k}}`, encodeURIComponent(v));
    else qp.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }

  const full = baseUrl.replace(/\/$/, "") + url + (qp.length ? "?" + qp.join("&") : "");
  const headers = getAuthHeaders(securitySchemes);
  const opts = { method, headers };
  if (body && Object.keys(body).length && method !== "GET" && method !== "HEAD") opts.body = JSON.stringify(body);

  await assertHostAllowed(full);
  const res = await fetch(full, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) { console.error(`Error ${res.status}: ${res.statusText}`); console.error(typeof data === "string" ? data : JSON.stringify(data, null, 2)); process.exit(1); }
  return data;
}

// ── Arg parse ──
function parseCliArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    } else positional.push(argv[i]);
  }
  return { args, positional };
}

// ── Main ──
const { args, positional } = parseCliArgs(process.argv.slice(2));
const specSource = positional[0];

if (!specSource || args.help) {
  console.log(`
ay-api-gen run — Direct API calls via OpenAPI spec

Usage:
  ay-api-gen run <spec> <resource> <action> [--param value ...]
  ay-api-gen run <spec> --help

Examples:
  ay-api-gen run https://petstore.swagger.io/v2/swagger.json inventory list
  ay-api-gen run ./my-api.json users get --userId 123
`);
  process.exit(0);
}

const spec = await loadSpec(specSource);
const parsed = extractEndpoints(spec);
await assertHostAllowed(parsed.baseUrl);
const baseUrl = resolveBaseUrl(parsed.baseUrl, process.env.API_BASE_URL);

const resource = positional[1];
const action = positional[2];

if (!resource) {
  // List all available resources and actions
  const groups = {};
  for (const ep of parsed.endpoints) {
    const { resource: r, action: a } = ep.cliCommand;
    if (!groups[r]) groups[r] = [];
    groups[r].push({ action: a, summary: ep.summary, method: ep.method, path: ep.path });
  }

  console.log(`\n${parsed.info.title || "API"} — Available commands:\n`);
  for (const [r, cmds] of Object.entries(groups)) {
    console.log(`  ${r}`);
    for (const c of cmds) {
      console.log(`    ${c.action.padEnd(12)} ${c.summary}`);
    }
    console.log();
  }
  process.exit(0);
}

// Find matching endpoint
const ep = parsed.endpoints.find(e => {
  const { resource: r, action: a } = e.cliCommand;
  return r === resource && a === action;
});

if (!ep) {
  console.error(`Unknown: ${resource} ${action || ""}`);
  process.exit(1);
}

// Split args into path/query vs body
const pathParams = ep.parameters.filter(p => p.in === "path").map(p => p.name);
const queryParams = ep.parameters.filter(p => p.in === "query").map(p => p.name);
const pqParams = {};
const bodyParams = {};

for (const [k, v] of Object.entries(args)) {
  if (k === "help") continue;
  if (pathParams.includes(k) || queryParams.includes(k)) pqParams[k] = v;
  else bodyParams[k] = v;
}

const result = await callApi(baseUrl, ep.method, ep.path, pqParams, bodyParams, parsed.securitySchemes);
console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
