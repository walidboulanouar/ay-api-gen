# Human Setup Needed

Credentials / decisions a human must provide. Deduplicated; append here as new ones surface, don't duplicate.

---

## `NPM_TOKEN` (GitHub Actions secret)

- **What it's for:** `.github/workflows/release.yml` uses it as `NODE_AUTH_TOKEN` to publish this package to the npm registry.
- **Where to get it:** npmjs.com → account settings → Access Tokens → generate an "Automation" token → add as a repo secret named `NPM_TOKEN` in GitHub repo Settings → Secrets and variables → Actions.
- **Blocked on:** two prior decisions (see `.ay/tracking/BLOCKERS.md` B-01, B-02) — `npm login` credentials for Walid, and the product name (currently `ay-api-gen`, still under discussion per ADR-009 in `.ay/tracking/DECISIONS.md`). Don't set this up until the name is finalized; renaming a published package is painful.

## Product name decision (not a credential, but blocking)

- **What it's for:** Task 17 (publish to npm) is deliberately held until this is decided — see ADR-009.
- **Who decides:** Walid + Luisa, criteria listed in ADR-009. Target date in that ADR was 2026-06-01 (passed as of this writing — worth a nudge if still unresolved).

---

## Not needed for the S1/S2/S3 sessions' work

Everything built across the 2026-07-25 S1, S2, and S3 sessions (see `PROGRESS-LOG.md`) is local static analysis, codegen, and one new public npm dependency (`yaml@2.9.0` — no auth needed to install, it's a public unscoped package). No new external service, API key, or credential was introduced. Generated MCP servers/CLIs need *their own* per-API credentials (`API_KEY`, `API_BEARER_TOKEN`, etc.) but those are supplied by whoever runs `ay-api-gen` against a given spec, not by this project's maintainers — already documented per-API in each generated `.env.example`.
