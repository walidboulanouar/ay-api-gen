# Task S1-03: Settings collision policy + `ay-api-gen:` namespace (T-SET-1)

**Severity:** High · **Sprint:** S1 · **Owner:** walid · **Status:** READY
**Threat:** T-SET-1 in [`docs/security/THREAT-MODEL.md`](../../docs/security/THREAT-MODEL.md)
**ADR:** [ADR-008](../tracking/DECISIONS.md)
**Blocks:** ADR-006 Acceptance (S1-08)

## Problem

`src/settings-injector.js:42` does:

```js
settings.mcpServers[name] = { command: "node", args: [serverPath], env: {} };
```

— silent overwrite. A malicious spec named `github` (from `info.title`) shadows the user's real GitHub MCP server entry and inherits whatever env vars (including credentials) were configured for the original entry.

## Files to change

- `src/settings-injector.js`
- `test/run.js`

## Implementation

1. Compute namespaced key: `const nsKey = "ay-api-gen:" + sanitize(name);`
   - `sanitize` should be `name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)`

2. Collision policy (refuse-or-prompt, per ADR-008):

   ```js
   const existing = settings.mcpServers[nsKey];
   const unprefixedExists = settings.mcpServers[name] && !nsKey === name;

   if (unprefixedExists && !options.force) {
     throw new Error(
       `Refusing to write: an entry "${name}" exists in settings.json from another source.\n` +
       `Pass --force to overwrite, or rename your spec.`
     );
   }

   if (existing && !options.force) {
     // Same-source collision: ay-api-gen previously wrote this entry.
     // Allowed in non-interactive mode only with --force; otherwise prompt.
     if (options.nonInteractive) {
       throw new Error(`"${nsKey}" already exists. Pass --force to overwrite.`);
     }
     // Interactive: prompt for y/N. In Node, simplest is `readline` synchronously.
     if (!confirmOverwrite(nsKey)) {
       throw new Error(`Aborted by user.`);
     }
   }

   settings.mcpServers[nsKey] = { command: "node", args: [serverPath], env: {} };
   ```

3. Add `force` and `nonInteractive` to the `options` object that callers pass through.

4. Update `bin/ay-api-gen.js` to accept `--force` and propagate `--non-interactive` (or detect via `!process.stdout.isTTY`).

5. Tests:
   - Unit: writes new entry under `ay-api-gen:foo` when given name `foo`
   - Unit: refuses to write when `foo` (unprefixed) exists
   - Unit: refuses to overwrite same-source entry in `nonInteractive` mode without `--force`
   - Unit: `--force` overwrites in both cases
   - Unit: sanitization — `info.title = "Foo/Bar Baz"` → key `ay-api-gen:Foo_Bar_Baz`

## Migration note

Existing customers (currently: just Walid's local petstore entry from `.claude/settings.local.json`) will get a new namespaced entry on next regen and the old unprefixed entry will remain orphaned. Document in release notes that they can safely delete unprefixed `ay-api-gen`-generated entries after first re-run on v0.2.

## Verification

- [ ] `npm test` passes with new tests
- [ ] Manual: create a settings.json with `mcpServers.foo = {…}` from a fake source; run generate against a spec named `foo`; confirm it errors out without `--force`
- [ ] Manual: same scenario with `--force`; confirm it writes under `ay-api-gen:foo` and leaves the original `foo` untouched

## Effort

~1 hour.

## Unblocks

- S1-08 (ADR-006 Acceptance) — one of four required fixes
- Establishes the namespace convention every other settings write should follow
