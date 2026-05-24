# Task 17: Publish to npm

**Sprint:** M2 (Phase 1) · **Owner:** walid · **Status:** BLOCKED
**Blockers:** B-01 (npm login), B-02 (product name — ADR-009)
**Target:** 2026-06-15

## Pre-flight

- [ ] B-02 resolved (ADR-009 closed)
- [ ] All S1 fixes merged on master
- [ ] v0.2.0 entry in CHANGELOG
- [ ] `package.json` `name` matches the chosen product name
- [ ] `package.json` `version` bumped to `0.2.0`
- [ ] `bin/<name>.js` exists at the path `package.json#bin` claims
- [ ] `.npmignore` audited; `npm pack` shows no surprises
- [ ] LICENSE present
- [ ] README leads with `audit --baseline`
- [ ] SECURITY.md exists with disclosure email

## Publish

```bash
npm login                       # one-time
npm pack && tar tf *.tgz | less # inspect tarball
npm publish --dry-run           # last-look
npm publish --access public
```

## Post-publish smoke

```bash
mkdir /tmp/smoke && cd /tmp/smoke
npm init -y
npm install <name>@latest
npx <name> --version
npx <name> audit --baseline ../path/to/petstore.json
```

If smoke fails:
- `npm deprecate <name>@0.2.0 "broken; use 0.2.1"`
- Fix forward in v0.2.1

## After successful publish

- [ ] Tag release on GitHub
- [ ] Update STANDING.html
- [ ] Tweet (only after at least one design partner can be quoted)
- [ ] Update BOARD.md status to DONE
- [ ] Close B-01 and B-02
