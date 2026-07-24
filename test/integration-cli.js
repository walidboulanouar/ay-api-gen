#!/usr/bin/env node

/**
 * Integration tests for the v0.1.1 CLI surface: doctor, init, discover,
 * diff, slim, filter. Previously 0% covered (see .ay/tracking/BOARD.md S2-01).
 *
 * These spawn the REAL `bin/ay-api-gen.js` CLI as a child process against
 * local fixture files — not mocks of the CLI's internals. The two commands
 * that inherently need HTTP (doctor, discover) get it from a short-lived
 * ephemeral server on 127.0.0.1 bound to an OS-assigned port, started and
 * closed within a single test — not a long-running dev server, and no
 * calls to any real external service.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { registerAPI } from "../src/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = resolve(__dirname, "../bin/ay-api-gen.js");
const FIXTURES = resolve(__dirname, "fixtures");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

/**
 * Run the CLI as a real child process, asynchronously. Deliberately NOT
 * execFileSync: a sync exec blocks this process's entire event loop until
 * the child exits, which would prevent any in-process ephemeral HTTP server
 * (used by the doctor/discover tests below) from ever answering the
 * child's requests — a self-deadlock that only shows up under a fixture
 * server, not against a real network peer.
 */
function runCLI(args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn("node", [BIN_PATH, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeout || 15000);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout: stdout + stderr, code: code ?? 1 });
    });

    if (opts.inputLines) {
      // Interactive readline wizards (init) need answers delivered as
      // separate, delayed writes — writing the whole scripted transcript in
      // one shot and immediately end()-ing stdin unreliably drops buffered
      // lines that arrive after the process's first `rl.question()` read.
      let i = 0;
      const sendNext = () => {
        if (i >= opts.inputLines.length) { child.stdin.end(); return; }
        child.stdin.write(opts.inputLines[i] + "\n");
        i++;
        setTimeout(sendNext, 200);
      };
      sendNext();
    } else {
      if (opts.input !== undefined) {
        child.stdin.write(opts.input);
      }
      child.stdin.end();
    }
  });
}

/** Pre-create an empty node_modules/ in a generate output dir so the CLI's
 * auto-install step (`npm install` if node_modules is missing) is skipped —
 * that step would otherwise make a real network call to the npm registry. */
function preventAutoInstall(outputDir) {
  mkdirSync(resolve(outputDir, "node_modules"), { recursive: true });
}

function mkTmpProject() {
  return mkdtempSync(resolve(tmpdir(), "ay-api-gen-it-"));
}

// ── diff ──
async function testDiff() {
  console.log("\n--- Integration: diff ---");
  const tmp = mkTmpProject();
  const a = resolve(FIXTURES, "diff-a.json");
  const b = resolve(FIXTURES, "diff-b.json");

  const { stdout, code } = await runCLI(["diff", a, b], { cwd: tmp });
  assert(code === 0, "diff: exits 0 on a valid comparison");
  assert(stdout.includes("Added (1)"), "diff: detects the added endpoint (/orders)");
  assert(stdout.includes("list_orders") || stdout.includes("/orders"), "diff: added section names the new endpoint");
  assert(stdout.includes("Removed (1)"), "diff: detects the removed endpoint (/legacy)");
  assert(stdout.includes("legacy_thing") || stdout.includes("/legacy"), "diff: removed section names the dropped endpoint");
  assert(stdout.includes("Changed (1)"), "diff: detects the changed endpoint (get_user summary)");
  assert(stdout.includes("get_user"), "diff: changed section names the modified tool");

  const { stdout: sameOut } = await runCLI(["diff", a, a], { cwd: tmp });
  assert(sameOut.includes("No changes detected"), "diff: reports no changes when comparing a spec to itself");
}

