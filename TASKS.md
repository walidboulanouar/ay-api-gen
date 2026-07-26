# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7-#14) have had a chance to be reviewed by Walid. Next survey should genuinely consider standing down if nothing real turns up — see Notes.

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
- [x] README's "All commands"/"Options" sections had drifted badly out of sync with the real `--help` output (7/12 commands, 6/19 flags documented) — including, ironically, the security-linting flags (`--mode`, `--accept-risks`, `audit --baseline`) this project's own differentiator leans on. Verified line-by-line against actual `--help` output, not guessed — PR #14

## Considered and deliberately NOT done

- **Wiring pin-guard's supply-chain scan into CI.** Blocked by one pre-existing HIGH finding that's genuinely unfixable until Task 17 (npm naming/credentials) lands. Revisit once that unblocks.
- **CONTRIBUTING.md / CODE_OF_CONDUCT.md / issue-PR templates.** Standard for a project soliciting outside contributors; this is a single-maintainer, unpublished repo. Premature ceremony right now, not a gap.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. Process mistake (merging is Walid's call alone, never mine) — corrected, will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge — recreated as #5/#6.
- #7 through #14 — all open, all awaiting Walid's review. None merged.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop.
- **Branching gotcha**: `master` is stale relative to every open PR right now. Branch off whichever ref actually has what a new chunk depends on, and check `git status`/diff content after any branch switch.
- This round's survey fork was explicitly told not to manufacture busywork and to report honestly if nothing real was left — it found one genuine, concrete, demonstrable gap (README/--help drift) rather than padding with style opinions. Worth running the same "honest survey, report nothing if there's nothing" pattern for the next round too, rather than assuming there's always one more small thing.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) checked against current code, confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
