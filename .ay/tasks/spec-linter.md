# Task S1-07: `spec-linter.js` — warn-only T0 baseline

**Severity:** Medium · **Sprint:** S1 · **Owner:** unassigned · **Status:** READY
**Threats:** T-API-1 (unauth mutating endpoint), T-API-2 (PII in URL path) first; T-API-3..6 in follow-ups
**Foundation for:** S2-07 (`ay-api-gen audit --baseline`), C-02 (spec gating)

## Problem

No spec-level linting today. The T-API-* threats (spec-quality issues that increase MCP attack surface) are detected only by reading the spec by hand. ADR-006 §3 specifies this as a T0 component.

## Files to create

- `src/spec-linter.js` — new module
- `test/spec-linter.test.json` — fixtures: clean spec + at least one violation per check
- `test/run.js` — wire spec-linter into the suite

## Implementation

1. `src/spec-linter.js` exports:

   ```js
   export function lintSpec(parsed) {
     const findings = [];
     findings.push(...checkApi1_UnauthMutating(parsed));
     findings.push(...checkApi2_SensitiveInPath(parsed));
     return findings;
   }
   ```

   Each finding shape:
   ```js
   {
     id: "T-API-1",
     severity: "high",         // "critical" | "high" | "medium" | "low" | "info"
     endpoint: "POST /charge",
     message: "Mutating endpoint has no declared security requirement.",
     remediation: "Add `security:` requirement at operation or top level."
   }
   ```

2. **T-API-1 — Unauth mutating endpoint.** For each endpoint where method ∈ `{POST, PUT, PATCH, DELETE}`:
   - If neither the operation nor the spec has a `security` array (or it's an empty array `[{}]` which means "auth optional"), emit a HIGH finding.
   - Exception: spec has `securitySchemes` defined but operation explicitly opts out with `security: []` — that's a deliberate opt-out (e.g., webhook receive). Emit MEDIUM with a different message.

3. **T-API-2 — Sensitive identifier in URL path.** For each endpoint, for each path param name, check against patterns:
   - `/ssn/`, `/social[_-]?security/`, `/credit[_-]?card/`, `/password/`, `/token/`, `/secret/`, `/api[_-]?key/`, `/email/` (email is medium not high)
   - High severity for ssn/credit card/password/token/secret/api_key
   - Medium for email
   - Include the param name in `message`

4. Integrate into the generator entry point so findings are printed at generation end. Mode A: warn. Mode B: warn for INFO/LOW, exit non-zero for HIGH/CRITICAL unless `--accept-risks=T-API-1:POST_charge,…` is passed (parse comma-separated list of `<id>:<endpoint-slug>`).

5. CLI flag in `bin/ay-api-gen.js`:
   - `--accept-risks=…` — comma-separated; pre-parses into a set the linter consults to flip "block" → "warn"
   - `--mode=a|b` (default `a` — warn-only)

6. Output format:
   ```
   [spec-lint] 2 findings:
     HIGH  T-API-1  POST /charge   Mutating endpoint has no declared security requirement.
                                   → Add `security:` requirement at operation or top level.
     MED   T-API-2  GET  /users/{ssn}/profile   Path param `ssn` matches sensitive pattern.
                                                → Move identifier to body or use opaque ID.
   ```

7. Tests:
   - Clean fixture (Petstore) → no T-API-1, no T-API-2 findings
   - Custom fixture with `POST /charge` no auth → emits T-API-1
   - Custom fixture with `/users/{ssn}/profile` → emits T-API-2
   - Mode B with no `--accept-risks` → process exit code != 0
   - Mode B with `--accept-risks=T-API-1:POST_charge` → exit code 0, finding still printed

## Future scope (NOT in this task)

T-API-3 (mass-assignment heuristic), T-API-4 (sensitive query param), T-API-5 (weak auth schemes), T-API-6 (no rate limit). Each is a separate follow-up; the framework is the same once T-API-1 and T-API-2 are working.

## Verification

- [ ] `npm test` passes
- [ ] Manual: generate fixture with a known violation; output includes the finding row
- [ ] Manual: Mode B fail with non-zero exit; Mode A same input succeeds with warning

## Effort

~4 hours (mostly fixture authoring + integration plumbing).

## Unblocks

- S2-07 (`ay-api-gen audit --baseline`) — `spec-linter` becomes one of the analyzers
- C-02 (T2 spec gating) — same checks, gating semantics instead of warn
