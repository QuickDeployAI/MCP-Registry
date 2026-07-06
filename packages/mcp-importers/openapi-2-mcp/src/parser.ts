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
import type { OpenAPIV3 } from "openapi-types";

export type McpTool = ProxyTool;

export { buildBody, buildUrl, schemaToZod };

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

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

export function openApiToMcpTools(doc: OpenAPIV3.Document, baseUrl: string): McpTool[] {
  const executor = createHttpExecutor(baseUrl);

  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) => {
    const pi = item as OpenAPIV3.PathItemObject;
    const shared = ((pi.parameters ?? []) as OpenAPIV3.ParameterObject[]).map(toProxyParameter);

    return HTTP_METHODS.flatMap((method) => {
      const op = pi[method as OpenAPIV3.HttpMethods];
      return op && !op.deprecated
        ? [operationToTool(toProxyOperation(method, path, op), shared, executor)]
        : [];
    });
  });
}

export function parseVersion(version = "1.0.0"): `${number}.${number}.${number}` {
  const [M = 1, m = 0, p = 0] = (version.match(/\d+/g) ?? []).map(Number);
  return `${M}.${m}.${p}`;
}
