import {
  buildOpenApiTools,
  type BuildOpenApiToolsOptions,
  type OpenApiProxyTool,
} from "@quickdeployai/openapi-2-mcp";
import type { OpenAPIV3 } from "openapi-types";
import type { OpenApiDocument } from "./types";

export class HarNotReviewedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarNotReviewedError";
  }
}

export type BuildHarMcpToolsOptions = {
  spec: OpenApiDocument;
  baseUrl: string;
  env?: NodeJS.ProcessEnv;
  executor?: BuildOpenApiToolsOptions["executor"];
};

/**
 * The final step of the two-step shim: hand a *reviewed* spec to the shared
 * `openapi-2-mcp` engine so it can actually build callable MCP tools.
 *
 * This is the only place har-2-mcp talks to the OpenAPI engine, and it refuses to
 * do so for anything that has not been through `reviewHarDraft({ accept: true })` —
 * a draft straight out of `convertHarToOpenApi` cannot reach a running server.
 *
 * Security schemes derived from redaction findings (see ./redact.ts and
 * ./convert.ts) are keyed by the environment variable an operator must populate
 * with the real credential; the engine resolves each operation's `security`
 * requirement against that scheme name via `securityEnv`, so the raw value
 * captured in the HAR file is never embedded in the spec and never reused.
 */
export function buildHarMcpTools(options: BuildHarMcpToolsOptions): OpenApiProxyTool[] {
  assertReviewed(options.spec);
  const securityEnv = Object.fromEntries(
    Object.keys(options.spec.components.securitySchemes).map((schemeName) => [
      schemeName,
      schemeName,
    ]),
  );
  return buildOpenApiTools(options.spec as unknown as OpenAPIV3.Document, options.baseUrl, {
    securityEnv,
    env: options.env,
    executor: options.executor,
  });
}

function assertReviewed(spec: OpenApiDocument): void {
  if (spec["x-quickdeploy-har-review"]?.status !== "reviewed") {
    throw new HarNotReviewedError(
      "har-2-mcp refuses to serve an unreviewed HAR draft. Run `har-2-mcp review --accept` " +
        "after checking the redaction report, then serve the reviewed spec it produces.",
    );
  }
}
