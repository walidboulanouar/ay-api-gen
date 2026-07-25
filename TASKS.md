# Tasks Board

Lightweight todo/doing/done board for the current autonomous work window (started 2026-07-25, post-PR#1). Not a replacement for `.ay/tracking/BOARD.md` — this is a short-lived scratch board so work survives a `/compact`.

## Doing

- (nothing in flight)

## Todo

- Deeper competitor research pass (browser-visual inspection of pricing/docs pages via chrome-devtools/claude-in-chrome, where text-only research hit auth walls) — next chunk, will run as a parallel subagent

## Done

- [x] T-ING-3 — DoS via large/deeply-nested spec: 25MB size cap added (`parser.js` + `discover.js`), statSync for local files, streaming byte-counter for fetched URLs
- [x] T-API-6 — spec-linter check for "no declared rate limiting" (follows T-API-4/T-API-5 pattern exactly)
- [x] T-GEN-3 / T-SUP-2 — verified: generated `package.json` already exact-pins its one dependency, no fix needed
- [x] 160/160 unit tests, 120/120 integration tests, clean pin-guard scan
- [x] `.ay/tracking/*.md` + `PROGRESS-LOG.md` + `README.md` updated
- [x] Branch `security/threat-model-remaining-gaps` created off `master`, committed, pushed, PR opened

## Notes

- Source of new work: re-read `.ay/PRODUCT.md`, `GAP-ANALYSIS.md`, `HUMAN-SETUP-NEEDED.md`, and the full `THREAT-MODEL.md` (on `security-threat-model` branch — doesn't exist on `ay-framework`/`master`, pull via `git show security-threat-model:docs/security/THREAT-MODEL.md`). Cross-checked every threat ID against current code; most were already closed in S1-S3. Three genuine gaps remained, all engineering-scoped, no live infra needed — picked up here.
- Repo default branch is `master`. Per new standing rule: branch off `master` for each meaningful chunk, push, open a PR — never commit to `master`/`ay-framework` directly, never force-push.
