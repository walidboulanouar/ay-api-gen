# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — PRs #2/#3 (or their #5/#6 recreations, see PR history)
- [x] Deeper competitor research (browser-equipped subagent) — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing — PR #4 (recreated as #5 after an auto-close, see PR history)
- [x] Handbook alignment check (`ALIGNMENT.md`) — found CI ran unit tests only, never the 120-test integration suite. Fixed `ci.yml` (`npm run test:all`). Self-checked against ISO-029, ran `pr-reviewer` (all pass), adversarial-fork review came back clean — PR #7 (open, awaiting review)
- [x] Same gap, same fix, found in the actual npm-publish gate: `release.yml` also only ran `node test/run.js` before `npm publish` — even higher stakes than CI, since a broken integration behavior could ship to real npm users. Swapped for `npm run test:all` — this PR
- [x] 166/166 unit tests, 120/120 integration tests, clean pin-guard scan (current)

## Considered and deliberately NOT done this round

- **Wiring pin-guard's supply-chain scan into CI as an automated step.** Real idea, but checked before building: `pin-guard/scripts/scan.py` exits 1 on any non-info finding, and this repo currently has one pre-existing HIGH finding (`regen-apis.yml`'s unpinned `npx ay-api-gen`) that is genuinely NOT fixable right now — you can't pin an exact version of a package that isn't published to npm yet (blocked on the Task 17 naming/credentials decision, same blocker documented since S1). Adding it as a blocking CI step would permanently redden CI for a reason nobody can currently fix, which is worse than not having it. Making it non-blocking/informational instead would require vendoring `scan.py` + `iocs.json` into this repo (they don't exist here — pin-guard lives at `~/.claude/skills/pin-guard/`, a personal tool, not a project dependency), which is a bigger change with its own sync-with-canonical-source maintenance question nobody asked for. Flagging as a real candidate for later, not silently dropping it — worth revisiting once Task 17 unblocks, since at that point the one existing finding goes away and a blocking step becomes viable.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. This was a process mistake (merging is Walid's call alone, never mine) — corrected; will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge (a stacked-PR side effect of the mistake above, not a separate bug) — recreated as #5/#6.
- #7 — open, CI integration-test wiring + `ALIGNMENT.md`. Not merged; awaiting Walid's review.
- Current branch (`ci/wire-integration-tests-release-gate`) — the same fix applied to `release.yml`, the actual npm-publish gate.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call, made by him reviewing the diff.
- **Branching gotcha**: `master` can be stale relative to open PRs (right now it's missing PR #7's `ci.yml` fix, for instance). Branch off whichever ref actually has the code/docs a new chunk depends on, and check `git status`/diff content after any branch switch before assuming a file has what you expect.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) were checked against current code and confirmed already adequately mitigated — not silently skipped, just genuinely fine.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) are both real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
