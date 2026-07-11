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
import type { ArtifactParser, ParsedCapability } from "@quickdeployai/importer-core/parser";
import {
  deriveCapabilityKinds,
  OPENAPI_MEDIA_TYPE,
  type ArdCapabilityKind,
  type ArdEntry,
} from "@quickdeployai/registry-schemas/ard";
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

export const openApiArtifactParser: ArtifactParser<ArdEntry, ArdCapabilityKind> = {
  mediaTypes: [OPENAPI_MEDIA_TYPE],
  async parse(nativeArtifact, entry) {
    const doc = assertOpenApiDocument(nativeArtifact);
    const derived = deriveCapabilityKinds(entry);
    const capabilities: ParsedCapability<ArdCapabilityKind>[] = [];

    if (derived.kinds.includes("api-contract")) {
      capabilities.push({
        kind: "api-contract",
        name: entry.displayName,
        description: entry.description ?? doc.info.description ?? doc.info.title,
        raw: doc,
      });
    }

    if (derived.kinds.includes("tool")) {
      capabilities.push(...openApiOperationsToCapabilities(doc));
    }

    const baseUrl = runtimeBaseUrl(doc, entry);
    return {
      capabilities,
      ...(baseUrl ? { mcpProjection: { tools: buildOpenApiTools(doc, baseUrl) } } : {}),
      diagnostics: derived.unrecognizedHints.map((hint) => ({
        level: "warn" as const,
        message: `Ignoring unrecognized publisher capabilityKinds hint "${hint}" for ${entry.identifier}.`,
      })),
    };
  },
};

function assertOpenApiDocument(nativeArtifact: unknown): OpenAPIV3.Document {
  if (
    !nativeArtifact ||
    typeof nativeArtifact !== "object" ||
    typeof (nativeArtifact as { openapi?: unknown }).openapi !== "string" ||
    !("paths" in nativeArtifact)
  ) {
    throw new ImporterConfigError("OpenAPI ArtifactParser expected an OpenAPI document object.");
  }
  return nativeArtifact as OpenAPIV3.Document;
}

function openApiOperationsToCapabilities(
  doc: OpenAPIV3.Document,
): ParsedCapability<ArdCapabilityKind>[] {
  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) => {
    const pathItem = item as OpenAPIV3.PathItemObject;
    return HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method as OpenAPIV3.HttpMethods];
      if (!operation || operation.deprecated) return [];

      return [{
        kind: "tool" as const,
        name: operation.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        description: operation.description ?? operation.summary ?? `${method.toUpperCase()} ${path}`,
        inputSchema: {
          parameters: operation.parameters ?? [],
          requestBody: operation.requestBody,
        },
        raw: { method, path, operation },
      }];
    });
  });
}

function runtimeBaseUrl(doc: OpenAPIV3.Document, entry: ArdEntry): string | undefined {
  const serverUrl = doc.servers?.[0]?.url;
  if (serverUrl) return serverUrl;
  if (!entry.url) return undefined;
  return new URL(entry.url).origin;
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
