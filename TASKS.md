# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7, #8, and this round's LICENSE PR) have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — PRs #2/#3 (or their #5/#6 recreations, see PR history)
- [x] Deeper competitor research (browser-equipped subagent) — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing — PR #4 (recreated as #5 after an auto-close, see PR history)
- [x] Handbook alignment check (`ALIGNMENT.md`) — found CI ran unit tests only, never the 120-test integration suite. Fixed `ci.yml` (`npm run test:all`). Self-checked against ISO-029, ran `pr-reviewer` (all pass), adversarial-fork review came back clean — PR #7 (open, awaiting review)
- [x] Same gap, same fix, found in the actual npm-publish gate: `release.yml` also only ran `node test/run.js` before `npm publish` — even higher stakes than CI, since a broken integration behavior could ship to real npm users. Swapped for `npm run test:all` — PR #8 (open, awaiting review)
- [x] Broad survey fork (post-#7/#8) for any remaining real, buildable-without-infra gap: checked test coverage (clean — `init-wizard.js`'s only "unit-untested" module, but covered end-to-end via `test/integration-cli.js`'s `testInit()`), re-read every "documented not built" blocker skeptically (all still genuinely blocked), read `parser.js`/`runtime/cli.js`/`doctor.js` cold for uncaught issues (none found). One real finding: **no `LICENSE` file exists despite `package.json` declaring `"license": "MIT"`** — confirmed independently via `find . -maxdepth 1 -iname "license*"`, zero results. GitHub treats a repo with no LICENSE as "all rights reserved" by default, actively contradicting the stated MIT intent right now, not just at publish time. Zero-risk, no decision needed, unlike the naming/npm-login blocker. Fixing this round.
- [x] 166/166 unit tests, 120/120 integration tests, clean pin-guard scan (current)

## Considered and deliberately NOT done this round

- **Wiring pin-guard's supply-chain scan into CI as an automated step.** Real idea, checked before building: `pin-guard/scripts/scan.py` exits 1 on any non-info finding, and this repo currently has one pre-existing HIGH finding (`regen-apis.yml`'s unpinned `npx ay-api-gen`) that is genuinely NOT fixable right now — you can't pin an exact version of a package that isn't published to npm yet (blocked on the Task 17 naming/credentials decision). A blocking CI step would permanently redden CI for a reason nobody can currently fix; a non-blocking version would need vendoring `scan.py` + `iocs.json` into this repo (a personal tool, not a project dependency) — bigger scope, its own sync-maintenance question. Worth revisiting once Task 17 unblocks.
- **Adding a root `CHANGELOG.md`** (npm/GitHub convention). Real gap, lower priority than the LICENSE — this project already has a very detailed `.ay/tracking/CHANGELOG.md`; a root-level one would need real editorial effort to summarize that history well, plus a "keep both in sync going forward" question nobody's answered. Flagged as a real candidate for a future round, not done reflexively just because it's conventional.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. This was a process mistake (merging is Walid's call alone, never mine) — corrected; will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge (a stacked-PR side effect of the mistake above, not a separate bug) — recreated as #5/#6.
- #7 — open, CI integration-test wiring + `ALIGNMENT.md`. Not merged; awaiting Walid's review.
- #8 — open, same fix applied to `release.yml`, the actual npm-publish gate. Not merged; awaiting Walid's review.
- Current branch (`chore/add-license`) — adding the missing `LICENSE` file.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call, made by him reviewing the diff.
- **Branching gotcha**: `master` can be stale relative to open PRs (right now it's missing #7's `ci.yml` fix and #8's `release.yml` fix). Branch off whichever ref actually has the code/docs a new chunk depends on, and check `git status`/diff content after any branch switch before assuming a file has what you expect. Confirmed this gotcha again mid-session (a `git stash`/branch-switch/`stash pop` sequence produced a real merge conflict in this very file) — resolved by hand, not by guessing which side was "right."
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) were checked against current code and confirmed already adequately mitigated — not silently skipped, just genuinely fine.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) are both real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
