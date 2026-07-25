# Launch Checklist — public launch of v0.2.0

> Trigger: Phase 1 M3 lands (`audit --baseline` ships). Target date 2026-06-30.

## Gate 1 — code is shippable

- [ ] All S1-01..S1-07 merged on master
- [ ] ADR-006 flipped to Accepted (S1-08)
- [ ] `npm test` passes (29 tests minimum, integration tests added for v0.1.1 features = ~50 expected)
- [ ] `ay-api-gen audit --baseline` works against all 16 fixture APIs without crash
- [ ] No `// TODO` / `// FIXME` left in src/
- [ ] No `console.log` in src/ that isn't user-facing
- [ ] LICENSE present and not generic (specifies MIT for code, separate for corpus)

## Gate 2 — package is shippable

- [ ] Product name locked (ADR-009 closed)
- [ ] npm name reserved
- [ ] `package.json`: name, version, description, author, license, repo, homepage, bugs, keywords all accurate
- [ ] `bin/` entrypoint resolves correctly post-install (test in a fresh `/tmp/`)
- [ ] `npm pack` output size < 500KB (current ~241KB)
- [ ] No `node_modules` in published tarball (`.npmignore` audited)
- [ ] No secrets, no `.env`, no API tokens in repo or tarball
- [ ] `npm publish --dry-run` clean
- [ ] Major-version policy stated in README ("we are v0.x; no breaking-change guarantees yet")

## Gate 3 — docs are launch-grade

- [ ] README leads with `audit --baseline`, not `serve`
- [ ] Quickstart works for someone who has never seen the tool (test with one outside person)
- [ ] One screencast (≤90s) showing the full `audit` flow
- [ ] CHANGELOG entry for v0.2.0 with all S1 fixes
- [ ] STANDING.html refreshed
- [ ] Security disclosure process documented (`SECURITY.md` + `security.txt` on landing page)
- [ ] CONTRIBUTING.md explaining where corpus lives vs where code lives

## Gate 4 — landing surface

- [ ] Domain (decided at name lock) points at a one-page site
- [ ] Site shows: what it does (10 words), 60-sec demo gif, install line, link to docs, link to GitHub
- [ ] OG image + Twitter card metadata set
- [ ] Logo (even a quick one)
- [ ] Pricing page placeholder ("T1 / T2 coming soon — join waitlist")
- [ ] Waitlist form (typeform or similar) with email capture for T1

## Gate 5 — distribution

- [ ] Show HN draft ready (don't post until at least one design partner can be quoted)
- [ ] GitHub README badges (build, npm version, license, MCP-compatible)
- [ ] Tweet thread drafted: announce + threat model + demo gif + signup
- [ ] One blog post on liwala.dev or personal blog explaining the wedge
- [ ] DM list: 30 people who'll plausibly retweet (curate manually, no spam)
- [ ] r/LocalLLaMA + r/programming submission drafts

## Gate 6 — post-launch ops

- [ ] Issues triage rotation defined (24h first-response SLA day one)
- [ ] Discord / Slack community link (even an empty server is fine)
- [ ] Telemetry policy: zero anonymous telemetry without opt-in; opt-in flag is `--telemetry`
- [ ] Customer support email + auto-responder
- [ ] One person on-call for the launch week (Walid)
- [ ] Crash-monitoring on the demo site (if hosted)
- [ ] Plan for v0.2.1 patch within 2 weeks of launch (something will be wrong; ship the fix fast)

---

## What we do NOT do at launch

- No paid ads
- No bulk cold email
- No "growth hacking" tricks
- No exaggerated security claims ("secure", "unhackable")
- No SOC2/ISO promises we can't back up
- No prerelease commitments to enterprises we can't onboard for 3+ months

## Soft launch first

Before public launch, share with:
1. 5 trusted dev friends (private DM)
2. The AY framework user list (cross-link via README)
3. One design-partner candidate

If those 6–10 people aren't excited, fix the pitch before going public.
