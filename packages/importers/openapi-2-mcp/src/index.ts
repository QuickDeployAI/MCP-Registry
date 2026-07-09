import {
  ImporterConfigError,
  readEnvCredential,
  type ApiKeyCredential,
  type BasicCredential,
  type BearerCredential,
  type OAuth2Credential,
  type ResolvedCredential,
} from "@quickdeployai/importer-core/auth";
import {
  buildBody,
  buildUrl,
  openApiToProxyTools,
  parseVersion,
  schemaToZod,
  type HttpExecutor,
  type OpenApiProxyTool,
} from "@quickdeployai/proxy-core/openapi";
import type { OpenAPIV3 } from "openapi-types";

export { buildBody, buildUrl, openApiToProxyTools, parseVersion, schemaToZod };
export type { HttpExecutor, OpenApiProxyTool };

export type OpenApiSecuritySchemeAuthConfig = {
  securityScheme: string;
  valueFrom: { env: string };
};

export type OpenApiAuthConfig =
  | OpenApiSecuritySchemeAuthConfig
  | {
      type: "bearer" | "oauth2" | "basic";
      securityScheme?: string;
      valueFrom: { env: string };
    }
  | {
      type: "api-key";
      securityScheme?: string;
      valueFrom: { env: string };
      name: string;
      in: "header" | "query" | "cookie";
    };

export type BuildOpenApiToolsOptions = {
  /** Explicit credentials applied to every operation, regardless of the document's securitySchemes. */
  auth?: readonly OpenApiAuthConfig[];
  /**
   * Maps an OpenAPI `components.securitySchemes` name to the environment variable that holds its
   * credential value. Required for operations whose `security` requirement is derived from the
   * OpenAPI document itself rather than passed explicitly via `auth`.
   */
  securityEnv?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  executor?: HttpExecutor;
};

export function buildOpenApiTools(
  doc: OpenAPIV3.Document,
  baseUrl: string,
  options: BuildOpenApiToolsOptions = {},
): OpenApiProxyTool[] {
  const env = options.env ?? process.env;
  const credentials = resolveCredentials(doc, options.auth ?? [], env, options.securityEnv ?? {});
  return openApiToProxyTools(doc, baseUrl, {
    credentials,
    env,
    ...(options.executor ? { executor: options.executor } : {}),
    ...(options.securityEnv ? { securityEnv: options.securityEnv } : {}),
  });
}

function resolveCredentials(
  doc: OpenAPIV3.Document,
  auth: readonly OpenApiAuthConfig[],
  env: NodeJS.ProcessEnv,
  securityEnv: Record<string, string>,
): ResolvedCredential[] {
  const credentials = auth.map((credential) =>
    readEnvCredential(resolveCredentialShape(doc, credential), env),
  );
  assertRequiredSecuritySchemesConfigured(doc, credentials, securityEnv);
  return credentials;
}

function resolveCredentialShape(
  doc: OpenAPIV3.Document,
  credential: OpenApiAuthConfig,
): BearerCredential | OAuth2Credential | BasicCredential | ApiKeyCredential {
  if (!isSecuritySchemeAuthConfig(credential)) return credential;

  const scheme = doc.components?.securitySchemes?.[credential.securityScheme];
  if (!scheme || "$ref" in scheme) {
    throw new ImporterConfigError(
      `OpenAPI security scheme ${credential.securityScheme} is not defined inline.`,
    );
  }

  if (scheme.type === "apiKey") {
    return {
      type: "api-key",
      securityScheme: credential.securityScheme,
      valueFrom: credential.valueFrom,
      name: scheme.name,
      in: parseCredentialPlacement(credential.securityScheme, scheme.in),
    };
  }

  if (scheme.type === "http" && scheme.scheme.toLowerCase() === "bearer") {
    return {
      type: "bearer",
      securityScheme: credential.securityScheme,
      valueFrom: credential.valueFrom,
    };
  }

  if (scheme.type === "http" && scheme.scheme.toLowerCase() === "basic") {
    return {
      type: "basic",
      securityScheme: credential.securityScheme,
      valueFrom: credential.valueFrom,
    };
  }

  if (scheme.type === "oauth2") {
    return {
      type: "oauth2",
      securityScheme: credential.securityScheme,
      valueFrom: credential.valueFrom,
    };
  }

  throw new ImporterConfigError(
    `OpenAPI security scheme ${credential.securityScheme} uses unsupported ${scheme.type} auth.`,
  );
}

function assertRequiredSecuritySchemesConfigured(
  doc: OpenAPIV3.Document,
  credentials: readonly ResolvedCredential[],
  securityEnv: Record<string, string>,
): void {
  const configured = new Set(
    credentials.flatMap((credential) =>
      credential.securityScheme ? [credential.securityScheme] : [],
    ),
  );
  for (const schemeName of Object.keys(securityEnv)) {
    configured.add(schemeName);
  }

  for (const [, item] of Object.entries(doc.paths ?? {})) {
    const pathItem = item as OpenAPIV3.PathItemObject;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as OpenAPIV3.HttpMethods];
      if (!operation || operation.deprecated) continue;

      assertOperationSecurityConfigured(operation, doc.security, configured);
    }
  }
}

function assertOperationSecurityConfigured(
  operation: OpenAPIV3.OperationObject,
  inheritedSecurity: OpenAPIV3.SecurityRequirementObject[] | undefined,
  configured: ReadonlySet<string>,
): void {
  const security = operation.security ?? inheritedSecurity;
  if (security === undefined || security.length === 0) return;

  const missingByRequirement = security.map((requirement) =>
    Object.keys(requirement).filter((scheme) => !configured.has(scheme)),
  );
  if (missingByRequirement.some((missing) => missing.length === 0)) return;

  const [missingScheme] = missingByRequirement[0] ?? [];
  if (missingScheme) {
    throw new ImporterConfigError(
      `Missing auth config for OpenAPI security scheme ${missingScheme}. Add spec.auth with valueFrom.env.`,
    );
  }
}

function isSecuritySchemeAuthConfig(
  credential: OpenApiAuthConfig,
): credential is OpenApiSecuritySchemeAuthConfig {
  return "securityScheme" in credential && !("type" in credential);
}

function parseCredentialPlacement(
  securityScheme: string,
  placement: string,
): ApiKeyCredential["in"] {
  if (placement === "header" || placement === "query" || placement === "cookie") return placement;
  throw new ImporterConfigError(
    `OpenAPI security scheme ${securityScheme} uses unsupported apiKey placement ${placement}.`,
  );
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
