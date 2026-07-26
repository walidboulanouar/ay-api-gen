# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#15) have had a chance to be reviewed by Walid. Deep-read backlog (`validator.js`, `filter.js`, `slim.js` — `diff.js` now done) is closed out; next survey starts fresh rather than assuming there's always one more thing.

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
- [x] **Real bug in `diff.js`**: endpoints matched by an order-dependent derived `toolName` (a "_2"/"_3" dedup suffix from spec-declaration order), not a stable identity — two specs with the exact same endpoints, just reordered, produced false "changed" (path/summary "changed") reports. Fixed by matching on `(method, path)`. Reproduced the bug concretely, proved the fix with revert-confirm-restore (temporarily reverted, confirmed the new tests fail as expected, restored). 8 new tests — PR #15

## Considered and deliberately NOT done

- **Wiring pin-guard's supply-chain scan into CI.** Blocked by one pre-existing HIGH finding that's genuinely unfixable until Task 17 (npm naming/credentials) lands. Revisit once that unblocks.
- **CONTRIBUTING.md / CODE_OF_CONDUCT.md / issue-PR templates.** Premature ceremony for a single-maintainer, unpublished repo.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. Process mistake (merging is Walid's call alone, never mine) — corrected, will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge — recreated as #5/#6.
- #7 through #15 — all open, all awaiting Walid's review. None merged.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop.
- **Branching gotcha**: `master` is stale relative to every open PR right now. Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch.
- The survey pattern that found #15 (a targeted, deep, cold read of specific files rather than a broad shallow sweep) found a materially more significant bug than the prior rounds' hygiene fixes — worth remembering that "deep-read N files nobody's looked at yet" is a higher-yield search strategy than "check for missing standard files" once the obvious hygiene gaps are closed.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
