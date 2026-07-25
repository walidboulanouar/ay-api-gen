# Task S1-05: Base-URL same-host refinement default (T-RUN-1 / T-ING-2)

**Severity:** High · **Sprint:** S1 · **Owner:** walid · **Status:** READY
**Threats:** T-RUN-1 (API_BASE_URL rebinding), partial T-ING-2 (SSRF)
**ADR:** [ADR-007](../tracking/DECISIONS.md)

## Problem

`src/mcp-generator.js:95` and `src/runtime/mcp-server.js:178` both do:

```js
const BASE_URL = process.env.API_BASE_URL || /* spec baseUrl */;
```

— unconditional override. Combined with T-SET-* (which can write to settings.json's env), an attacker rebinds `API_BASE_URL` to their host, keeps the original `API_KEY`, and every tool call exfiltrates credentials.

## Files to change

- `src/runtime/mcp-server.js`
- `src/mcp-generator.js`
- (potentially) shared helper in `src/url-guard.js`
- `test/run.js`

## Implementation

1. Create `src/url-guard.js`:

   ```js
   export function resolveBaseUrl(specBaseUrl, envOverride, opts = {}) {
     if (!envOverride) return specBaseUrl;

     const allowHostOverride =
       opts.allowHostOverride ||
       process.env.API_BASE_URL_ALLOW_HOST_OVERRIDE === "1";

     if (allowHostOverride) {
       console.warn(`[ay-api-gen] host override allowed: ${envOverride}`);
       return envOverride;
     }

     const spec = new URL(specBaseUrl);
     let override;
     try {
       override = new URL(envOverride);
     } catch {
       throw new Error(
         `API_BASE_URL "${envOverride}" is not a valid URL.`
       );
     }

     if (override.protocol !== spec.protocol || override.host !== spec.host) {
       throw new Error(
         `API_BASE_URL "${envOverride}" rejected: ` +
         `host/scheme differs from spec base URL "${specBaseUrl}". ` +
         `Set API_BASE_URL_ALLOW_HOST_OVERRIDE=1 to override (logs loudly).`
       );
     }

     return envOverride;
   }
   ```

2. Replace the two `const BASE_URL = …` lines with `const BASE_URL = resolveBaseUrl(/* spec */, process.env.API_BASE_URL);`. In the generator, emit the same call into generated source and copy `url-guard.js` into output dir.

3. Add `--allow-host-override` to `bin/ay-api-gen.js` for the generate-time toggle (sets the env var in the generated server).

4. Tests:
   - Unit: same host + different path → allowed
   - Unit: different host → throws
   - Unit: `API_BASE_URL_ALLOW_HOST_OVERRIDE=1` + different host → allowed, warns
   - Unit: malformed URL → throws with helpful message
   - Integration: generate Petstore (spec base = https://petstore3.swagger.io); set `API_BASE_URL=https://evil.com`; tool call should error with the rejection message

## Documentation

Add a `Security` section to README mentioning:
- Default behavior (same-host refinement)
- How to opt into full override (env var or generation flag)
- Why this matters (T-RUN-1 explanation in 2 sentences)

## Verification

- [ ] `npm test` passes
- [ ] Manual: `API_BASE_URL=https://example.com node generated-server.js` errors out
- [ ] Manual: `API_BASE_URL=https://petstore3.swagger.io/api/v4 node generated-server.js` (same host, different path) is allowed
- [ ] Manual: with `API_BASE_URL_ALLOW_HOST_OVERRIDE=1`, the rejection becomes a warning

## Effort

~1 hour.

## Notes

The bypass exists by design — staging/prod URL swaps via path change are a legitimate workflow. We refuse only the cross-host case, which has no legitimate non-attack use we've identified.