// ── filter (--only / --exclude) ──
async function testFilter() {
  console.log("\n--- Integration: filter (--only / --exclude) ---");
  const tmp = mkTmpProject();
  const spec = resolve(FIXTURES, "multi-resource.json");

  const onlyOut = resolve(tmp, "out-only");
  preventAutoInstall(onlyOut);
  const { stdout: onlyStdout, code: onlyCode } = await runCLI(
    [spec, "--output", onlyOut, "--only", "users", "--no-settings"],
    { cwd: tmp }
  );
  assert(onlyCode === 0, "filter --only: generate exits 0");
  // filterEndpoints() matches "users" as a substring against toolName + path + tags,
  // not an exact tag match — so it also picks up DELETE /admin/users/{id} (admin-tagged,
  // but its path literally contains "users"). 4 matches is the correct, documented behavior.
  assert(onlyStdout.includes("Filter:   8 -> 4"), "filter --only: narrows 8 endpoints down to the 4 whose name/path/tags contain 'users'");
  const onlyEndpoints = JSON.parse(readFileSync(resolve(onlyOut, "endpoints.json"), "utf-8")).endpoints;
  assert(onlyEndpoints.length === 4, "filter --only: endpoints.json contains exactly the 4 substring-matched endpoints");
  assert(onlyEndpoints.filter(e => e.tags.includes("users")).length === 3, "filter --only: 3 of the 4 matches are actually tagged 'users'");
  assert(onlyEndpoints.some(e => e.toolName === "delete_admin_user"), "filter --only: also matches admin's delete-user endpoint via path substring 'users' (documents substring-match semantics)");

  const excludeOut = resolve(tmp, "out-exclude");
  preventAutoInstall(excludeOut);
  const { code: excludeCode } = await runCLI(
    [spec, "--output", excludeOut, "--exclude", "billing", "--no-settings"],
    { cwd: tmp }
  );
  assert(excludeCode === 0, "filter --exclude: generate exits 0");
  const excludeEndpoints = JSON.parse(readFileSync(resolve(excludeOut, "endpoints.json"), "utf-8")).endpoints;
  assert(excludeEndpoints.length === 5, "filter --exclude: drops the 3 billing endpoints, keeps the other 5");
  assert(!excludeEndpoints.some(e => e.tags.includes("billing")), "filter --exclude: no kept endpoint is tagged 'billing'");
}

// ── slim (--slim / --max-tools) ──
async function testSlim() {
  console.log("\n--- Integration: slim (--slim --max-tools) ---");
  const tmp = mkTmpProject();
  const spec = resolve(FIXTURES, "multi-resource.json");
  const outDir = resolve(tmp, "out-slim");
  preventAutoInstall(outDir);

  const { stdout, code } = await runCLI(
    [spec, "--output", outDir, "--slim", "--max-tools", "3", "--no-settings"],
    { cwd: tmp }
  );
  assert(code === 0, "slim: generate exits 0");
  assert(stdout.includes("Smart pruning:"), "slim: prints a pruning summary");
  const kept = JSON.parse(readFileSync(resolve(outDir, "endpoints.json"), "utf-8")).endpoints;
  assert(kept.length <= 3, `slim: --max-tools 3 keeps at most 3 tools (kept ${kept.length})`);
  assert(kept.length > 0, "slim: does not prune everything away");
  // The deprecated admin/stats endpoint should be dropped before non-deprecated ones (scoreEndpoint penalizes it -50).
  assert(!kept.some(e => e.toolName === "get_admin_stats"), "slim: deprioritizes the endpoint whose description says 'deprecated'");
}

