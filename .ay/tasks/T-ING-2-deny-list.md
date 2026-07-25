# Task S1-06: Private-IP deny-list at DNS resolution (T-ING-2)

**Severity:** High · **Sprint:** S1 · **Owner:** unassigned · **Status:** READY
**Threat:** T-ING-2 (SSRF via spec-derived base URL)

## Problem

Spec `servers[0].url` (or Swagger `host`/`basePath`) becomes the auth-attached base URL. Even with the same-host guard from S1-05, a spec that *itself* declares `http://169.254.169.254/...` (cloud metadata) or `http://localhost:8086/...` (internal services) bypasses the guard because the override matches the spec.

## Files to change

- `src/url-guard.js` (extend with `checkAllowedHost`)
- `src/parser.js` (call check at `extractEndpoints` time so generation fails early)
- `src/runtime/mcp-server.js` (call check at request time so dynamic IP-rebind is also caught)
- `test/run.js`

## Implementation

1. Add to `src/url-guard.js`:

   ```js
   import { lookup } from "node:dns/promises";
   import { isIPv4, isIPv6 } from "node:net";

   const BLOCKED_V4 = [
     // IANA-special ranges
     /^0\./, /^10\./, /^127\./,
     /^169\.254\./,           // link-local + metadata
     /^172\.(1[6-9]|2\d|3[01])\./,
     /^192\.168\./,
     /^192\.0\.0\./, /^192\.0\.2\./,
     /^198\.(1[89])\./,        // benchmarking
     /^203\.0\.113\./,
     /^22[4-9]\./, /^23\d\./,   // multicast
     /^24\d\./, /^25[0-5]\./,   // reserved
   ];

   function isBlockedV4(addr) {
     return BLOCKED_V4.some((re) => re.test(addr));
   }

   function isBlockedV6(addr) {
     return (
       addr === "::1" ||
       addr.startsWith("fc") || addr.startsWith("fd") ||   // unique local
       addr.startsWith("fe80") ||                           // link-local
       addr.startsWith("ff")                                // multicast
     );
   }

   export async function assertHostAllowed(urlString) {
     const url = new URL(urlString);
     const host = url.hostname;

     // Literal IP cases
     if (isIPv4(host) && isBlockedV4(host)) {
       throw new Error(`Refusing connect to private IPv4 address: ${host}`);
     }
     if (isIPv6(host) && isBlockedV6(host)) {
       throw new Error(`Refusing connect to private IPv6 address: ${host}`);
     }
     if (isIPv4(host) || isIPv6(host)) return;

     // DNS-resolve host name and check all A/AAAA records
     const addresses = await lookup(host, { all: true });
     for (const { address, family } of addresses) {
       if (family === 4 && isBlockedV4(address)) {
         throw new Error(`Refusing connect to ${host} → ${address} (private range)`);
       }
       if (family === 6 && isBlockedV6(address)) {
         throw new Error(`Refusing connect to ${host} → ${address} (private range)`);
       }
     }
   }
   ```

2. In `src/parser.js`, after extracting `baseUrl` in `extractEndpoints`, call `await assertHostAllowed(baseUrl)`. Generation fails early if the spec declares a private-IP base URL.

3. In `src/runtime/mcp-server.js`, call `await assertHostAllowed(url)` inside `callApi` before `fetch`. This catches DNS rebinding (host resolves to public IP at startup, private IP at call time).

4. Opt-out: env var `AY_ALLOW_PRIVATE_HOSTS=1` skips the check. Useful for legitimate intranet APIs. Document loudly in README.

5. Tests:
   - Unit: `127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `::1` all throw
   - Unit: `localhost` resolves to `127.0.0.1` → throws
   - Unit: `8.8.8.8`, `1.1.1.1`, public DNS name → no throw
   - Unit: `AY_ALLOW_PRIVATE_HOSTS=1` skips check
   - Integration: spec with `servers[0].url = "http://169.254.169.254/"` fails parse

## Verification

- [ ] `npm test` passes
- [ ] Manual: try `ay-api-gen serve` against a spec with metadata URL → errors out at parse time
- [ ] Manual: with `AY_ALLOW_PRIVATE_HOSTS=1`, same spec works (use case: local dev against `localhost:3000`)

## Effort

~2 hours (the DNS-resolution-at-call-time check needs careful async handling in the runtime).

## Open question

Should we also check on every `fetch` redirect? Yes, but that requires a custom redirect handler — defer to S2 if it's not a 30-minute add.
