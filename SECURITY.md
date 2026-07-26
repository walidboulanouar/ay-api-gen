# Security Policy

`ay-api-gen` turns an OpenAPI/Swagger spec you didn't write into code that runs on your machine and text that lands in an LLM's context — that's real attack surface, and it's treated as such. See [`GAP-ANALYSIS.md`](GAP-ANALYSIS.md) §3 for the evidence: this project has a track record of hardening against SSRF, code-injection, and prompt-injection-class bugs *before* shipping, in some of the same classes where competing tools have shipped and later disclosed vulnerabilities. Reporting a real issue here helps keep that record honest.

## Supported versions

Not yet published to npm (see [`HUMAN-SETUP-NEEDED.md`](HUMAN-SETUP-NEEDED.md) for what's blocking that — a naming decision, not a code issue). Until a first release ships, only the `master` branch is supported; report against the latest commit there.

| Version | Supported |
|---|---|
| `master` (pre-release) | ✅ |

Once versioned releases exist, this table will track the currently-maintained major version(s).

## Reporting a vulnerability

**Preferred: GitHub's private vulnerability reporting.** If enabled on this repo (Settings → Security → "Private vulnerability reporting"), use the **Security** tab → **Report a vulnerability**. This opens a private draft advisory visible only to the maintainer and you — nothing public until it's resolved and you both agree to disclose.

**Fallback:** if private reporting isn't enabled yet, open a regular GitHub issue with as little exploit detail as possible (e.g. "possible SSRF via base URL resolution — details on request") and ask for a private channel to share the rest. Don't post working exploit details in a public issue.

What's in scope: anything in this repository — the parser, the code generators (`mcp-generator.js`, `cli-generator.js`, `auth-codegen.js`), the runtime server/CLI, `spec-linter.js`, and the CI/release workflows. A malicious or adversarial *OpenAPI spec* causing unintended behavior (code execution, SSRF, path traversal, prompt injection reaching an LLM's context) is squarely in scope — that's this project's entire threat model (see the S1–S3 security work in [`PROGRESS-LOG.md`](PROGRESS-LOG.md)).

What's out of scope: vulnerabilities in the *APIs this tool generates clients for* — those belong to whoever operates that API, not to `ay-api-gen`. Issues that require an attacker to already control the machine running `ay-api-gen`.

Please include: the version/commit you tested, a minimal reproduction (a small adversarial OpenAPI spec is usually enough), and the impact you'd expect (what an attacker gains).

## Response

This is a small, actively-developed project — no formal SLA yet, but real reports get read and acknowledged promptly, and a fix (or an honest explanation of why it isn't one) follows before any public disclosure. If you haven't heard back in a reasonable time, it's fine to follow up.

## Recommended one-time setup

For whoever owns this repo's GitHub settings: enabling **Settings → Security → Private vulnerability reporting** lets reporters use the flow above without needing a personal email on file anywhere. Logged here rather than assumed already done — this file doesn't require it to be useful (the fallback above still works), but it's the better experience once flipped on.
