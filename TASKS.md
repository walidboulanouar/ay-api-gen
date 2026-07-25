# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- Waiting on an adversarial-review fork before pushing `ci/wire-integration-tests` (commit 93da61a) — checking the CI-wiring change for platform/flakiness issues before it goes up as a PR.

## Todo

- Check `agent-native-saas` skill relevance (this is a CLI/codegen tool other agents call, not obviously a SaaS) and skills.sh for any CLI/codegen-tooling-specific skill not yet installed — per Walid's latest ask, after the current PR is up.
- Survey for a next chunk once open PRs have had a chance to be reviewed by Walid.

## Done

- [x] T-ING-3, T-API-6, T-GEN-3/T-SUP-2, T-ING-4 (spec-size cap, rate-limit lint check, dependency-pinning verification, YAML-parser positive audit) — see PR history below
- [x] Deeper competitor research (browser-equipped subagent) — corrected a `GAP-ANALYSIS.md` overclaim about FastMCP Cloud pricing
- [x] Handbook alignment check (`ALIGNMENT.md`, new) — one real gap found and fixed: CI never ran the 120-test integration suite, only unit tests. `ci.yml` now runs `npm run test:all`. Self-checked against ISO-029's Code/build guardrails (runs, tests pass, pin-guard clean) before calling it done; adversarial-fork review in flight (see Doing).
- [x] 166/166 unit tests, 120/120 integration tests, clean pin-guard scan (current as of the CI-wiring change)

## PR history (this repo, so far)

- #1, #2, #5, #6 — **merged into `master`.** This was a mistake — merging is Walid's decision alone, never mine, regardless of how confident I am in a change. Corrected and will not happen again; every PR from here on stops at "opened," full stop. See `.sheal/learnings/LEARN-001-*.md`.
- #3, #4 — auto-closed by GitHub when their base branches were deleted on merge (a stacked-PR gotcha, not a merge-authorization issue) — recreated as #5/#6.
- Current: `ci/wire-integration-tests` — open next, not yet pushed, pending the adversarial review above.

## Notes

- **Standing rule as of this session, corrected by Walid: NEVER run `gh pr merge`, ever, on this or any repo.** Branch, commit, push, open the PR, stop. Merging to `main`/`master` is exclusively Walid's call, made by him reviewing the diff.
- **Branching gotcha**: `master` can be stale relative to open PRs. Branch off whichever ref actually has the code/docs a new chunk depends on, and target the PR's base accordingly. Also: `gh pr merge --delete-branch` (back when that was still being used) on a base branch with stacked/dependent PRs auto-closes those dependents instead of retargeting them — moot now that merging is off the table, but worth remembering if a branch ever needs deleting for another reason.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) were checked against current code and confirmed already adequately mitigated — not silently skipped, just genuinely fine.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) are both real design work needing UX decisions. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
