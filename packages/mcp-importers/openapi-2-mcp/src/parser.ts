import type {
  JsonSchemaLike,
  ProxyOperation,
  ProxyParameter,
  ProxyRequestBody,
  ProxyTool,
} from "@quickdeployai/proxy-core";
import {
  buildBody,
  buildUrl,
  createHttpExecutor,
  operationToTool,
  schemaToZod,
} from "@quickdeployai/proxy-core";
import {
  applyCredentialAuth,
  envCredential,
  type CredentialAuthConfig,
} from "@quickdeployai/importer-core";
import type { OpenAPIV3 } from "openapi-types";

export type McpTool = ProxyTool;

export { parseVersion } from "@quickdeployai/importer-core";
export { buildBody, buildUrl, schemaToZod };

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

export type OpenApiToMcpOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly envPrefix?: string;
};

function toProxyParameter(parameter: OpenAPIV3.ParameterObject): ProxyParameter {
  return {
    name: parameter.name,
    in: parameter.in,
    ...(parameter.required !== undefined ? { required: parameter.required } : {}),
    ...(parameter.description !== undefined ? { description: parameter.description } : {}),
    schema: (parameter.schema ?? {}) as JsonSchemaLike,
  };
}

function toProxyRequestBody(
  requestBody: OpenAPIV3.RequestBodyObject | undefined,
): ProxyRequestBody | undefined {
  const bodySchema = requestBody?.content?.["application/json"]?.schema;
  if (!bodySchema) return undefined;

  return {
    ...(requestBody.required !== undefined ? { required: requestBody.required } : {}),
    ...(requestBody.description !== undefined ? { description: requestBody.description } : {}),
    schema: bodySchema as JsonSchemaLike,
  };
}

function toProxyOperation(
  method: string,
  path: string,
  op: OpenAPIV3.OperationObject,
): ProxyOperation {
  const requestBody = toProxyRequestBody(op.requestBody as OpenAPIV3.RequestBodyObject | undefined);
  const operation: ProxyOperation = {
    method,
    path,
    ...(op.operationId !== undefined ? { name: op.operationId } : {}),
    ...(op.summary !== undefined ? { summary: op.summary } : {}),
    ...(op.description !== undefined ? { description: op.description } : {}),
    parameters: ((op.parameters ?? []) as OpenAPIV3.ParameterObject[]).map(toProxyParameter),
  };
  if (requestBody !== undefined) {
    operation.requestBody = requestBody;
  }
  return operation;
}

export function openApiToMcpTools(
  doc: OpenAPIV3.Document,
  baseUrl: string,
  options: OpenApiToMcpOptions = {},
): McpTool[] {
  const env = options.env ?? process.env;
  const envPrefix = options.envPrefix ?? "OPENAPI_AUTH";

  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) => {
    const pi = item as OpenAPIV3.PathItemObject;
    const shared = ((pi.parameters ?? []) as OpenAPIV3.ParameterObject[]).map(toProxyParameter);

    return HTTP_METHODS.flatMap((method) => {
      const op = pi[method as OpenAPIV3.HttpMethods];
      const authConfigs = op ? authForOperation(doc, op, envPrefix) : [];
      const executor = createHttpExecutor(baseUrl, {
        augmentRequest: () => applyCredentialAuth(authConfigs, env),
      });
      return op && !op.deprecated
        ? [operationToTool(toProxyOperation(method, path, op), shared, executor)]
        : [];
    });
  });
}

export function authForOperation(
  doc: OpenAPIV3.Document,
  operation: OpenAPIV3.OperationObject,
  envPrefix = "OPENAPI_AUTH",
): CredentialAuthConfig[] {
  const requirements = operation.security ?? doc.security ?? [];
  const schemes = doc.components?.securitySchemes ?? {};

  for (const requirement of requirements) {
    const configs = Object.keys(requirement).map((schemeName) =>
      authForScheme(schemeName, schemes[schemeName], envPrefix),
    );
    if (configs.every((config): config is CredentialAuthConfig => config !== undefined)) {
      return configs;
    }
  }

  return [];
}

function authForScheme(
  schemeName: string,
  scheme: OpenAPIV3.SecuritySchemeObject | OpenAPIV3.ReferenceObject | undefined,
  envPrefix: string,
): CredentialAuthConfig | undefined {
  if (!scheme || "$ref" in scheme) return undefined;
  const envBase = `${envPrefix}_${envName(schemeName)}`;

  if (scheme.type === "apiKey" && (scheme.in === "header" || scheme.in === "query")) {
    return {
      type: "apiKey",
      in: scheme.in,
      name: scheme.name,
      value: envCredential(envBase),
    };
  }

  if (scheme.type === "http" && scheme.scheme.toLowerCase() === "bearer") {
    return { type: "bearer", token: envCredential(`${envBase}_TOKEN`) };
  }

  if (scheme.type === "http" && scheme.scheme.toLowerCase() === "basic") {
    return {
      type: "basic",
      username: envCredential(`${envBase}_USERNAME`),
      password: envCredential(`${envBase}_PASSWORD`),
    };
  }

  if (scheme.type === "oauth2" && scheme.flows.clientCredentials) {
    return {
      type: "oauth2ClientCredentials",
      accessToken: envCredential(`${envBase}_ACCESS_TOKEN`),
    };
  }

  return undefined;
}

function envName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}
