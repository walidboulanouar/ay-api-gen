# Task S1-02: Wire `truncate.js` into runtime + generated server (T-RUN-4 / T-RUN-6)

**Severity:** Critical · **Sprint:** S1 · **Owner:** walid · **Status:** READY
**Threats:** T-RUN-4 (response body PI), T-RUN-6 (response size DoS)
**Blocks:** ADR-006 Acceptance (S1-08)

## Problem

`src/truncate.js` exists (68 LOC, exports `truncateResponse(data, opts)`) but is **not called from anywhere**:
- `src/runtime/mcp-server.js:236` does `JSON.stringify(result, null, 2)` raw
- `src/mcp-generator.js` generates the same raw pattern into the output server

Unbounded raw responses reaching Claude's context are:
1. The load-bearing T-RUN-4 prompt-injection sink (poisoned record in an otherwise legit API)
2. A token-cost DoS vector (T-RUN-6) — 50MB response = context blown, conversation unusable

## Files to change

- `src/runtime/mcp-server.js` (call truncate before stringify)
- `src/mcp-generator.js` (emit truncate call into generated source)
- `src/truncate.js` (export already-correct API; add envelope helper for the boundary marker)
- `test/run.js` (add tests)

## Implementation

1. In `src/truncate.js`, add an envelope helper:

   ```js
   export function asMcpContent(data, opts = {}) {
     const truncated = truncateResponse(data, opts);
     const json = JSON.stringify(truncated, null, 2);
     return {
       content: [
         { type: "text", text: "--- begin API response (untrusted) ---" },
         { type: "text", text: json },
         { type: "text", text: "--- end API response ---" },
       ],
     };
   }
   ```

   The boundary markers are the cheap partial mitigation for T-RUN-4 (give Claude something to anchor on); the truncation is the T-RUN-6 mitigation.

2. In `src/runtime/mcp-server.js:236`, replace:

   ```js
   return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
   ```

   with:

   ```js
   return asMcpContent(result);
   ```

   Add the import at the top of the file.

3. In `src/mcp-generator.js`, change the generated handler template so it emits the same `asMcpContent` call. Since the generated server is standalone, copy `truncate.js` into the output directory at generate time (alongside `package.json`), and have the generated server `import { asMcpContent } from "./truncate.js"`.

   - Update `src/mcp-generator.js` to write `truncate.js` into the output dir
   - Update the generated server template to import + use `asMcpContent`
   - Update `package.json` generation to include `truncate.js` in `files:` if relevant

4. Tests in `test/run.js`:
   - Unit: `truncateResponse([1..1000])` returns at most 5 items + `_totalCount: 1000`
   - Unit: `asMcpContent({huge object})` produces 3-element content array with boundary markers
   - Integration: spin up runtime server against fixture, call a tool, assert response includes boundary markers and is < 16KB total
   - Generation: generate fixture, assert output dir contains `truncate.js` and the server imports it

## Configuration

Defaults (already in `truncate.js`): `maxChars: 8000`, `maxItems: 5`. Expose as env vars for power users:
- `AY_TRUNCATE_MAX_CHARS` (default 8000)
- `AY_TRUNCATE_MAX_ITEMS` (default 5)

Both read at handler entry, passed into `asMcpContent` opts.

## Verification

- [ ] `npm test` passes with new unit + integration tests
- [ ] Generate Petstore fixture; `cat output/mcp-server.js | grep asMcpContent` returns the import + the call
- [ ] Runtime mode against an endpoint returning a 100-item array: response capped at 5 + count metadata
- [ ] Boundary markers present in every tool response, even for small responses

## Effort

~1 hour. The hard part is making the generated server self-contained (`truncate.js` needs to land in the output dir).

## Unblocks

- S1-08 (ADR-006 Acceptance) — one of four required fixes
- Closes T-RUN-6 fully; partial mitigation for T-RUN-4 (full mitigation is industry-open)
