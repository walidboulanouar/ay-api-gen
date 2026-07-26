# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#17) have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — PRs #2/#3 (or #5/#6 recreations)
- [x] Deeper competitor research — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing — PR #4 (recreated as #5)
- [x] Handbook alignment check (`ALIGNMENT.md`) — CI never ran the integration suite. Fixed `ci.yml` — PR #7
- [x] Same gap in `release.yml` (the npm-publish gate) — PR #8
- [x] Missing `LICENSE` file — PR #9
- [x] LEARN-002: hardened init-wizard stdin-timing race (deterministic proof) — PR #10
- [x] Same race class found in `testHttpTransport`'s warning wait — PR #11
- [x] Missing root `CHANGELOG.md` — PR #12
- [x] Missing `SECURITY.md` — PR #13
- [x] README's command/options docs drifted badly out of sync with real `--help` — PR #14
- [x] Real bug in `diff.js`: order-dependent `toolName` matching produced false "changed" reports on reordered-but-identical specs. Fixed to match on `(method, path)` — PR #15
- [x] Real bug in `reverse.js`: `readMCPTools()`'s regex never matched this project's own generated output after the T-RUN-3 `safeDescription()` security fix (S1) changed the tool-description argument shape — the entire reverse-generation feature was silently broken against real generated servers. Fixed, 5 new tests, revert-confirm-restore proved — PR #16
- [x] **Real SSRF bug in `doctor.js`**: the "base URL reachable"/"API responds" health checks fetched `process.env.API_BASE_URL || parsed.baseUrl` directly — neither the T-RUN-1 same-host-override constraint nor the T-ING-2 private-IP/cloud-metadata deny-list that every OTHER outbound-request path in this project enforces (`runtime/mcp-server.js`, `runtime/cli.js`, the generated CLI) was applied here. `doctor` is documented as a read-only health check but still attaches real auth headers to its request — an attacker who can write settings.json's `API_BASE_URL` (T-SET-*) could point a "safe" health check at an internal host or `169.254.169.254` and have it fetched WITH credentials. Found in the same deep-read pass as #16 (`registry.js`/`env-generator.js` came back clean on a genuine cold read). Confirmed exploitable via revert-confirm-restore BEFORE fixing: reverted the fix, a real canary server on a private IP received 3 requests (proving the old code really did dial an unguarded private host); with the fix, exactly 1 (the spec fetch, a separate, already-assessed lower-priority item). Fixed by routing through `resolveBaseUrl()`/`assertHostAllowed()`, same as everywhere else. 6 new tests, including a real network-level hit-counter assertion, not just a status-string check. 171/171 unit (unaffected by this PR), 126/126 integration, clean pin-guard — PR #17

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call.
- **Branching gotcha**: `master` is stale relative to every open PR right now. Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch.
- Three consecutive rounds now (#15 diff.js, #16 reverse.js, #17 doctor.js) found materially significant bugs — including a real, exploitable SSRF — via the same strategy: a targeted, deep, cold read of specific under-examined source files, cross-checked against actual test coverage. All three bugs lived in code paths with weak or zero real test coverage. Worth continuing this pattern over broad hygiene sweeps, now that the obvious hygiene gaps (LICENSE, CHANGELOG, SECURITY.md, README drift) are closed. `registry.js` and `env-generator.js` are the only two files checked this pass that genuinely came back clean.
- A one-off integration-test flake recurred again this round (1 failure, immediately clean on 3 reruns) — same pre-existing transient-load pattern seen a few times this session, confirmed each time to be unrelated to the change under test, not a new regression.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
