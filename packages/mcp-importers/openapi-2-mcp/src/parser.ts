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
import type { OpenAPIV2, OpenAPIV3 } from "openapi-types";
import { convertObj } from "swagger2openapi";

export type McpTool = ProxyTool;
export interface NormalizedOpenApiDocument {
  document: OpenAPIV3.Document;
  warnings: string[];
}

export { parseVersion } from "@quickdeployai/importer-core";
export { buildBody, buildUrl, schemaToZod };

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

function isSwagger2Document(doc: unknown): doc is OpenAPIV2.Document {
  return typeof doc === "object" && doc !== null && (doc as { swagger?: unknown }).swagger === "2.0";
}

function isOpenApi3Document(doc: unknown): doc is OpenAPIV3.Document {
  return typeof doc === "object" && doc !== null && typeof (doc as { openapi?: unknown }).openapi === "string";
}

export async function normalizeOpenApiDocument(doc: unknown): Promise<NormalizedOpenApiDocument> {
  if (isSwagger2Document(doc)) {
    const result = await convertObj(doc, { patch: true, warnOnly: true });
    const converterWarnings = (result.warnings ?? [])
      .map((warning) => String(warning))
      .filter((warning) => warning.length > 0);
    return {
      document: result.openapi,
      warnings: ["Converted Swagger 2.0 document to OpenAPI 3.0.", ...converterWarnings],
    };
  }

  if (isOpenApi3Document(doc)) {
    return { document: doc, warnings: [] };
  }

  throw new Error("Unsupported API description: expected OpenAPI 3.x or Swagger 2.0.");
}

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
