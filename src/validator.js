/**
 * OpenAPI spec validator.
 * Validates spec before generation, warns about issues.
 */

/**
 * Validate an OpenAPI/Swagger spec and return warnings/errors.
 * @param {object} spec - Parsed JSON spec
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateSpec(spec) {
  const errors = [];
  const warnings = [];

  // Detect version
  const isSwagger2 = spec.swagger && spec.swagger.startsWith("2");
  const isOpenAPI3 = spec.openapi && (spec.openapi.startsWith("3.0") || spec.openapi.startsWith("3.1"));

  if (!isSwagger2 && !isOpenAPI3) {
    errors.push("Cannot detect spec version. Expected 'swagger: 2.x' or 'openapi: 3.x'.");
  }

  // Info block
  if (!spec.info) {
    warnings.push("Missing 'info' block. API title and version will be unknown.");
  } else {
    if (!spec.info.title) warnings.push("Missing 'info.title'. Will use filename as API name.");
    if (!spec.info.version) warnings.push("Missing 'info.version'.");
  }

  // Paths
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    errors.push("No paths defined. Nothing to generate.");
  }

  // Servers / host
  if (isOpenAPI3 && (!spec.servers || spec.servers.length === 0)) {
    warnings.push("No 'servers' defined. Will default to http://localhost.");
  }
  if (isSwagger2 && !spec.host) {
    warnings.push("No 'host' defined. Will default to localhost.");
  }

  // Check for common issues
  const paths = spec.paths || {};
  let endpointCount = 0;
  let noSummaryCount = 0;
  let noResponseCount = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const op = pathItem[method];
      if (!op) continue;
      endpointCount++;
      if (!op.summary && !op.description) noSummaryCount++;
      if (!op.responses || Object.keys(op.responses).length === 0) noResponseCount++;
    }
  }

  if (noSummaryCount > 0) {
    warnings.push(`${noSummaryCount}/${endpointCount} endpoints have no summary or description.`);
  }
  if (noResponseCount > 0) {
    warnings.push(`${noResponseCount}/${endpointCount} endpoints have no response definitions.`);
  }

  // Security schemes
  const secDefs = spec.securityDefinitions || spec.components?.securitySchemes;
  if (!secDefs || Object.keys(secDefs).length === 0) {
    warnings.push("No security schemes defined. Generated code will use generic env-var auth.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
