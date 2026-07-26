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

## Future, not yet needed: Stripe account (C-05, pricing/billing)

- **What it's for:** `.ay/tracking/BOARD.md` backlog item C-05 (pricing page + billing integration) explicitly depends on both a licensing/tier model (not yet decided — see C-04) and a real Stripe account for API keys.
- **Status:** Surveyed 2026-07-25 as part of a full backlog review — genuinely blocked on the tier-model decision, not just the credential. Nothing to act on yet; noting here so it's not forgotten when C-04 is eventually decided.

## Interactive OAuth (PKCE + Dynamic Client Registration) — needs a live OAuth provider to build/verify

- **What it's for:** identified in `GAP-ANALYSIS.md` (2026-07-25 competitive research) — Speakeasy/Gram lead their marketing on OAuth 2.1 + PKCE + Dynamic Client Registration for browser-redirect, end-user-facing auth flows. `ay-api-gen` already automates the `client_credentials` grant (`auth-codegen.js`'s OAuth2 token helper) but has no interactive authorization-code-with-browser-redirect support.
- **Why it wasn't built tonight:** a PKCE/DCR flow needs a local callback server that receives a real redirect from a real OAuth authorization server, plus a real client registration (or pre-registered client) to test against end-to-end. There's no way to build this correctly or verify it works without a live OAuth provider (Auth0, Okta, a real API's own OAuth server, etc.) and real credentials — guessing at the implementation without a live round-trip to verify against risks shipping something that looks right and silently doesn't work.
- **What's needed to build this properly:** a test OAuth 2.1 provider that supports PKCE + Dynamic Client Registration (e.g. a free-tier Auth0/Okta dev tenant, or a self-hosted `oauth2-mock-server`-style test IdP) and its issuer URL/client credentials, so the flow can be driven and verified end-to-end rather than assumed correct from reading the spec.

## Hosted/managed MCP server serving (Gram/DigitalAPI-style) — needs real hosting infrastructure

- **What it's for:** identified in `GAP-ANALYSIS.md` — Gram and DigitalAPI both offer "we host your generated MCP server" as their primary product; `ay-api-gen` is generate-and-self-host only.
- **Why it wasn't built tonight:** this isn't a code gap so much as an infrastructure/business decision — it needs a real deployment target (a server, container platform, or serverless host), DNS, TLS, and an uptime/ops story, none of which can be stood up or meaningfully verified in a sandbox session with no live infra. It's also a much bigger scope than "add a feature" — it's closer to standing up a new product surface.
- **What's needed to build this properly:** a decision on hosting model (self-managed VPS/container platform vs. a serverless platform vs. partnering with an existing MCP-hosting provider), plus real infrastructure credentials once that decision is made. Flagging for awareness — not recommending any specific path, since that's a product/business call, not an engineering one.

## Enable GitHub's private vulnerability reporting (recommended, not blocking)

- **What it's for:** `SECURITY.md` (new, 2026-07-25) points reporters at GitHub's private vulnerability reporting flow as the preferred way to disclose a security issue — no personal email needed anywhere, private draft advisory until resolved.
- **Where to get it:** repo Settings → Security → "Private vulnerability reporting" → Enable. A one-time toggle only a repo admin can flip; not something this session can do via the CLI (it's a settings change, not a code change).
- **Status:** `SECURITY.md`'s fallback (open a regular issue asking for a private channel) works fine without this, so it's a nice-to-have, not a blocker on anything.

---

## Not needed for the S1/S2/S3 sessions' work

Everything built across the 2026-07-25 S1, S2, and S3 sessions (see `PROGRESS-LOG.md`) is local static analysis, codegen, and one new public npm dependency (`yaml@2.9.0` — no auth needed to install, it's a public unscoped package). No new external service, API key, or credential was introduced. Generated MCP servers/CLIs need *their own* per-API credentials (`API_KEY`, `API_BEARER_TOKEN`, etc.) but those are supplied by whoever runs `ay-api-gen` against a given spec, not by this project's maintainers — already documented per-API in each generated `.env.example`.
