# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#18) have had a chance to be reviewed by Walid.

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
- [x] Real bug in `reverse.js`: `readMCPTools()`'s regex never matched this project's own generated output since the T-RUN-3 `safeDescription()` fix — the entire reverse-generation feature was silently broken. Fixed, revert-confirm-restore proved — PR #16
- [x] **Real, exploitable SSRF in `doctor.js`**: health checks dialed out with real auth headers, skipping the SSRF/host-rebind guards every other outbound path enforces. Confirmed exploitable via a canary server on a private IP before fixing. Fixed by routing through `resolveBaseUrl()`/`assertHostAllowed()` — PR #17
- [x] **T-GEN-5 — a real command injection in `run`/`serve`, the most severe finding this session**: both re-exec'd their runtime scripts via `execSync(shellString)` with `JSON.stringify()`-"quoted" args — which does NOT stop `$(...)` command substitution inside POSIX double quotes. Confirmed with a real repro (`ay-api-gen run <spec> '$(touch /tmp/x)' list` actually created the file) before touching code. Fixed by switching to `execFileSync(process.execPath, argvArray)` — no shell involved at all. Revert-confirm-restore caught its own bug on the first attempt (a nested `JSON.stringify()` in the test payload masked the vulnerability on revert — a false negative) — fixed the test, then it correctly proved both the bug and the fix. `init-wizard.js` checked too, came back clean (one trivial unused-import nit, not fixed). 3 new tests, `test/integration-cli.js` 123/123 — PR #18

## Considered and deliberately NOT done

- **Wiring pin-guard's supply-chain scan into CI.** Blocked by one pre-existing HIGH finding that's genuinely unfixable until Task 17 (npm naming/credentials) lands. Revisit once that unblocks.
- **CONTRIBUTING.md / CODE_OF_CONDUCT.md / issue-PR templates.** Premature ceremony for a single-maintainer, unpublished repo.
- **`init-wizard.js`'s unused `generateEnvExample` import.** Dead code, trivial, not worth its own PR.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. Process mistake (merging is Walid's call alone, never mine) — corrected, will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge — recreated as #5/#6.
- #7 through #18 — all open, all awaiting Walid's review. None merged.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop.
- **Branching gotcha**: `master` is stale relative to every open PR right now. Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch.
- **Trust-but-verify lesson from PR #18**: a revert-confirm-restore test is only as trustworthy as its own payload construction. The first draft of the command-injection regression test nested an extra `JSON.stringify()` around the marker path inside the injection payload — that extra layer of escaped quotes subtly broke the `$()` parsing in a way that made the vulnerable code *pass* the test on revert (a false negative). Caught by actually checking *which* test failed/passed after reverting, not just trusting the aggregate pass/fail count. Worth remembering for any future shell-quoting-adjacent test.
- Four consecutive rounds now (#15 diff.js, #16 reverse.js, #17 doctor.js SSRF, #18 run/serve command injection) found materially significant bugs — two of them genuinely exploitable security issues — via the same strategy: a targeted, deep, cold read of specific under-examined source files, cross-checked against real test coverage. `registry.js`, `env-generator.js`, and `init-wizard.js` are the only files checked this way that came back genuinely clean.
- A one-off integration-test flake recurred again this round (1 failure on an unrelated T-GEN-4 test, immediately clean on reruns) — same pre-existing transient-load pattern seen several times this session, confirmed unrelated each time.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
