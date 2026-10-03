# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once open PRs (#7, #8, #9, and this round's timing-fix PR) have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — PRs #2/#3 (or their #5/#6 recreations)
- [x] Deeper competitor research — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing — PR #4 (recreated as #5)
- [x] Handbook alignment check (`ALIGNMENT.md`) — CI never ran the 120-test integration suite, only unit tests. Fixed `ci.yml` — PR #7
- [x] Same gap in the actual npm-publish gate (`release.yml`) — PR #8
- [x] Missing `LICENSE` file despite `package.json` declaring MIT — PR #9
- [x] **LEARN-002 hardening**: `runCLI()`'s scripted-stdin-answer delivery used to be a fixed 200ms delay between writes, regardless of whether the child had actually reached its next `rl.question()` prompt — a real race under CPU contention, now that this suite gates CI (#7/#8). Replaced with event-driven synchronization: `inputLines` entries can now be `{ waitFor, send, maxWaitMs? }`, and a new `waitForOutput()` polls the child's stdout until the real prompt appears (default cap 4s, never hangs). Updated both existing `testInit()` call sites. Added deterministic regression tests (`testInitWizardStdinTimingHardening`) since a wall-clock CPU-stress test didn't reliably reproduce the original race (same experience as the B-09 file-lock work): a fixture script with a prompt delayed 600ms past spawn (a) reproduces the OLD bug's exact failure mode and (b) proves the NEW mechanism delivers correctly regardless — plus, after an adversarial review flagged it as an untested branch, a second fixture proving the `maxWaitMs` timeout-fallback path itself works (sends anyway, doesn't hang). 166/166 unit + 125/125 integration (5 new), 5+ consecutive clean integration runs, no leaked processes.

## Considered and deliberately NOT done

- **Wiring pin-guard's supply-chain scan into CI as an automated step.** Real idea, checked before building: this repo has one pre-existing HIGH pin-guard finding (`regen-apis.yml`'s unpinned `npx ay-api-gen`) that's genuinely unfixable until the npm-publish naming/credentials decision (Task 17) lands. A blocking CI step would permanently redden CI; a non-blocking version would need vendoring a personal tool into the repo. Worth revisiting once Task 17 unblocks.
- **Adding a root `CHANGELOG.md`.** Real gap, lower priority than the LICENSE fix — this project already has a detailed `.ay/tracking/CHANGELOG.md`; a root-level one needs real editorial effort plus a sync-forever question. Flagged for a future round, not done reflexively.

## PR history (this repo, so far)

- #1, #2, #5, #6 — merged into `master`. Process mistake (merging is Walid's call alone, never mine) — corrected, will not happen again. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge (a side effect of the mistake above) — recreated as #5/#6.
- #7 — open, CI integration-test wiring + `ALIGNMENT.md`. Awaiting review.
- #8 — open, same fix applied to `release.yml`. Awaiting review.
- #9 — open, missing `LICENSE` file + survey findings. Awaiting review.
- Current branch (`test/harden-init-wizard-stdin-timing`) — the LEARN-002 fix, about to be opened as a PR.

## Notes

- **Standing rule, corrected by Walid this session: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call.
- **Branching gotcha**: `master` can be stale relative to open PRs (currently missing #7/#8/#9's fixes). Branch off whichever ref actually has the code/docs a new chunk depends on, and check `git status`/diff content after any branch switch — hit a real merge conflict in this very file mid-session from a stash/switch/pop sequence, resolved by hand rather than guessing.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) were checked against current code and confirmed already adequately mitigated.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) — both real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
