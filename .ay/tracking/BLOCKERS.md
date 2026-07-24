# Active Blockers

| # | Blocker | Task | Owner | Status | Since |
|---|---------|------|-------|--------|-------|
| B-01 | `npm login` credentials not configured | Task 17 (publish to npm) | walid | WAITING (on Walid) | 2026-05-10 |
| B-02 | Product name not decided | Task 17 (publish to npm) | walid + luisa | OPEN | 2026-05-22 |
| B-03 | ADR-006 Acceptance gated on S1-01..04 landing | S1-08 | luisa | RESOLVED — fixes landed 2026-07-25, needs Luisa's review pass to flip ADR status | 2026-05-22 |
| B-04 | v0.1.1 features (doctor/init/discover/diff/slim/filter/truncate) shipped without integration tests | S2-01 | - | RESOLVED 2026-07-25 — `test/integration-cli.js`, 50 real CLI tests (`truncate.js` was already covered by S1's `testSecurityHardening()`) | 2026-05-11 |
| B-05 | `truncate.js` exists but not wired into runtime — T-RUN-4 / T-RUN-6 still open | S1-02 | walid | RESOLVED 2026-07-25 — wired into runtime + generated server via `asMcpContent()` | 2026-05-11 |
| B-06 | Pre-commit lock convention in CLAUDE.md vs framework reality | (meta) | walid | INVESTIGATING — Luisa wants to keep it; framework now installs the hook so this may be auto-resolved | 2026-05-21 |
| B-07 | Sandbox infra unbuilt — blocks T1/T2 commercial work | C-01, C-03 | - | OPEN (post-S1) | 2026-05-22 |
| B-08 | No license-key system → no commercial gating possible | C-04 | - | OPEN (post-S1) | 2026-05-22 |
| B-09 | Unlocked read-modify-write of `settings.local.json` — concurrent `ay-api-gen` invocations (e.g. CI regen overlapping a local run) could lose an update | S2-04 follow-up | - | OPEN, P3 — not attacker-triggerable via spec content, needs a file lock to fix | 2026-07-25 |

Status: OPEN, INVESTIGATING, WAITING, RESOLVED

## Resolution notes

- **B-06** — `node bin/install.js --local --yes` on 2026-05-24 added `.claude/hooks/pre-commit-check.sh` and `.claude/hooks/session-start.sh`. Confirm hook is registered in `.git/hooks/pre-commit` (framework's installer should symlink); if not, that is a separate one-line fix.
- **B-03 / B-05** — S1-01..S1-07 all landed 2026-07-25 (see HANDOFFS.md for the full breakdown). ADR-006 itself is still formally "Proposed" until Luisa reviews and flips it — that review is the only remaining step in B-03.
- **B-04** — S2-01 landed 2026-07-25, `test/integration-cli.js` (50 tests, real CLI child-process spawns).
