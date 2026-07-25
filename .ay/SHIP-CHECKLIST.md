# Ship Checklist — every release

> Use this for every release tag. Soft gate, not hard — but skipping items is a flag for retro.

## Pre-merge

- [ ] All tests pass locally (`npm test`)
- [ ] CI green on the PR
- [ ] Manual smoke test of the changed surface
- [ ] No new lint warnings introduced
- [ ] Diff reviewed for security-sensitive sinks (interpolations, `fetch()`, file writes, JSON.parse of untrusted)
- [ ] If touching the runtime path: `npm run test` + at least one fixture API does a tool call end-to-end
- [ ] If touching codegen: re-generate at least 3 fixture APIs and diff their output
- [ ] ADR updated (or new ADR proposed) for any non-trivial decision
- [ ] Threat model updated if a new sink/source was introduced

## Pre-tag

- [ ] CHANGELOG entry under `[Unreleased]` moved to a versioned heading
- [ ] Version bumped in `package.json` (semver — patch/minor/major)
- [ ] `git log v$PREVIOUS..HEAD` skimmed; user-facing notes captured
- [ ] BOARD.md statuses reflect what actually landed
- [ ] DECISIONS.md entries' Status field accurate (Proposed → Accepted where applicable)

## Tag + publish

- [ ] Tag created: `git tag -a v$VERSION -m "v$VERSION — <one-line>"`
- [ ] Tag pushed: `git push origin v$VERSION` (and `liwala` if applicable)
- [ ] `npm publish --dry-run` clean
- [ ] `npm publish --access public`
- [ ] GitHub Release created with the CHANGELOG section pasted in

## Post-publish smoke test

- [ ] In a fresh `/tmp/check/`: `npm install <pkg>@latest` succeeds
- [ ] `npx <pkg> --version` returns the new version
- [ ] One real command runs (`npx <pkg> audit --baseline ./test/fixture.json` or similar)
- [ ] Generated server boots and accepts one tool call

## Post-publish comms

- [ ] Release tweet (only if material — patches don't need announcement)
- [ ] Update STANDING.html
- [ ] Note in `#releases` channel (when one exists)
- [ ] Close issues fixed in this release
- [ ] Update milestone status on roadmap

## When something goes wrong

If post-publish smoke fails:
- [ ] `npm deprecate <pkg>@<version> "broken; use <prev>"`
- [ ] Open a post-mortem task in `.ay/tasks/`
- [ ] Add a retro entry in `.ay/retros/`
- [ ] Fix forward in a patch release within 24h

## Security-release fast path

For a release that mitigates a High/Critical threat:
- [ ] CVE filed if any user could have been exploited (even hypothetically)
- [ ] Coordinated disclosure window honored if external researcher reported
- [ ] Release notes mention the threat ID
- [ ] Backport to previous minor if it has paying customers (none yet)
- [ ] Mass-email to existing T1+ customers (none yet)