// ── doctor (ephemeral local server, no real external network) ──
async function testDoctor() {
  console.log("\n--- Integration: doctor ---");
  const tmp = mkTmpProject();

  const spec = {
    openapi: "3.0.3",
    info: { title: "Doctor Fixture", version: "1.0.0" },
    servers: [{ url: "PLACEHOLDER" }],
    paths: {
      "/ping": { get: { operationId: "ping", summary: "Ping", responses: { 200: { description: "ok" } } } },
    },
  };

  const server = createServer((req, res) => {
    if (req.method === "HEAD" && req.url === "/") { res.writeHead(200); res.end(); return; }
    if (req.url === "/openapi.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(spec)); return; }
    if (req.url === "/ping") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); return; }
    res.writeHead(404); res.end();
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  spec.servers[0].url = origin;

  try {
    registerAPI("doctor-fixture", {
      source: `${origin}/openapi.json`,
      baseUrl: origin,
      outputDir: resolve(tmp, "out-doctor"),
      endpointCount: 1,
      authTypes: ["none"],
    }, tmp);

    const { stdout, code } = await runCLI(["doctor"], { cwd: tmp });
    assert(code === 0, "doctor: exits 0 when every check passes");
    assert(stdout.includes("doctor-fixture"), "doctor: reports on the registered API by name");
    assert(/spec reachable/.test(stdout), "doctor: runs the 'spec reachable' check");
    assert(/spec parses/.test(stdout), "doctor: runs the 'spec parses' check");
    assert(/base URL reachable/.test(stdout), "doctor: runs the 'base URL reachable' check");
    assert(/API responds/.test(stdout), "doctor: runs the 'API responds' check against the safe /ping endpoint");
    assert(!/x .*spec reachable/.test(stdout), "doctor: 'spec reachable' did not fail against the live fixture server");
  } finally {
    await new Promise(r => server.close(r));
  }

  // Unreachable spec source should report a clean failure, not crash the CLI.
  const tmp2 = mkTmpProject();
  registerAPI("doctor-unreachable", {
    source: "http://127.0.0.1:1/definitely-not-listening.json",
    baseUrl: "http://127.0.0.1:1",
    outputDir: resolve(tmp2, "out"),
    endpointCount: 0,
    authTypes: ["none"],
  }, tmp2);
  const { stdout: failStdout, code: failCode } = await runCLI(["doctor"], { cwd: tmp2 });
  assert(failCode === 1, "doctor: exits 1 when a registered API's spec is unreachable");
  assert(/spec reachable/.test(failStdout), "doctor: still reports the 'spec reachable' check on failure (does not crash)");
}

// ── discover (ephemeral local server) ──
async function testDiscover() {
  console.log("\n--- Integration: discover ---");
  const tmp = mkTmpProject();

  const spec = {
    openapi: "3.0.3",
    info: { title: "Discover Fixture", version: "2.0.0" },
    paths: { "/things": { get: { operationId: "listThings", summary: "List things", responses: { 200: { description: "ok" } } } } },
  };

  const server = createServer((req, res) => {
    if (req.url === "/openapi.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(spec)); return; }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const { stdout, code } = await runCLI(["discover", `http://127.0.0.1:${port}`], { cwd: tmp, timeout: 20000 });
    assert(code === 0, "discover: exits 0");
    assert(stdout.includes("Found 1 spec"), "discover: finds exactly one spec via path probing");
    assert(stdout.includes("Discover Fixture"), "discover: reports the discovered spec's title");
    assert(stdout.includes(`http://127.0.0.1:${port}/openapi.json`), "discover: reports the exact URL that was found");
  } finally {
    await new Promise(r => server.close(r));
  }

  // A domain with nothing listening should report zero results, not crash.
  const { stdout: noneOut, code: noneCode } = await runCLI(["discover", "http://127.0.0.1:1"], { cwd: tmp, timeout: 20000 });
  assert(noneCode === 0, "discover: exits 0 even when nothing is found");
  assert(noneOut.includes("No specs found"), "discover: reports 'no specs found' rather than crashing on a dead host");
}

// ── init (interactive wizard, real readline over piped stdin) ──
async function testInit() {
  console.log("\n--- Integration: init ---");
  const tmp = mkTmpProject();
  const specPath = resolve(FIXTURES, "diff-a.json");
  const expectedName = "diff-fixture"; // derived from info.title "Diff Fixture"
  preventAutoInstall(resolve(tmp, `.ay/apis/${expectedName}`));

  // Scripted answers: (1) source type "2" = local file, (2) file path,
  // (3) accept default API name, (4) no auth detected -> skip API key prompt.
  const { stdout, code } = await runCLI(["init", "--no-settings"], {
    cwd: tmp, inputLines: ["2", specPath, "", ""], timeout: 20000,
  });
  assert(code === 0, "init: exits 0 after a full scripted run");
  assert(stdout.includes("Diff Fixture"), "init: echoes the loaded spec's title back to the user");
  assert(stdout.includes("Generating"), "init: proceeds to generation after the wizard completes");

  const outDir = resolve(tmp, `.ay/apis/${expectedName}`);
  assert(existsSync(resolve(outDir, "mcp-server.js")), "init: generates mcp-server.js at the default output path");
  assert(existsSync(resolve(outDir, "cli.js")), "init: generates cli.js at the default output path");
  assert(existsSync(resolve(tmp, ".ay/apis/registry.json")), "init: registers the generated API in the registry");

  // A blank domain on the auto-discover path should bail out cleanly, not hang or crash.
  const { code: bailCode } = await runCLI(["init"], { cwd: mkTmpProject(), inputLines: ["3", ""], timeout: 10000 });
  assert(bailCode === 0, "init: exits 0 when the user aborts mid-wizard (empty domain on auto-discover)");
}

// ── audit --baseline (free T0 static lint, ADR-010) ──
async function testAuditBaseline() {
  console.log("\n--- Integration: audit --baseline ---");
  const tmp = mkTmpProject();
  const dirtySpec = resolve(FIXTURES, "multi-resource.json");
  const cleanSpec = resolve(FIXTURES, "diff-a.json");

  const { stdout: dirtyOut, code: dirtyCode } = await runCLI(["audit", "--baseline", dirtySpec], { cwd: tmp });
  assert(dirtyCode === 0, "audit --baseline: exits 0 in warn-only mode even with HIGH findings");
  assert(dirtyOut.includes("4 finding(s)"), "audit --baseline: reports all 4 T-API-1 findings on the unauthenticated mutating endpoints");
  assert(dirtyOut.includes("T-API-1"), "audit --baseline: labels findings with their threat ID");

  const { stdout: cleanOut, code: cleanCode } = await runCLI(["audit", "--baseline", cleanSpec], { cwd: tmp });
  assert(cleanCode === 0, "audit --baseline: exits 0 on a spec with no findings");
  assert(cleanOut.includes("No T0 findings"), "audit --baseline: reports a clean bill of health for a spec with no mutating/sensitive endpoints");

  const { code: blockCode } = await runCLI(["audit", "--baseline", dirtySpec, "--mode", "b"], { cwd: tmp });
  assert(blockCode === 1, "audit --baseline --mode=b: exits 1 (blocking) when HIGH findings are not accepted");

  const { code: acceptCode } = await runCLI(
    ["audit", "--baseline", dirtySpec, "--mode", "b", "--accept-risks", "T-API-1:POST_users,T-API-1:POST_billing_invoices,T-API-1:POST_billing_charge,T-API-1:DELETE_admin_users_id"],
    { cwd: tmp }
  );
  assert(acceptCode === 0, "audit --baseline --mode=b: exits 0 once every HIGH finding is explicitly accepted via --accept-risks");
}

async function run() {
  console.log("ay-api-gen — CLI Integration Tests (S2-01)\n");

  const tests = [testDiff, testFilter, testSlim, testDoctor, testDiscover, testInit, testAuditBaseline];
  for (const t of tests) {
    try {
      await t();
    } catch (err) {
      console.error(`\nFATAL (${t.name}): ${err.message}`);
      console.error(err.stack);
      failed++;
    }
  }

  console.log(`\n--- Integration results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
