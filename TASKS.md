# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Survey for a next chunk once PRs #2/#3/#4 have had a chance to be reviewed — see Notes for candidates already ruled in/out.

## Done

- [x] T-ING-3 — DoS via large/deeply-nested spec: 25MB size cap added (`parser.js` + `discover.js`), statSync for local files, streaming byte-counter for fetched URLs — PR #2
- [x] T-API-6 — spec-linter check for "no declared rate limiting" (follows T-API-4/T-API-5 pattern exactly) — PR #2
- [x] T-GEN-3 / T-SUP-2 — verified: generated `package.json` already exact-pins its one dependency, no fix needed — PR #2
- [x] T-ING-4 — positively audited the real `yaml` package (alias-bomb guard, merge-key non-expansion, `__proto__` non-pollution), all verified empirically with 6 new tests, no fix needed — PR #3 (stacked on #2)
- [x] Deeper competitor research (browser-equipped subagent, chrome-devtools/claude-in-chrome) — found FastMCP Cloud/Prefect Horizon actually has a public, readable free-tier pricing page (prior research hit a gated URL and reported "not found"); corrected `GAP-ANALYSIS.md`'s one resulting overclaim — PR #4 (independent, branched off `ay-framework`)
- [x] 166/166 unit tests, 120/120 integration tests, clean pin-guard scan (after T-ING-4)
- [x] `.ay/tracking/*.md` + `PROGRESS-LOG.md` + `README.md` + `GAP-ANALYSIS.md` updated
- [x] 3 branches created (never off stale `master` directly — see Notes), 3 PRs opened: #2, #3 (stacked on #2), #4 (independent)

## Notes

- Source of new work: re-read `.ay/PRODUCT.md`, `GAP-ANALYSIS.md`, `HUMAN-SETUP-NEEDED.md`, and the full `THREAT-MODEL.md` (on `security-threat-model` branch — doesn't exist on `ay-framework`/`master`, pull via `git show security-threat-model:docs/security/THREAT-MODEL.md`). Cross-checked every threat ID against current code; most were already closed in S1-S3.
- **Branching gotcha learned the hard way this session**: `master` is stale — PR #1 (`ay-framework` → `master`) is still open, so `master` doesn't have the S1-S3 security work, `GAP-ANALYSIS.md`, or anything else this session depends on. Branching a new chunk off literal `master` loses all of that. Fix: branch off whichever ref actually has the code/docs the new chunk depends on (`ay-framework`'s tip, or an already-pushed sibling branch for a stacked PR), and target the PR's base accordingly (`master` for independent work that doesn't need unreleased code, the dependency branch for stacked work). Confirmed this the wrong way once already (accidentally edited `test/run.js` while sitting on stale `ay-framework`, silently lost the T-ING-3 test additions until caught by an unexpected test-count drop) — always `git status`/check which branch + what's actually in the file before editing when resuming after a branch switch.
- Remaining `THREAT-MODEL.md` items (T-RUN-2, T-RUN-5, T-RUN-7) were checked against current code and confirmed already adequately mitigated (see PROGRESS-LOG.md's T-ING-3/T-API-6 session entry) — not silently skipped, just genuinely fine.
- Ruled out as next chunks (real but not right-sized): multi-tool workflow composition and multi-spec merge (item 21) are both real design work needing UX decisions, not same-session-sized. C-01..C-07 all still genuinely blocked on human decisions or live infra — see `SHOWCASE.html`'s provisioning checklist.
