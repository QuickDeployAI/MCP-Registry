import {
  ImporterConfigError,
  applyCredentialToRequest,
  readEnvCredential,
  redactCredentialValues,
  type ApiKeyCredential,
  type BasicCredential,
  type BearerCredential,
  type CredentialPlacement,
  type OAuth2Credential,
  type ResolvedCredential,
} from "@quickdeployai/importer-core/auth";
import type { OpenAPIV3 } from "openapi-types";
import { z } from "zod";

export type HttpExecutor = (request: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}) => Promise<{ status: number; text: string }>;

export type OpenApiProxyTool = {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute(args: unknown): Promise<string>;
};

export type OpenApiAuthConfig =
  | BearerCredential
  | OAuth2Credential
  | BasicCredential
  | ApiKeyCredential;

export type OpenApiToProxyToolsOptions = {
  credentials?: readonly ResolvedCredential[];
  executor?: HttpExecutor;
  /** Environment used to resolve credentials derived from the document's securitySchemes. */
  env?: NodeJS.ProcessEnv;
  /**
   * Maps an OpenAPI `components.securitySchemes` name to the environment variable that holds
   * its credential value, e.g. `{ bearerAuth: "PETSTORE_TOKEN" }`.
   */
  securityEnv?: Record<string, string>;
};

export function schemaToZod(schema: OpenAPIV3.SchemaObject, required = false): z.ZodTypeAny {
  let mapped: z.ZodTypeAny;

  if (schema.enum) {
    const values = schema.enum as unknown[];
    mapped =
      values.length >= 2 && values.every((value): value is string => typeof value === "string")
        ? z.enum(values as [string, ...string[]])
        : z.unknown();
  } else {
    switch (schema.type) {
      case "string":
        mapped = z.string();
        break;
      case "integer":
        mapped = z.number().int();
        break;
      case "number":
        mapped = z.number();
        break;
      case "boolean":
        mapped = z.boolean();
        break;
      case "array":
        mapped = z.array(
          schemaToZod(
            (schema as OpenAPIV3.ArraySchemaObject).items as OpenAPIV3.SchemaObject,
            true,
          ),
        );
        break;
      case "object":
        mapped = z.object(
          Object.fromEntries(
            Object.entries(schema.properties ?? {}).map(([key, value]) => [
              key,
              schemaToZod(value as OpenAPIV3.SchemaObject, (schema.required ?? []).includes(key)),
            ]),
          ),
        );
        break;
      default:
        mapped = z.unknown();
        break;
    }
  }

  if (schema.description) mapped = mapped.describe(schema.description);
  return required ? mapped : mapped.optional();
}

export function buildUrl(
  baseUrl: string,
  path: string,
  args: Record<string, unknown>,
  pathParams: readonly string[],
  bodyKeys: readonly string[],
  credentials: readonly ResolvedCredential[] = [],
): URL {
  const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(String(args[key] ?? "")),
  );
  const url = new URL(baseUrl + resolvedPath);

  for (const [key, value] of Object.entries(args)) {
    if (!pathParams.includes(key) && !bodyKeys.includes(key) && value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  for (const credential of credentials) {
    const patch = applyCredentialToRequest(credential);
    for (const [key, value] of Object.entries(patch.query)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

export function buildBody(bodyKeys: readonly string[], args: Record<string, unknown>): unknown {
  if (bodyKeys.length === 0) return undefined;
  if (bodyKeys.length === 1 && bodyKeys[0] === "body") return args.body;
  return Object.fromEntries(
    bodyKeys.filter((key) => args[key] != null).map((key) => [key, args[key]]),
  );
}

export function openApiToProxyTools(
  doc: OpenAPIV3.Document,
  baseUrl: string,
  options: OpenApiToProxyToolsOptions = {},
): OpenApiProxyTool[] {
  const securitySchemes = doc.components?.securitySchemes ?? {};
  const documentSecurity = doc.security;
  const env = options.env ?? process.env;
  const securityEnv = options.securityEnv ?? {};
  const explicitCredentials = options.credentials ?? [];

  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) => {
    const pathItem = item as OpenAPIV3.PathItemObject;
    const shared = (pathItem.parameters ?? []) as OpenAPIV3.ParameterObject[];
    return HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method as OpenAPIV3.HttpMethods];
      if (!operation || operation.deprecated) return [];

      const effectiveSecurity = operation.security ?? documentSecurity;
      const operationId = operation.operationId ?? `${method}_${path}`;
      const derivedCredentials = resolveOperationCredentials(effectiveSecurity ?? [], {
        securitySchemes,
        securityEnv,
        env,
        operationId,
        explicitCredentials,
      });

      return [
        operationToTool(method, path, operation, shared, baseUrl, documentSecurity, {
          ...options,
          credentials: [...explicitCredentials, ...derivedCredentials],
        }),
      ];
    });
  });
}

