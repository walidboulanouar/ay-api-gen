# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#16) have had a chance to be reviewed by Walid.

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
- [x] **Real bug in `reverse.js`**: `readMCPTools()`'s `server.tool()`-parsing regex only ever matched a plain quoted-string second argument. The T-RUN-3 security fix (S1, this same session's earlier work) wrapped every generated tool description in `safeDescription(<raw>, "tool") || "<fallback>"` — an expression, not a string literal — so the regex silently extracted ZERO tools from every real `generateMCPServer()` output since S1 landed. The entire reverse-generation feature (`--from-mcp <generated-server-file>`, a documented top-level feature) was broken against this project's own real output, uncaught because `readMCPTools()` had zero test coverage against actual generated code. Confirmed via a direct repro (generate a real server, extract tools, got `[]`) before touching any code. Fixed with an alternation that extracts the raw description from inside `safeDescription(...)` when present, falling back to the plain-literal form for backward compat with hand-written/third-party MCP server files. Proved with revert-confirm-restore (temporarily reverted, 3 of 5 new assertions failed exactly as predicted, restored, all pass). 5 new tests. 171/171 unit, 120/120 integration, clean pin-guard — PR #16

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call.
- **Branching gotcha**: `master` is stale relative to every open PR right now. Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch.
- Two consecutive rounds now (#15 diff.js, #16 reverse.js) found materially more significant bugs than the hygiene-fix rounds before them, both via the same strategy: a targeted, deep, cold read of specific under-examined source files rather than a broad shallow sweep, cross-checked against actual test coverage (both bugs lived in code paths with weak or zero real test coverage). Worth continuing this pattern for future rounds over broad hygiene sweeps, now that the obvious hygiene gaps (LICENSE, CHANGELOG, SECURITY.md, README drift) are closed.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
