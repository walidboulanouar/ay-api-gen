# Active Blockers

| # | Blocker | Task | Owner | Status | Since |
|---|---------|------|-------|--------|-------|
| B-01 | `npm login` credentials not configured | Task 17 (publish to npm) | walid | WAITING (on Walid) | 2026-05-10 |
| B-02 | Product name not decided | Task 17 (publish to npm) | walid + luisa | OPEN | 2026-05-22 |
| B-03 | ADR-006 Acceptance gated on S1-01..04 landing | S1-08 | luisa | OPEN | 2026-05-22 |
| B-04 | v0.1.1 features (doctor/init/discover/diff/slim/filter/truncate) shipped without integration tests | S2-01 | - | OPEN | 2026-05-11 |
| B-05 | `truncate.js` exists but not wired into runtime — T-RUN-4 / T-RUN-6 still open | S1-02 | walid | OPEN | 2026-05-11 |
| B-06 | Pre-commit lock convention in CLAUDE.md vs framework reality | (meta) | walid | INVESTIGATING — Luisa wants to keep it; framework now installs the hook so this may be auto-resolved | 2026-05-21 |
| B-07 | Sandbox infra unbuilt — blocks T1/T2 commercial work | C-01, C-03 | - | OPEN (post-S1) | 2026-05-22 |
| B-08 | No license-key system → no commercial gating possible | C-04 | - | OPEN (post-S1) | 2026-05-22 |

Status: OPEN, INVESTIGATING, WAITING, RESOLVED

## Resolution notes

- **B-06** — `node bin/install.js --local --yes` on 2026-05-24 added `.claude/hooks/pre-commit-check.sh` and `.claude/hooks/session-start.sh`. Confirm hook is registered in `.git/hooks/pre-commit` (framework's installer should symlink); if not, that is a separate one-line fix.
