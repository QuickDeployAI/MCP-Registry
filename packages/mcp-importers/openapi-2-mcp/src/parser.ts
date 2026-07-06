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
  fallbackToolName,
  mergeParams,
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

export interface OpenApiExposeOptions {
  allow?: string[];
  tools?: string[];
  deny?: string[];
  rename?: Record<string, string>;
}

export interface OpenApiContentRef {
  type: "content-ref";
  operationId: string;
  resourceUri: string;
  size: number;
}

export class OpenApiContentStore {
  private readonly blobs = new Map<string, string>();

  store(resourceUri: string, content: string): OpenApiContentRef {
    this.blobs.set(resourceUri, content);
    const [, operationId = "unknown"] =
      /^openapi2mcp:\/\/content\/([^/]+)\//.exec(resourceUri) ?? [];
    return {
      type: "content-ref",
      operationId: decodeURIComponent(operationId),
      resourceUri,
      size: Buffer.byteLength(content, "utf-8"),
    };
  }

  retrieve(resourceUri: string): string | null {
    return this.blobs.get(resourceUri) ?? null;
  }
}

export interface OpenApiToolOptions {
  expose?: OpenApiExposeOptions;
  maxInlineResponseBytes?: number;
  contentStore?: OpenApiContentStore;
}

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

function contentResourceUri(
  operationId: string,
  pathParams: readonly string[],
  args: Record<string, unknown>,
): string {
  const callId =
    pathParams.map((name) => args[name]).find((value) => value !== undefined && value !== null) ??
    "response";
  return `openapi2mcp://content/${encodeURIComponent(operationId)}/${encodeURIComponent(String(callId))}/response`;
}

function appendOriginalOperationId(description: string, originalName: string): string {
  return `${description}\n\nOriginal operationId: ${originalName}`;
}

function curateOperation(
  operation: ProxyOperation,
  expose: OpenApiExposeOptions | undefined,
): ProxyOperation | null {
  const originalName = operation.name ?? fallbackToolName(operation.method, operation.path);
  const allow = expose?.allow ?? expose?.tools;
  if (allow && !allow.includes(originalName)) return null;
  if (expose?.deny?.includes(originalName)) return null;

  const renamed = expose?.rename?.[originalName];
  if (!renamed) return operation;

  return {
    ...operation,
    name: renamed,
    description: appendOriginalOperationId(
      operation.description ?? operation.summary ?? `${operation.method.toUpperCase()} ${operation.path}`,
      originalName,
    ),
  };
}

function withContentRefs(
  tool: McpTool,
  operationId: string,
  pathParams: readonly string[],
  options: OpenApiToolOptions,
): McpTool {
  if (options.maxInlineResponseBytes === undefined) return tool;

  const contentStore = options.contentStore ?? new OpenApiContentStore();
  const maxInlineResponseBytes = options.maxInlineResponseBytes;
  return {
    ...tool,
    async execute(args: unknown): Promise<string> {
      const text = await tool.execute(args);
      if (Buffer.byteLength(text, "utf-8") <= maxInlineResponseBytes) {
        return text;
      }

      const resourceUri = contentResourceUri(
        operationId,
        pathParams,
        args as Record<string, unknown>,
      );
      return JSON.stringify(contentStore.store(resourceUri, text), null, 2);
    },
  };
}

export function openApiToMcpTools(
  doc: OpenAPIV3.Document,
  baseUrl: string,
  options: OpenApiToolOptions = {},
): McpTool[] {
  const executor = createHttpExecutor(baseUrl);

  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) => {
    const pi = item as OpenAPIV3.PathItemObject;
    const shared = ((pi.parameters ?? []) as OpenAPIV3.ParameterObject[]).map(toProxyParameter);

    return HTTP_METHODS.flatMap((method) => {
      const op = pi[method as OpenAPIV3.HttpMethods];
      if (!op || op.deprecated) return [];

      const operation = curateOperation(toProxyOperation(method, path, op), options.expose);
      if (!operation) return [];

      const params = mergeParams(shared, operation.parameters ?? []);
      const pathParams = params.filter((p) => p.in === "path").map((p) => p.name);
      const originalName = op.operationId ?? fallbackToolName(method, path);
      return [withContentRefs(operationToTool(operation, shared, executor), originalName, pathParams, options)];
    });
  });
}
