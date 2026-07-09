import { readFile } from "node:fs/promises";
import {
  createJsonRpcClient,
  type CreateJsonRpcClientOptions,
  type JsonRpcParamStructure,
} from "@quickdeployai/importer-core/json-rpc";
import { validateOpenRPCDocument } from "@open-rpc/schema-utils-js";
import type {
  ContentDescriptorObject,
  MethodObject,
  MethodObjectParamStructure,
  OpenrpcDocument,
  ServerObject,
} from "@open-rpc/meta-schema";
import { z } from "zod";

export const OPENRPC_MEDIA_TYPE = "application/vnd.open-rpc+json";

export type OpenRpcInlineInput = OpenrpcDocument | Record<string, unknown> | string | Uint8Array;
export type OpenRpcInput = OpenRpcInlineInput | URL;

export type LoadOpenRpcDocumentOptions = {
  fetch?: typeof fetch;
};

export type OpenRpcContentDescriptor = {
  name: string;
  summary?: string;
  description?: string;
  required: boolean;
  schema: unknown;
};

export type OpenRpcMethod = {
  name: string;
  summary?: string;
  description?: string;
  paramStructure: MethodObjectParamStructure;
  params: OpenRpcContentDescriptor[];
  result?: OpenRpcContentDescriptor;
  servers: ServerObject[];
  errors: unknown[];
};

export type OpenRpcModel = {
  openrpc: string;
  info: OpenrpcDocument["info"];
  servers: ServerObject[];
  methods: OpenRpcMethod[];
  raw: OpenrpcDocument;
};

export type OpenRpcSourceEntry = {
  identifier: string;
  displayName: string;
  type: string;
  url?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
};

export type OpenRpcCapabilityKind = "api-contract" | "tool";

export type ParsedCapability = {
  kind: OpenRpcCapabilityKind;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  raw: unknown;
};

export type ArtifactParseDiagnostic = {
  level: "info" | "warn" | "error";
  message: string;
};

export type ArtifactParseResult = {
  capabilities: ParsedCapability[];
  mcpProjection?: OpenRpcMcpProjection;
  diagnostics: ArtifactParseDiagnostic[];
};

export type ArtifactParser = {
  readonly mediaTypes: readonly string[];
  parse(nativeArtifact: OpenRpcInlineInput, entry: OpenRpcSourceEntry): Promise<ArtifactParseResult>;
};

export type OpenRpcMcpProjection = {
  tools: OpenRpcTool[];
};

export type OpenRpcTool = {
  name: string;
  description: string;
  method: string;
  paramStructure: JsonRpcParamStructure;
  inputSchema: Record<string, unknown>;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute(args: unknown): Promise<string>;
};

export type BuildOpenRpcToolsOptions = Pick<
  CreateJsonRpcClientOptions,
  "endpoint" | "transport" | "fetch" | "headers" | "credentials" | "timeoutMs" | "createWebSocket"
>;

export class OpenRpcDocumentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OpenRpcDocumentError";
  }
}

export async function loadOpenRpcDocument(
  input: OpenRpcInput,
  options: LoadOpenRpcDocumentOptions = {},
): Promise<OpenRpcModel> {
  return parseOpenRpcValue(await readOpenRpcInput(input, options));
}

export function parseOpenRpcDocument(input: OpenRpcInlineInput): OpenRpcModel {
  return parseOpenRpcValue(decodeInlineInput(input));
}

export function openRpcToParsedCapabilities(model: OpenRpcModel): ParsedCapability[] {
  return [
    {
      kind: "api-contract",
      name: model.info.title,
      description: model.info.description,
      raw: model.raw,
    },
    ...model.methods.map((method) => ({
      kind: "tool" as const,
      name: openRpcToolName(method.name),
      description: method.description ?? method.summary ?? `JSON-RPC method ${method.name}`,
      inputSchema: inputSchemaForMethod(method),
      raw: method,
    })),
  ];
}

