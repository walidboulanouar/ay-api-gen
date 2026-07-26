# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#11) have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — PRs #2/#3 (or #5/#6 recreations)
- [x] Deeper competitor research — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing — PR #4 (recreated as #5)
- [x] Handbook alignment check (`ALIGNMENT.md`) — CI never ran the 120-test integration suite. Fixed `ci.yml` — PR #7
- [x] Same gap in `release.yml` (the npm-publish gate) — PR #8
- [x] Missing `LICENSE` file — PR #9
- [x] LEARN-002: hardened `runCLI()`'s init-wizard scripted-stdin delivery from a fixed 200ms delay (a real race) to event-driven `waitFor` synchronization, with a deterministic regression test proving both the old bug and the fix — PR #10
- [x] Found the same race class again in `testHttpTransport()`'s warning-wait (blind fixed 800ms delay) while reviewing for other instances — reused the already-proven poll pattern from the adjacent "listening on" check. Bonus: suite runtime dropped ~12-14s → ~7-9s — PR #11

## Considered and deliberately NOT done

- **Wiring pin-guard's supply-chain scan into CI.** Blocked by one pre-existing HIGH finding that's genuinely unfixable until Task 17 (npm naming/credentials) lands. Revisit once that unblocks.
- **Root `CHANGELOG.md`.** Real gap, lower priority — needs real editorial effort against the existing detailed `.ay/tracking/CHANGELOG.md`, plus a sync-forever question. Flagged for a future round.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. Process mistake (merging is Walid's call alone, never mine) — corrected, will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge — recreated as #5/#6.
- #7, #8, #9, #10, #11 — all open, all awaiting Walid's review. None merged.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop.
- **Branching gotcha**: `master` is stale relative to every open PR right now (#7 through #11 all touch things `master` doesn't have yet). Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch — this file itself has round-tripped through a real merge conflict once already this session from a stash/switch/pop sequence.
- After fixing LEARN-002 (PR #10), did a quick sweep of the rest of the test suite for the same fixed-delay-instead-of-poll pattern and found one more instance (`testHttpTransport`'s warning wait, PR #11) — worth periodically re-checking for this pattern class in future test additions, not just this once.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