export function parseVersion(version = "1.0.0"): `${number}.${number}.${number}` {
  const [major = 1, minor = 0, patch = 0] = (version.match(/\d+/g) ?? []).map(Number);
  return `${major}.${minor}.${patch}`;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

function operationToTool(
  method: string,
  path: string,
  operation: OpenAPIV3.OperationObject,
  shared: OpenAPIV3.ParameterObject[],
  baseUrl: string,
  inheritedSecurity: OpenAPIV3.SecurityRequirementObject[] | undefined,
  options: OpenApiToProxyToolsOptions,
): OpenApiProxyTool {
  const params = mergeParams(shared, (operation.parameters ?? []) as OpenAPIV3.ParameterObject[]);
  const pathParams = params.filter((param) => param.in === "path").map((param) => param.name);
  const credentials = selectOperationCredentials(
    options.credentials ?? [],
    operation.security ?? inheritedSecurity,
  );
  const shape: Record<string, z.ZodTypeAny> = Object.fromEntries(
    params.map((param) => [
      param.name,
      schemaToZod((param.schema ?? {}) as OpenAPIV3.SchemaObject, param.required ?? false).describe(
        param.description ?? "",
      ),
    ]),
  );

  const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined;
  const bodySchema = requestBody?.content?.["application/json"]?.schema as
    | OpenAPIV3.SchemaObject
    | undefined;
  const bodyKeys: string[] = [];

  if (bodySchema?.type === "object" && bodySchema.properties) {
    const required = bodySchema.required ?? [];
    for (const [key, value] of Object.entries(bodySchema.properties)) {
      shape[key] = schemaToZod(
        value as OpenAPIV3.SchemaObject,
        requestBody?.required === true && required.includes(key),
      );
      bodyKeys.push(key);
    }
  } else if (bodySchema) {
    shape.body = schemaToZod(bodySchema, requestBody?.required ?? false).describe(
      requestBody?.description ?? "Request body",
    );
    bodyKeys.push("body");
  }

  return {
    name: operation.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`,
    description: operation.description ?? operation.summary ?? `${method.toUpperCase()} ${path}`,
    parameters: z.object(shape),
    execute: (args) =>
      fetchOperation({
        baseUrl,
        method,
        path,
        pathParams,
        bodyKeys,
        args: args as Record<string, unknown>,
        credentials,
        executor: options.executor ?? defaultHttpExecutor,
      }),
  };
}

function selectOperationCredentials(
  credentials: readonly ResolvedCredential[],
  security: OpenAPIV3.SecurityRequirementObject[] | undefined,
): readonly ResolvedCredential[] {
  const globalCredentials = credentials.filter((credential) => !credential.securityScheme);
  const scopedCredentials = credentials.filter((credential) => credential.securityScheme);

  if (scopedCredentials.length === 0 || security === undefined) return credentials;

  for (const requirement of security) {
    const requiredSchemes = Object.keys(requirement);
    if (requiredSchemes.length === 0) return globalCredentials;

    const matchedCredentials = requiredSchemes.flatMap((scheme) =>
      scopedCredentials.filter((credential) => credential.securityScheme === scheme),
    );
    if (matchedCredentials.length === requiredSchemes.length) {
      return [...globalCredentials, ...matchedCredentials];
    }
  }

  return globalCredentials;
}

async function fetchOperation(input: {
  baseUrl: string;
  method: string;
  path: string;
  pathParams: readonly string[];
  bodyKeys: readonly string[];
  args: Record<string, unknown>;
  credentials: readonly ResolvedCredential[];
  executor: HttpExecutor;
}): Promise<string> {
  const url = buildUrl(
    input.baseUrl,
    input.path,
    input.args,
    input.pathParams,
    input.bodyKeys,
    input.credentials,
  );
  const body = buildBody(input.bodyKeys, input.args);
  const headers = mergeCredentialHeaders(input.credentials);
  try {
    const response = await input.executor({
      url,
      method: input.method.toUpperCase(),
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    return parseResponseText(response.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactCredentialValues(message, input.credentials));
  }
}

async function defaultHttpExecutor(request: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; text: string }> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
  });
  return { status: response.status, text: await response.text() };
}

function mergeCredentialHeaders(
  credentials: readonly ResolvedCredential[],
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const cookies: string[] = [];

  for (const credential of credentials) {
    const patch = applyCredentialToRequest(credential);
    Object.assign(headers, patch.headers);
    for (const [name, value] of Object.entries(patch.cookies)) {
      cookies.push(`${name}=${encodeURIComponent(String(value))}`);
    }
  }

  if (cookies.length > 0) headers.Cookie = cookies.join("; ");
  return headers;
}

type SecuritySchemesMap = Record<
  string,
  OpenAPIV3.SecuritySchemeObject | OpenAPIV3.ReferenceObject | undefined
>;

type SecurityResolutionContext = {
  securitySchemes: SecuritySchemesMap;
  securityEnv: Record<string, string>;
  env: NodeJS.ProcessEnv;
  operationId: string;
  explicitCredentials: readonly ResolvedCredential[];
};

/**
 * Resolves the credentials required to satisfy an operation's effective `security` requirement.
 * Each entry in `requirements` is an alternative (OR); the schemes named within an entry must all
 * be satisfied together (AND). The first fully-satisfiable alternative wins.
 */
function resolveOperationCredentials(
  requirements: readonly OpenAPIV3.SecurityRequirementObject[],
  context: SecurityResolutionContext,
): ResolvedCredential[] {
  if (requirements.length === 0) return [];

  const failures: string[] = [];
  for (const requirement of requirements) {
    const schemeNames = Object.keys(requirement);
    if (schemeNames.length === 0) return [];

    try {
      const unresolvedSchemeNames = schemeNames.filter(
        (schemeName) => !hasExplicitCredentialForScheme(schemeName, context.explicitCredentials),
      );
      if (unresolvedSchemeNames.length === 0) return [];
      return unresolvedSchemeNames.map((schemeName) =>
        resolveSchemeCredential(schemeName, context),
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new ImporterConfigError(
    `Operation "${context.operationId}" requires authentication but no configured security requirement could be satisfied: ${failures.join(" | ")}`,
  );
}

function hasExplicitCredentialForScheme(
  schemeName: string,
  credentials: readonly ResolvedCredential[],
): boolean {
  return credentials.some(
    (credential) => !credential.securityScheme || credential.securityScheme === schemeName,
  );
}

function resolveSchemeCredential(
  schemeName: string,
  context: SecurityResolutionContext,
): ResolvedCredential {
  const scheme = context.securitySchemes[schemeName];
  if (!scheme || "$ref" in scheme) {
    throw new ImporterConfigError(
      `Operation "${context.operationId}" requires security scheme "${schemeName}", which is not defined in components.securitySchemes.`,
    );
  }

  const envVar = context.securityEnv[schemeName];
  if (!envVar) {
    throw new ImporterConfigError(
      `Missing securityEnv mapping for OpenAPI security scheme "${schemeName}" required by operation "${context.operationId}". Provide options.securityEnv["${schemeName}"] with the environment variable name that holds the credential.`,
    );
  }

  const config = securitySchemeToAuthConfig(schemeName, scheme, envVar);
  return readEnvCredential(config, context.env);
}

function securitySchemeToAuthConfig(
  schemeName: string,
  scheme: OpenAPIV3.SecuritySchemeObject,
  envVar: string,
): OpenApiAuthConfig {
  switch (scheme.type) {
    case "http": {
      const httpScheme = scheme.scheme?.toLowerCase();
      if (httpScheme === "bearer") return { type: "bearer", valueFrom: { env: envVar } };
      if (httpScheme === "basic") return { type: "basic", valueFrom: { env: envVar } };
      throw new ImporterConfigError(
        `Unsupported HTTP auth scheme "${scheme.scheme}" for security scheme "${schemeName}"; only "bearer" and "basic" are supported.`,
      );
    }
    case "apiKey":
      return {
        type: "api-key",
        name: scheme.name,
        in: scheme.in as CredentialPlacement,
        valueFrom: { env: envVar },
      };
    case "oauth2":
      if (!scheme.flows?.clientCredentials) {
        throw new ImporterConfigError(
          `Unsupported OAuth2 flow for security scheme "${schemeName}"; only "clientCredentials" is supported (resolved as a static token from ${envVar}).`,
        );
      }
      return { type: "oauth2", valueFrom: { env: envVar } };
    default:
      throw new ImporterConfigError(
        `Unsupported security scheme type "${scheme.type}" for scheme "${schemeName}".`,
      );
  }
}

function parseResponseText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function mergeParams(
  shared: OpenAPIV3.ParameterObject[],
  local: OpenAPIV3.ParameterObject[],
): OpenAPIV3.ParameterObject[] {
  return [...shared, ...local].reduce<OpenAPIV3.ParameterObject[]>((acc, param) => {
    const index = acc.findIndex((item) => item.name === param.name && item.in === param.in);
    if (index >= 0) {
      acc[index] = param;
    } else {
      acc.push(param);
    }
    return acc;
  }, []);
}