export function buildOpenRpcTools(
  model: OpenRpcModel,
  options: BuildOpenRpcToolsOptions,
): OpenRpcTool[] {
  const client = createJsonRpcClient(options);
  return model.methods.map((method) => {
    const paramStructure = jsonRpcParamStructure(method.paramStructure);
    const inputSchema = inputSchemaForMethod(method);
    const parameters = z.object(
      Object.fromEntries(
        method.params.map((param) => [
          param.name,
          jsonSchemaToZod(param.schema, param.required).describe(
            param.description ?? param.summary ?? "",
          ),
        ]),
      ),
    );

    return {
      name: openRpcToolName(method.name),
      description: method.description ?? method.summary ?? `JSON-RPC method ${method.name}`,
      method: method.name,
      paramStructure,
      inputSchema,
      parameters,
      execute: async (args) => {
        const parsed = parameters.parse(args);
        const result = await client.call(method.name, wireParamsForMethod(method, parsed), {
          paramStructure,
        });
        return stringifyJsonRpcResult(result);
      },
    };
  });
}

export function createOpenRpcArtifactParser(runtime?: BuildOpenRpcToolsOptions): ArtifactParser {
  return {
    mediaTypes: [OPENRPC_MEDIA_TYPE],
    async parse(nativeArtifact) {
      const model = parseOpenRpcDocument(nativeArtifact);
      const diagnostics: ArtifactParseDiagnostic[] = [];
      const mcpProjection = runtime ? { tools: buildOpenRpcTools(model, runtime) } : undefined;
      if (!runtime) {
        diagnostics.push({
          level: "info",
          message: "OpenRPC document parsed without runtime endpoint; MCP projection omitted.",
        });
      }
      return {
        capabilities: openRpcToParsedCapabilities(model),
        ...(mcpProjection ? { mcpProjection } : {}),
        diagnostics,
      };
    },
  };
}

export const openRpcArtifactParser = createOpenRpcArtifactParser();

function parseOpenRpcValue(raw: unknown): OpenRpcModel {
  assertRecord(raw, "OpenRPC document");

  const validation = validateOpenRPCDocument(raw as OpenrpcDocument);
  if (validation !== true) {
    throw new OpenRpcDocumentError(validation.message);
  }

  const document = dereferenceLocalRefs(raw as OpenrpcDocument) as OpenrpcDocument;
  return {
    openrpc: document.openrpc,
    info: document.info,
    servers: document.servers ?? [],
    methods: document.methods.map((method, index) =>
      normalizeMethod(assertMethodObject(method, `methods[${index}]`), document.servers ?? []),
    ),
    raw: document,
  };
}

async function readOpenRpcInput(
  input: OpenRpcInput,
  options: LoadOpenRpcDocumentOptions,
): Promise<unknown> {
  if (input instanceof URL) return readFromUrl(input, options);
  if (typeof input !== "string") return decodeInlineInput(input);

  const trimmed = input.trim();
  if (looksLikeJson(trimmed)) return parseJson(trimmed, "inline OpenRPC JSON");

  const asUrl = tryParseUrl(trimmed);
  if (asUrl) return readFromUrl(asUrl, options);

  return parseJson(await readFile(input, "utf8"), `OpenRPC file ${input}`);
}

