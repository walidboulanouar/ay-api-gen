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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, homedir } from "node:os";
import { registerAPI } from "../src/registry.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = resolve(__dirname, "../bin/ay-api-gen.js");
const RUNTIME_MCP_SERVER_PATH = resolve(__dirname, "../src/runtime/mcp-server.js");
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
    const child = spawn("node", [opts.binPath || BIN_PATH, ...args], {
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

    /**
     * Wait until `pattern` has appeared in the child's accumulated stdout
     * (polling every 20ms), up to `maxWaitMs`. Resolves as soon as the
     * pattern shows up rather than waiting out the full budget. If
     * maxWaitMs elapses first, resolves anyway (never rejects) so a
     * mistyped/stale pattern degrades to "send after a wait" instead of
     * hanging the whole suite — the per-call `opts.timeout` above is the
     * real backstop against that.
     */
    function waitForOutput(pattern, maxWaitMs = 4000) {
      return new Promise((res) => {
        const start = Date.now();
        const check = () => {
          if (stdout.includes(pattern)) { res(true); return; }
          if (Date.now() - start >= maxWaitMs) { res(false); return; }
          setTimeout(check, 20);
        };
        check();
      });
    }

    if (opts.inputLines) {
      // Interactive readline wizards (init) need each answer sent only
      // once the child has actually printed its NEXT rl.question() prompt
      // (readline writes the prompt to stdout before blocking on a read) —
      // a fixed delay between writes is a race under CPU contention: if the
      // child hasn't reached the next prompt yet when the timer fires, the
      // write lands too early and readline can drop or misread it (this
      // caused a real, if rare, CI-relevant flake — see PROGRESS-LOG.md).
      // Each entry is either a plain string (sent immediately, kept for
      // backward compatibility) or `{ waitFor, send }`, synchronizing on
      // the actual prompt text instead of guessing a delay.
      let i = 0;
      const sendNext = async () => {
        if (i >= opts.inputLines.length) { child.stdin.end(); return; }
        const entry = opts.inputLines[i];
        i++;
        const isTimed = entry !== null && typeof entry === "object";
        if (isTimed && entry.waitFor) {
          await waitForOutput(entry.waitFor, entry.maxWaitMs);
        }
        child.stdin.write((isTimed ? entry.send : entry) + "\n");
        sendNext();
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
  // realpathSync: on macOS, tmpdir() lives under /var, which is itself a
  // symlink to /private/var. A spawned child's own process.cwd() reports
  // the resolved realpath, not the symlink form mkdtempSync() returns —
  // so any path this test builds by joining onto the symlink form (e.g.
  // for an "is this outside cwd" check) would mismatch what the child
  // actually compares against internally. Normalize once, here, so every
  // path built from this directory agrees with the child's view of cwd.
  return realpathSync(mkdtempSync(resolve(tmpdir(), "ay-api-gen-it-")));
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
    await registerAPI("doctor-fixture", {
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
  await registerAPI("doctor-unreachable", {
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

  // Scripted answers, each synchronized on the real prompt it answers
  // (see runCLI's waitFor handling): (1) source type "2" = local file,
  // (2) file path, (3) accept default API name, (4) no auth detected ->
  // skip API key prompt.
  const { stdout, code } = await runCLI(["init", "--no-settings"], {
    cwd: tmp,
    inputLines: [
      { waitFor: "Choice [1]:", send: "2" },
      { waitFor: "File path:", send: specPath },
      { waitFor: "API name [", send: "" },
      { waitFor: "API key (if needed", send: "" },
    ],
    timeout: 20000,
  });
  assert(code === 0, "init: exits 0 after a full scripted run");
  assert(stdout.includes("Diff Fixture"), "init: echoes the loaded spec's title back to the user");
  assert(stdout.includes("Generating"), "init: proceeds to generation after the wizard completes");

  const outDir = resolve(tmp, `.ay/apis/${expectedName}`);
  assert(existsSync(resolve(outDir, "mcp-server.js")), "init: generates mcp-server.js at the default output path");
  assert(existsSync(resolve(outDir, "cli.js")), "init: generates cli.js at the default output path");
  assert(existsSync(resolve(tmp, ".ay/apis/registry.json")), "init: registers the generated API in the registry");

  // A blank domain on the auto-discover path should bail out cleanly, not hang or crash.
  const { code: bailCode } = await runCLI(["init"], {
    cwd: mkTmpProject(),
    inputLines: [
      { waitFor: "Choice [1]:", send: "3" },
      { waitFor: "Domain (e.g., petstore.swagger.io):", send: "" },
    ],
    timeout: 10000,
  });
  assert(bailCode === 0, "init: exits 0 when the user aborts mid-wizard (empty domain on auto-discover)");
}

/**
 * LEARN-002 regression: runCLI()'s inputLines mechanism used to send each
 * scripted answer after a fixed 200ms delay, regardless of whether the
 * child had actually reached its next `rl.question()` prompt yet. That's a
 * real race, not a hypothetical one — a wall-clock stress test (many
 * concurrent CPU-bound processes) didn't reliably reproduce it in this
 * sandbox (same experience this project had proving B-09's file-lock race
 * — see test/run.js's testFileLock() comments), so this proves it
 * deterministically instead: a purpose-built fixture process whose prompt
 * is artificially delayed past the old fixed delay.
 */
async function testInitWizardStdinTimingHardening() {
  console.log("\n--- Regression: init-wizard stdin timing hardening (LEARN-002) ---");

  const tmp = mkTmpProject();
  const scriptPath = resolve(tmp, "delayed-prompt.js");
  writeFileSync(scriptPath, [
    'import { createInterface } from "node:readline";',
    "setTimeout(() => {",
    '  const rl = createInterface({ input: process.stdin, output: process.stdout });',
    '  rl.question("Choice [1]: ", (answer) => {',
    '    console.log("GOT:" + answer);',
    "    rl.close();",
    "    process.exit(0);",
    "  });",
    "}, 600);", // deliberately well past the old hardcoded 200ms delay
  ].join("\n"));

  // (a) Reproduce the OLD bug's exact mechanism directly: a send timed off
  // a fixed short delay lands before this deliberately-slow prompt has even
  // printed. This is the concrete failure mode the fix addresses — proof
  // the race was real, not just a theoretical concern.
  const probe = spawn("node", [scriptPath]);
  let probeOut = "";
  probe.stdout.on("data", d => { probeOut += d; });
  await new Promise((r) => setTimeout(r, 200));
  const promptAlreadyPrinted = probeOut.includes("Choice [1]:");
  probe.kill("SIGKILL");
  assert(!promptAlreadyPrinted, "init-wizard stdin timing: reproduces the OLD bug's failure mode — a fixed 200ms delay is not always enough for a real prompt to appear (this fixture's prompt takes 600ms), so a fixed-delay send is a genuine race");

  // (b) The NEW waitFor-based mechanism, exercised through the real
  // runCLI() helper (opts.binPath overrides the target script), correctly
  // waits for the actual prompt regardless of the delay and delivers the
  // answer to it — proving the fix, not just the old bug's absence.
  const { stdout, code } = await runCLI([], {
    binPath: scriptPath,
    cwd: tmp,
    inputLines: [{ waitFor: "Choice [1]:", send: "hello-world" }],
    timeout: 5000,
  });
  assert(code === 0, "init-wizard stdin timing: the delayed-prompt fixture exits cleanly when answered correctly");
  assert(stdout.includes("GOT:hello-world"), "init-wizard stdin timing: waitFor-based send correctly delivers input to a prompt that only appears 600ms after spawn — 3x the old fixed delay");

  // (c) Fallback safety: if `waitFor`'s pattern never appears at all (a
  // stale/mistyped pattern, or a prompt that legitimately never prints),
  // waitForOutput() must still resolve once maxWaitMs elapses and the
  // write must still go out — degrading to "send anyway" rather than
  // hanging sendNext()/the whole call forever. A short per-entry
  // maxWaitMs keeps this fast instead of eating the 4s default.
  const otherPromptScriptPath = resolve(tmp, "other-prompt.js");
  writeFileSync(otherPromptScriptPath, [
    'import { createInterface } from "node:readline";',
    'const rl = createInterface({ input: process.stdin, output: process.stdout });',
    'rl.question("Something else entirely: ", (answer) => {',
    '  console.log("GOT2:" + answer);',
    "  rl.close();",
    "  process.exit(0);",
    "});",
  ].join("\n"));

  const { stdout: fallbackStdout, code: fallbackCode } = await runCLI([], {
    binPath: otherPromptScriptPath,
    cwd: tmp,
    inputLines: [{ waitFor: "This exact pattern will never appear", maxWaitMs: 300, send: "fallback-answer" }],
    timeout: 5000,
  });
  assert(fallbackCode === 0, "init-wizard stdin timing: when waitFor's pattern never appears, the fallback still sends after maxWaitMs elapses instead of hanging forever");
  assert(fallbackStdout.includes("GOT2:fallback-answer"), "init-wizard stdin timing: the fallback-delivered answer is still received correctly by the child once sent");
}

// ── audit --baseline (free T0 static lint, ADR-010) ──
async function testAuditBaseline() {
  console.log("\n--- Integration: audit --baseline ---");
  const tmp = mkTmpProject();
  const dirtySpec = resolve(FIXTURES, "multi-resource.json");
  const cleanSpec = resolve(FIXTURES, "diff-a.json");

  const { stdout: dirtyOut, code: dirtyCode } = await runCLI(["audit", "--baseline", dirtySpec], { cwd: tmp });
  assert(dirtyCode === 0, "audit --baseline: exits 0 in warn-only mode even with HIGH findings");
  // 4 T-API-1 (unauthenticated mutating endpoints) + 1 T-API-5 (this fixture
  // declares zero security schemes anywhere, spec-wide) + 1 T-API-6 (no
  // endpoint anywhere declares a 429 response or RateLimit header, also
  // spec-wide) = 6. Each addition is a real, correct finding, not a test
  // artifact — T-API-5 and T-API-6 were both added after this fixture and
  // count were first written.
  assert(dirtyOut.includes("6 finding(s)"), "audit --baseline: reports all 4 T-API-1 findings plus 1 T-API-5 (no security schemes) plus 1 T-API-6 (no rate limit declared)");
  assert(dirtyOut.includes("T-API-1"), "audit --baseline: labels findings with their threat ID");
  assert(dirtyOut.includes("T-API-5") && dirtyOut.includes("No security schemes"), "audit --baseline: reports T-API-5 for a spec with zero declared security schemes");
  assert(dirtyOut.includes("T-API-6"), "audit --baseline: reports T-API-6 for a spec with no declared rate limiting");

  const { stdout: cleanOut, code: cleanCode } = await runCLI(["audit", "--baseline", cleanSpec], { cwd: tmp });
  assert(cleanCode === 0, "audit --baseline: exits 0 even with only a LOW finding");
  // This fixture is "clean" for T-API-1..5 (authenticated, no sensitive
  // fields), but — like virtually every real-world fixture not written to
  // specifically test T-API-6 — it doesn't declare rate-limit responses/
  // headers either, so it correctly gets exactly the one LOW T-API-6 finding.
  assert(cleanOut.includes("1 finding(s)") && cleanOut.includes("T-API-6"), "audit --baseline: reports exactly the 1 LOW T-API-6 finding for a spec with no mutating/sensitive endpoints but no declared rate limiting either");

  const { code: blockCode } = await runCLI(["audit", "--baseline", dirtySpec, "--mode", "b"], { cwd: tmp });
  assert(blockCode === 1, "audit --baseline --mode=b: exits 1 (blocking) when HIGH findings are not accepted");

  const { code: acceptCode } = await runCLI(
    ["audit", "--baseline", dirtySpec, "--mode", "b", "--accept-risks", "T-API-1:POST_users,T-API-1:POST_billing_invoices,T-API-1:POST_billing_charge,T-API-1:DELETE_admin_users_id"],
    { cwd: tmp }
  );
  assert(acceptCode === 0, "audit --baseline --mode=b: exits 0 once every HIGH finding is explicitly accepted via --accept-risks");
}

// ── B-09: concurrent writers must not lose an update to settings.local.json / registry.json ──
async function testConcurrentWriteLocking() {
  console.log("\n--- Integration: B-09 concurrent-write locking ---");
  const tmp = mkTmpProject();
  const spec = resolve(FIXTURES, "diff-a.json");
  const N = 6;

  // N real `ay-api-gen generate` invocations, same cwd (so they share the
  // same registry.json AND settings.local.json), launched genuinely
  // concurrently via Promise.all — this is the actual race B-09 describes
  // (e.g. a CI regen overlapping a local run), not a simulated one.
  const runs = Array.from({ length: N }, (_, i) => {
    const outDir = resolve(tmp, `out-${i}`);
    preventAutoInstall(outDir);
    return runCLI([spec, "--output", outDir, "--name", `concurrent-api-${i}`], { cwd: tmp, timeout: 30000 });
  });
  const results = await Promise.all(runs);

  assert(results.every(r => r.code === 0), `B-09: all ${N} concurrent generate invocations exit 0 (got: ${results.map(r => r.code).join(",")})`);

  const registry = JSON.parse(readFileSync(resolve(tmp, ".ay/apis/registry.json"), "utf-8"));
  const registeredNames = Object.keys(registry.apis);
  assert(registeredNames.length === N, `B-09: registry.json has all ${N} entries, not lost to a race (found ${registeredNames.length}: ${registeredNames.join(",")})`);
  for (let i = 0; i < N; i++) {
    assert(registeredNames.includes(`concurrent-api-${i}`), `B-09: registry.json contains concurrent-api-${i}`);
  }

  const settings = JSON.parse(readFileSync(resolve(tmp, ".claude/settings.local.json"), "utf-8"));
  const settingsKeys = Object.keys(settings.mcpServers || {});
  assert(settingsKeys.length === N, `B-09: settings.local.json has all ${N} entries, not lost to a race (found ${settingsKeys.length}: ${settingsKeys.join(",")})`);
  for (let i = 0; i < N; i++) {
    assert(settingsKeys.includes(`ay-api-gen:concurrent-api-${i}`), `B-09: settings.local.json contains ay-api-gen:concurrent-api-${i}`);
  }

  // Lock files must not be left behind after every writer released them.
  const { existsSync: exists } = await import("node:fs");
  assert(!exists(resolve(tmp, ".ay/apis/registry.json.lock")), "B-09: registry.json.lock is cleaned up after all writers finish");
  assert(!exists(resolve(tmp, ".claude/settings.local.json.lock")), "B-09: settings.local.json.lock is cleaned up after all writers finish");
}

// ── T-GEN-2: generated package.json field injection / --name path traversal ──
async function testGen2PackageJsonSafety() {
  console.log("\n--- Integration: T-GEN-2 package.json / --name safety ---");
  const tmp = mkTmpProject();
  const spec = resolve(FIXTURES, "diff-a.json");

  // A crafted --name attempting to escape the default `.ay/apis/` output
  // tree must not produce files outside it.
  // The sanitized name is predictable (see sanitizeApiName in bin/ay-api-gen.js),
  // so pre-seed node_modules at that exact path to skip the network npm-install step.
  preventAutoInstall(resolve(tmp, ".ay/apis/tmp-evil-escape"));
  const { stdout, code } = await runCLI(
    [spec, "--name", "../../../tmp/evil-escape", "--no-settings"],
    { cwd: tmp }
  );
  assert(code === 0, "T-GEN-2: generate exits 0 even with a path-traversal-attempting --name");
  assert(!stdout.includes("/../"), "T-GEN-2: no resolved path in the CLI's own output contains an unresolved '..' segment");

  const { existsSync: exists, readdirSync } = await import("node:fs");
  assert(!exists("/tmp/evil-escape"), "T-GEN-2: --name '../../../tmp/evil-escape' does not escape to /tmp/evil-escape");
  const apisDir = resolve(tmp, ".ay/apis");
  assert(exists(apisDir), "T-GEN-2: output landed inside .ay/apis/ as expected");
  const generatedDirs = readdirSync(apisDir);
  assert(generatedDirs.every(d => !d.includes("..") && !d.includes("/")), `T-GEN-2: every generated dir name under .ay/apis/ is traversal-free (found: ${generatedDirs.join(",")})`);
  assert(generatedDirs.some(d => /^tmp-evil-escape$/.test(d)), "T-GEN-2: the traversal attempt was sanitized into a plain directory name (tmp-evil-escape) and kept inside .ay/apis/");

  // The generated package.json's "name" field must be a well-formed, safe
  // npm package name regardless of how weird the --name input was.
  const outDir = resolve(apisDir, generatedDirs.find(d => /^tmp-evil-escape$/.test(d)));
  const pkg = JSON.parse(readFileSync(resolve(outDir, "package.json"), "utf-8"));
  assert(/^[a-z0-9-]+-mcp$/.test(pkg.name), `T-GEN-2: generated package.json "name" field is a safe, well-formed npm name (got: ${JSON.stringify(pkg.name)})`);
  assert(pkg.version === "1.0.0" && pkg.type === "module" && pkg.private === true, "T-GEN-2: generated package.json's hardcoded fields are untouched by --name content");
  assert(Object.keys(pkg.dependencies).length === 1 && pkg.dependencies["@modelcontextprotocol/sdk"] === "1.29.0", "T-GEN-2: generated package.json's dependencies are exactly the expected pinned set — no injected scripts/dependencies entries");
  assert(!("scripts" in pkg), "T-GEN-2: generated package.json has no scripts field (nothing for npm install to auto-run beyond the declared dependency install)");

  // A spec whose info.title contains characters that would be dangerous in
  // raw string concatenation (quotes, backslashes, newlines) must still
  // produce a syntactically valid package.json with a safely-sanitized name
  // — JSON.stringify() of a real object, not string-built JSON, is what
  // makes this safe; this proves it end-to-end through the actual CLI.
  const maliciousSpec = {
    openapi: "3.0.3",
    info: { title: 'Evil"};"scripts":{"preinstall":"touch /tmp/pwned_t_gen_2"};//', version: "1.0.0" },
    servers: [{ url: "https://8.8.8.8" }],
    paths: { "/x": { get: { operationId: "getX", summary: "x", responses: { 200: { description: "ok" } } } } },
  };
  const maliciousSpecPath = resolve(tmp, "malicious-spec.json");
  writeFileSync(maliciousSpecPath, JSON.stringify(maliciousSpec), "utf-8");

  const outDir2 = resolve(tmp, "out-malicious-title");
  preventAutoInstall(outDir2);
  const { code: maliciousCode } = await runCLI([maliciousSpecPath, "--output", outDir2, "--no-settings"], { cwd: tmp });
  assert(maliciousCode === 0, "T-GEN-2: generate exits 0 with a malicious info.title");
  const pkg2 = JSON.parse(readFileSync(resolve(outDir2, "package.json"), "utf-8")); // throws if not valid JSON
  assert(pkg2.name.endsWith("-mcp") && /^[a-z0-9-]+$/.test(pkg2.name), `T-GEN-2: malicious info.title cannot inject into package.json's structure — name field stays a clean string (got: ${JSON.stringify(pkg2.name)})`);
  assert(!("scripts" in pkg2), "T-GEN-2: malicious info.title did not inject a scripts.preinstall entry");
}

// ── T-GEN-4: output path traversal via --output ──
async function testGen4OutputPathSafety() {
  console.log("\n--- Integration: T-GEN-4 --output path safety ---");
  const tmp = mkTmpProject();
  const spec = resolve(FIXTURES, "diff-a.json");

  // System directories: refused outright, no files written, clean error
  // (not a raw EACCES/permission-denied stack trace — the check fires
  // before any filesystem write is attempted).
  for (const dangerous of ["/etc/ay-api-gen-test", "/usr/local/ay-api-gen-test", "/"]) {
    const { stdout, code } = await runCLI([spec, "--output", dangerous, "--no-settings"], { cwd: tmp });
    assert(code === 1, `T-GEN-4: --output ${dangerous} is refused (exit 1)`);
    assert(stdout.includes("Refusing to write"), `T-GEN-4: --output ${dangerous} gets the clean refusal message, not a raw fs error`);
    assert(!existsSync(dangerous === "/" ? "/mcp-server.js" : resolve(dangerous, "mcp-server.js")), `T-GEN-4: --output ${dangerous} did not actually write any file`);
  }

  // The bare home directory root is refused (exact match only) — but a
  // real project path several levels under $HOME must NOT be refused,
  // since that's where virtually every real project lives.
  const { code: homeRootCode, stdout: homeRootOut } = await runCLI([spec, "--output", homedir(), "--no-settings"], { cwd: tmp });
  assert(homeRootCode === 1, "T-GEN-4: --output <home directory root> is refused (exit 1)");
  assert(homeRootOut.includes("Refusing to write"), "T-GEN-4: home-directory-root refusal uses the clean error message");
  assert(!existsSync(resolve(homedir(), "mcp-server.js")), "T-GEN-4: refusing the home root did not write mcp-server.js directly into it");

  const underHome = resolve(tmp, "nested/project/output"); // tmp itself is under $TMPDIR, not $HOME on macOS/Linux by default, but the real assertion that matters is "a path several segments long is never treated as the bare root"
  preventAutoInstall(underHome);
  const { code: nestedCode } = await runCLI([spec, "--output", underHome, "--no-settings"], { cwd: tmp });
  assert(nestedCode === 0, "T-GEN-4: a real, deeply-nested project output path is never mistaken for a dangerous root");

  // Outside cwd but not dangerous: allowed, with a visible warning — this
  // is the "normal supported use of --output", must not be blocked.
  const siblingDir = resolve(tmp, "..", `ay-api-gen-sibling-${Date.now()}`);
  preventAutoInstall(siblingDir);
  const { stdout: warnOut, code: warnCode } = await runCLI([spec, "--output", siblingDir, "--no-settings"], { cwd: tmp });
  assert(warnCode === 0, "T-GEN-4: --output outside the cwd (but not a dangerous root) succeeds");
  assert(warnOut.includes("warn: output directory is outside the current working directory"), "T-GEN-4: --output outside the cwd prints a visible (non-blocking) warning");
  assert(existsSync(resolve(siblingDir, "mcp-server.js")), "T-GEN-4: the sibling-directory output actually landed where requested");

  // A relative --output that stays inside the cwd must not warn at all.
  const { stdout: noWarnOut, code: noWarnCode } = await runCLI([spec, "--output", "./out-normal", "--no-settings"], { cwd: tmp });
  assert(noWarnCode === 0, "T-GEN-4: a normal relative --output inside the cwd succeeds");
  assert(!noWarnOut.includes("output directory is outside"), "T-GEN-4: a normal relative --output inside the cwd does not trigger the outside-cwd warning");
}

/** Spin up an ephemeral spec+API fixture server and connect a real MCP client to runtime/mcp-server.js against it. */
async function connectMcpFixture(envOverrides = {}) {
  let hitCount = 0;
  const hitTimestamps = [];
  const spec = {
    openapi: "3.0.3",
    info: { title: "Runtime Feature Test API", version: "1.0.0" },
    servers: [{ url: "PLACEHOLDER" }],
    paths: { "/thing": { get: { operationId: "getThing", summary: "Get thing", responses: { 200: { description: "ok" } } } } },
  };
  const server = createServer((req, res) => {
    if (req.url === "/openapi.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(spec)); return; }
    if (req.url === "/thing") {
      hitCount++;
      hitTimestamps.push(Date.now());
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ hit: hitCount }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  spec.servers[0].url = `http://127.0.0.1:${port}`;

  const transport = new StdioClientTransport({
    command: "node",
    args: [RUNTIME_MCP_SERVER_PATH, `http://127.0.0.1:${port}/openapi.json`],
    // AY_ALLOW_PRIVATE_HOSTS: the fixture server is 127.0.0.1 by construction
    // (an ephemeral local test double) — T-ING-2's SSRF guard correctly
    // refuses that by default, so tests need this opt-out, real production
    // use against a real API would not.
    env: { ...process.env, AY_ALLOW_PRIVATE_HOSTS: "1", ...envOverrides },
  });
  const client = new Client({ name: "test-probe", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  return {
    client,
    getHitCount: () => hitCount,
    getHitTimestamps: () => hitTimestamps,
    async close() {
      await client.close();
      await new Promise((r) => server.close(r));
    },
  };
}

// ── Item 23: response caching in runtime (opt-in via AY_CACHE_TTL_MS) ──
async function testResponseCaching() {
  console.log("\n--- Integration: item 23 response caching (real MCP protocol) ---");

  // Disabled by default: two calls must reach the upstream twice.
  const off = await connectMcpFixture();
  try {
    await off.client.callTool({ name: "get_thing", arguments: {} });
    await off.client.callTool({ name: "get_thing", arguments: {} });
    assert(off.getHitCount() === 2, `response-cache: disabled by default, two tool calls reach the upstream twice (got ${off.getHitCount()})`);
  } finally {
    await off.close();
  }

  // Enabled via AY_CACHE_TTL_MS: second call within the TTL is served from
  // cache, upstream is hit only once.
  const on = await connectMcpFixture({ AY_CACHE_TTL_MS: "5000" });
  try {
    const r1 = await on.client.callTool({ name: "get_thing", arguments: {} });
    const r2 = await on.client.callTool({ name: "get_thing", arguments: {} });
    assert(on.getHitCount() === 1, `response-cache: AY_CACHE_TTL_MS=5000, two calls within the TTL hit the upstream once (got ${on.getHitCount()})`);
    assert(JSON.stringify(r1) === JSON.stringify(r2), "response-cache: the cached response is byte-identical to the original");
  } finally {
    await on.close();
  }
}

// ── Item 24: rate limiting in runtime (opt-in via AY_RATE_LIMIT_RPS) ──
async function testRateLimiting() {
  console.log("\n--- Integration: item 24 rate limiting (real MCP protocol) ---");

  // Disabled by default: three sequential calls complete quickly, no
  // artificial delay injected.
  const off = await connectMcpFixture();
  try {
    const start = Date.now();
    for (let i = 0; i < 3; i++) await off.client.callTool({ name: "get_thing", arguments: {} });
    const elapsed = Date.now() - start;
    assert(elapsed < 1000, `rate-limiter: disabled by default, 3 sequential calls complete quickly with no injected delay (took ${elapsed}ms)`);
  } finally {
    await off.close();
  }

  // Enabled via AY_RATE_LIMIT_RPS=2 (min 500ms between requests to the same
  // host): 3 sequential calls must take at least 2 * 500ms = 1000ms total.
  const on = await connectMcpFixture({ AY_RATE_LIMIT_RPS: "2" });
  try {
    const start = Date.now();
    for (let i = 0; i < 3; i++) await on.client.callTool({ name: "get_thing", arguments: {} });
    const elapsed = Date.now() - start;
    assert(elapsed >= 900, `rate-limiter: AY_RATE_LIMIT_RPS=2, 3 sequential calls to the same host take at least ~1000ms total (took ${elapsed}ms)`);
    const timestamps = on.getHitTimestamps();
    for (let i = 1; i < timestamps.length; i++) {
      assert(timestamps[i] - timestamps[i - 1] >= 400, `rate-limiter: gap between upstream hit ${i - 1} and ${i} is at least ~500ms (got ${timestamps[i] - timestamps[i - 1]}ms)`);
    }
  } finally {
    await on.close();
  }
}

// ── Item 19: OpenAPI 3.1 nullable params actually accepted at runtime, not just correct in generated source text ──
async function testOpenAPI31RuntimeNullable() {
  console.log("\n--- Integration: item 19 OpenAPI 3.1 nullable (real MCP protocol) ---");

  let lastQueryString = null;
  const spec = {
    openapi: "3.1.0",
    info: { title: "3.1 Nullable Runtime Test", version: "1.0.0" },
    servers: [{ url: "PLACEHOLDER" }],
    paths: {
      "/widgets": {
        get: {
          operationId: "listWidgets",
          summary: "List widgets",
          parameters: [
            { name: "category", in: "query", schema: { type: ["string", "null"] } },
            { name: "count", in: "query", schema: { type: ["integer", "null"] } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  const server = createServer((req, res) => {
    if (req.url === "/openapi.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(spec)); return; }
    if (req.url.startsWith("/widgets")) {
      lastQueryString = req.url.split("?")[1] || "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  spec.servers[0].url = `http://127.0.0.1:${port}`;

  const transport = new StdioClientTransport({
    command: "node",
    args: [RUNTIME_MCP_SERVER_PATH, `http://127.0.0.1:${port}/openapi.json`],
    env: { ...process.env, AY_ALLOW_PRIVATE_HOSTS: "1" },
  });
  const client = new Client({ name: "test-probe-3.1", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    // The MCP tool schema must accept an explicit null for a nullable
    // 3.1 param — this proves the whole chain end to end: parser.js's
    // normalization -> zodForParam()'s .nullable() -> the actual Zod
    // schema the MCP SDK validates incoming tool-call arguments against.
    // Before the fix, `type: ["string","null"]` silently fell through to
    // z.string() with no .nullable(), so this exact call would have been
    // rejected by Zod as a validation error.
    const result = await client.callTool({ name: "list_widgets", arguments: { category: null, count: 5 } });
    assert(!result.isError, `3.1 nullable (runtime): a tool call with an explicit null for a nullable param is accepted by the generated Zod schema, not rejected (isError=${result.isError})`);
    assert(lastQueryString !== null && !lastQueryString.includes("category="), "3.1 nullable (runtime): a null value for an optional param is correctly omitted from the outgoing request, not sent as the literal string 'null'");
    assert(lastQueryString.includes("count=5"), "3.1 nullable (runtime): a real (non-null) value for the same nullable param is still sent correctly");
  } finally {
    await client.close();
    await new Promise((r) => server.close(r));
  }
}

/** Bind a throwaway server to an OS-assigned port, capture it, close it — gives us a free port to hand to a real test server. */
async function getFreePort() {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  return port;
}

// ── Gap-analysis item: StreamableHTTP transport for `serve` (competitors ship multiple transports, we only had stdio) ──
async function testHttpTransport() {
  console.log("\n--- Integration: StreamableHTTP transport (gap-analysis item) ---");

  // runCLI always spawns BIN_PATH — for this test we need to spawn the
  // runtime script directly, since it's the transport-selection logic
  // itself under test, not the `serve` subcommand wrapper (which just
  // execSync's this same script — also avoids that wrapper's grandchild-
  // process cleanup risk for a server that never exits on its own).
  async function runRuntimeDirect(args, opts = {}) {
    return new Promise((resolvePromise) => {
      const child = spawn("node", [RUNTIME_MCP_SERVER_PATH, ...args], { env: { ...process.env, ...opts.env } });
      let out = "";
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { out += d; });
      const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout || 5000);
      child.on("close", (code) => { clearTimeout(timer); resolvePromise({ stdout: out, code: code ?? 1 }); });
    });
  }

  const badTransportResult = await runRuntimeDirect([resolve(FIXTURES, "diff-a.json"), "--transport", "bogus"]);
  assert(badTransportResult.code === 1, "http transport: an unknown --transport value exits 1");
  assert(badTransportResult.stdout.includes('Unknown --transport "bogus"'), "http transport: an unknown --transport value gets a clear error message");

  const badPortResult = await runRuntimeDirect([resolve(FIXTURES, "diff-a.json"), "--transport", "http", "--port", "999999"]);
  assert(badPortResult.code === 1, "http transport: an out-of-range --port exits 1");
  assert(badPortResult.stdout.includes("Invalid --port"), "http transport: an out-of-range --port gets a clear error message");

  // Real end-to-end protocol test: spec on an ephemeral upstream fixture,
  // MCP server on --transport http, real StreamableHTTPClientTransport
  // roundtrip (list tools, call a tool, confirm the upstream was hit).
  let hitCount = 0;
  const spec = {
    openapi: "3.0.3",
    info: { title: "HTTP Transport Test", version: "1.0.0" },
    servers: [{ url: "PLACEHOLDER" }],
    paths: { "/thing": { get: { operationId: "getThing", summary: "Get thing", responses: { 200: { description: "ok" } } } } },
  };
  const fixtureServer = createServer((req, res) => {
    if (req.url === "/openapi.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(spec)); return; }
    if (req.url === "/thing") { hitCount++; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ hit: hitCount })); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => fixtureServer.listen(0, "127.0.0.1", r));
  const fixturePort = fixtureServer.address().port;
  spec.servers[0].url = `http://127.0.0.1:${fixturePort}`;
  const mcpPort = await getFreePort();

  // No --host passed: proves the DEFAULT bind is loopback-only, not just
  // an explicitly-requested one.
  const child = spawn("node", [
    RUNTIME_MCP_SERVER_PATH, `http://127.0.0.1:${fixturePort}/openapi.json`,
    "--transport", "http", "--port", String(mcpPort),
  ], { env: { ...process.env, AY_ALLOW_PRIVATE_HOSTS: "1" } });

  let serverOutput = "";
  let ready = false;
  child.stderr.on("data", (d) => { serverOutput += d; if (d.toString().includes("listening on")) ready = true; });

  try {
    const start = Date.now();
    while (!ready && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 50));
    assert(ready, "http transport: server prints a 'listening on' line once bound");
    assert(!serverOutput.includes("WARNING"), "http transport: no non-loopback warning when binding to the default host (127.0.0.1)");

    const client = new Client({ name: "http-transport-test", version: "1.0.0" }, { capabilities: {} });
    const clientTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/`));
    await client.connect(clientTransport);

    const tools = await client.listTools();
    assert(tools.tools.some((t) => t.name === "get_thing"), "http transport: listTools() over StreamableHTTP returns the expected tool");

    const result = await client.callTool({ name: "get_thing", arguments: {} });
    assert(!result.isError, "http transport: a real tool call over StreamableHTTP succeeds");
    assert(hitCount === 1, `http transport: the tool call actually reached the upstream fixture exactly once (got ${hitCount})`);

    await client.close();
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => fixtureServer.close(r));
  }

  // Non-default host: the loud warning must actually fire.
  const mcpPort2 = await getFreePort();
  const child2 = spawn("node", [
    RUNTIME_MCP_SERVER_PATH, resolve(FIXTURES, "diff-a.json"),
    "--transport", "http", "--port", String(mcpPort2), "--host", "0.0.0.0",
  ]);
  let warnOutput = "";
  child2.stderr.on("data", (d) => { warnOutput += d; });
  await new Promise((r) => setTimeout(r, 800));
  child2.kill("SIGKILL");
  await new Promise((r) => child2.on("close", r));
  assert(warnOutput.includes("WARNING") && warnOutput.includes("0.0.0.0"), "http transport: binding beyond 127.0.0.1 (e.g. 0.0.0.0) prints a loud, specific warning");
}

async function run() {
  console.log("ay-api-gen — CLI Integration Tests (S2-01)\n");

  const tests = [testDiff, testFilter, testSlim, testDoctor, testDiscover, testInit, testInitWizardStdinTimingHardening, testAuditBaseline, testConcurrentWriteLocking, testGen2PackageJsonSafety, testGen4OutputPathSafety, testResponseCaching, testRateLimiting, testOpenAPI31RuntimeNullable, testHttpTransport];
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