async function readFromUrl(url: URL, options: LoadOpenRpcDocumentOptions): Promise<unknown> {
  if (url.protocol === "file:") {
    return parseJson(await readFile(url, "utf8"), `OpenRPC file ${url.href}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OpenRpcDocumentError(`Unsupported OpenRPC URL protocol: ${url.protocol}`);
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new OpenRpcDocumentError("No fetch implementation available.");

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new OpenRpcDocumentError(
      `Failed to fetch OpenRPC document ${url.href}: ${response.status} ${response.statusText}`,
    );
  }
  return parseJson(await response.text(), `OpenRPC URL ${url.href}`);
}

function normalizeMethod(method: MethodObject, documentServers: ServerObject[]): OpenRpcMethod {
  return {
    name: method.name,
    ...(method.summary ? { summary: method.summary } : {}),
    ...(method.description ? { description: method.description } : {}),
    paramStructure: method.paramStructure ?? "either",
    params: (method.params ?? []).map((param, index) =>
      normalizeContentDescriptor(param, `method ${method.name} params[${index}]`),
    ),
    ...(method.result
      ? { result: normalizeContentDescriptor(method.result, `method ${method.name} result`) }
      : {}),
    servers: method.servers ?? documentServers,
    errors: method.errors ?? [],
  };
}

function normalizeContentDescriptor(value: unknown, context: string): OpenRpcContentDescriptor {
  assertRecord(value, context);
  const descriptor = value as ContentDescriptorObject;
  if (typeof descriptor.name !== "string" || descriptor.name.length === 0) {
    throw new OpenRpcDocumentError(`Invalid ${context}: content descriptor requires a name.`);
  }
  if (!("schema" in descriptor)) {
    throw new OpenRpcDocumentError(`Invalid ${context}: content descriptor requires a schema.`);
  }

  return {
    name: descriptor.name,
    ...(descriptor.summary ? { summary: descriptor.summary } : {}),
    ...(descriptor.description ? { description: descriptor.description } : {}),
    required: descriptor.required ?? false,
    schema: descriptor.schema,
  };
}

function dereferenceLocalRefs(
  value: unknown,
  root: unknown = value,
  seen = new Set<string>(),
): unknown {
  if (Array.isArray(value)) return value.map((item) => dereferenceLocalRefs(item, root, seen));
  if (!isRecord(value)) return value;

  const ref = value.$ref;
  if (typeof ref === "string") {
    if (!ref.startsWith("#/")) {
      throw new OpenRpcDocumentError(`Only local OpenRPC $ref values are supported in O1: ${ref}`);
    }
    if (seen.has(ref)) throw new OpenRpcDocumentError(`Circular OpenRPC $ref detected: ${ref}`);
    seen.add(ref);
    const resolved = readJsonPointer(root, ref);
    const dereferenced = dereferenceLocalRefs(resolved, root, seen);
    seen.delete(ref);
    return dereferenced;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, dereferenceLocalRefs(nested, root, seen)]),
  );
}

function readJsonPointer(root: unknown, ref: string): unknown {
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((current: unknown, part) => {
      if (!isRecord(current) && !Array.isArray(current)) {
        throw new OpenRpcDocumentError(`OpenRPC $ref ${ref} points through a non-object value.`);
      }
      const next = (current as Record<string, unknown>)[part];
      if (next === undefined) throw new OpenRpcDocumentError(`OpenRPC $ref not found: ${ref}`);
      return next;
    }, root);
}

function assertMethodObject(value: unknown, context: string): MethodObject {
  assertRecord(value, context);
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new OpenRpcDocumentError(`Invalid ${context}: method requires a name.`);
  }
  return value as MethodObject;
}

function decodeInlineInput(input: OpenRpcInlineInput): unknown {
  if (typeof input === "string") return parseJson(input, "inline OpenRPC JSON");
  if (input instanceof Uint8Array) return parseJson(Buffer.from(input).toString("utf8"), "buffer");
  return input;
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new OpenRpcDocumentError(`Invalid JSON in ${source}.`, { cause: error });
  }
}

function assertRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new OpenRpcDocumentError(`Invalid ${context}: expected an object.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeJson(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[");
}

function tryParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function inputSchemaForMethod(method: OpenRpcMethod): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      method.params.map((param) => [
        param.name,
        {
          ...(isRecord(param.schema) ? param.schema : {}),
          ...((param.description ?? param.summary)
            ? { description: param.description ?? param.summary }
            : {}),
        },
      ]),
    ),
    required: method.params.filter((param) => param.required).map((param) => param.name),
  };
}

function wireParamsForMethod(method: OpenRpcMethod, args: Record<string, unknown>): unknown {
  if (jsonRpcParamStructure(method.paramStructure) === "by-position") {
    return method.params.map((param) => args[param.name]);
  }
  return args;
}

function jsonRpcParamStructure(paramStructure: MethodObjectParamStructure): JsonRpcParamStructure {
  return paramStructure === "by-position" ? "by-position" : "by-name";
}

function openRpcToolName(methodName: string): string {
  return methodName
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function stringifyJsonRpcResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

function jsonSchemaToZod(schema: unknown, required: boolean): z.ZodTypeAny {
  const source = isRecord(schema) ? schema : {};
  let mapped: z.ZodTypeAny;

  if (Array.isArray(source.enum)) {
    const values = source.enum;
    mapped =
      values.length >= 2 && values.every((value): value is string => typeof value === "string")
        ? z.enum(values as [string, ...string[]])
        : z.unknown();
  } else {
    switch (source.type) {
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
        mapped = z.array(jsonSchemaToZod(source.items, true));
        break;
      case "object":
        mapped = z.object(
          Object.fromEntries(
            Object.entries(isRecord(source.properties) ? source.properties : {}).map(
              ([key, value]) => [
                key,
                jsonSchemaToZod(
                  value,
                  Array.isArray(source.required) && source.required.includes(key),
                ),
              ],
            ),
          ),
        );
        break;
      default:
        mapped = z.unknown();
        break;
    }
  }

  return required ? mapped : mapped.optional();
}
