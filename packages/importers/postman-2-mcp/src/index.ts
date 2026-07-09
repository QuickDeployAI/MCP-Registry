import { readFile } from "node:fs/promises";

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  default?: unknown;
  additionalProperties?: boolean;
};

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    securitySchemes: Record<string, OpenApiSecurityScheme>;
  };
};

type OpenApiOperation = {
  operationId: string;
  summary: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: true;
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<string, { description: string }>;
  security?: Record<string, string[]>[];
  "x-quickdeploy-postman": {
    itemName: string;
    source: "postman-collection";
  };
};

type OpenApiParameter = {
  name: string;
  in: "path" | "query";
  required: boolean;
  schema: JsonSchema;
};

type OpenApiSecurityScheme =
  | { type: "http"; scheme: "bearer" }
  | { type: "apiKey"; in: "header" | "query"; name: string }
  | { type: "http"; scheme: "basic" };

export type PostmanAuth =
  | { type: "bearer"; env: string }
  | { type: "api-key"; env: string; headerName: string }
  | { type: "basic"; usernameEnv: string; passwordEnv: string };

export type PostmanOperation = {
  name: string;
  method: string;
  path: string;
  toolName: string;
  auth?: PostmanAuth;
};

export type PostmanConversionResult = {
  openapi: OpenApiDocument;
  operations: PostmanOperation[];
};

export type LoadPostmanCollectionOptions = {
  collectionPath?: string;
  collectionUrl?: string;
  fetch?: typeof fetch;
};

export type ConvertPostmanCollectionOptions = {
  collection: unknown;
  variables?: Record<string, string>;
};

type PostmanCollection = {
  info?: { name?: string };
  variable?: PostmanVariable[];
  auth?: PostmanAuthRecord;
  item?: PostmanItem[];
};

type PostmanVariable = {
  key?: string;
  value?: unknown;
};

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
};

type PostmanRequest = {
  method?: string;
  url?: string | PostmanUrl;
  header?: PostmanHeader[];
  body?: PostmanBody;
  auth?: PostmanAuthRecord;
};

type PostmanUrl = {
  raw?: string;
  query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
};

type PostmanHeader = {
  key?: string;
  value?: string;
};

type PostmanBody = {
  mode?: string;
  raw?: string;
};

type PostmanAuthRecord = {
  type?: string;
  bearer?: Array<{ key?: string; value?: string }>;
  apikey?: Array<{ key?: string; value?: string }>;
  basic?: Array<{ key?: string; value?: string }>;
};

type VariableContext = {
  values: Map<string, string>;
};

const VARIABLE_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export async function loadPostmanCollection(
  options: LoadPostmanCollectionOptions,
): Promise<unknown> {
  if (options.collectionPath) {
    return JSON.parse(await readFile(options.collectionPath, "utf8"));
  }
  if (options.collectionUrl) {
    const fetchImpl = options.fetch ?? fetch;
    const response = await fetchImpl(options.collectionUrl);
    if (!response.ok) {
      throw new Error(`Failed to load Postman collection: HTTP ${response.status}.`);
    }
    return response.json();
  }
  throw new Error("Postman collection requires collectionPath or collectionUrl.");
}

export function convertPostmanCollectionToOpenApi(
  options: ConvertPostmanCollectionOptions,
): PostmanConversionResult {
  const collection = asCollection(options.collection);
  const variableContext = variablesFor(collection, options.variables ?? {});
  const title = stringValue(collection.info?.name, "Postman Collection");
  const operations: PostmanOperation[] = [];
  const paths: OpenApiDocument["paths"] = {};
  const securitySchemes: Record<string, OpenApiSecurityScheme> = {};
  let serverUrl = "";

  for (const item of flattenItems(collection.item ?? [])) {
    if (!item.request || typeof item.request === "string") continue;
    const request = item.request;
    const method = stringValue(request.method, "GET").toUpperCase();
    const rawUrl = resolveVariables(readRawUrl(request.url), variableContext);
    const baseUrl = readBaseUrl(variableContext, rawUrl);
    const path = operationPath(rawUrl, baseUrl);
    serverUrl ||= baseUrl;
    const name = stringValue(item.name, `${method} ${path}`);
    const toolName = normalizeToolName(`${title}_${name}`);
    const auth = readAuth(request.auth ?? collection.auth, variableContext);
    const operation: PostmanOperation = {
      name,
      method,
      path,
      toolName,
      ...(auth ? { auth } : {}),
    };
    operations.push(operation);

    const openApiOperation: OpenApiOperation = {
      operationId: toolName,
      summary: `${name} Postman request exposed through postman-2-mcp.`,
      responses: {
        "200": { description: `${name} response.` },
      },
      "x-quickdeploy-postman": {
        itemName: name,
        source: "postman-collection",
      },
    };

    const parameters = requestParameters(path, request.url, variableContext);
    if (parameters.length > 0) openApiOperation.parameters = parameters;

    const requestBody = requestBodyFromPostman(request);
    if (requestBody) openApiOperation.requestBody = requestBody;

    const security = securityForAuth(auth, securitySchemes);
    if (security) openApiOperation.security = [security];

    paths[path] = {
      ...paths[path],
      [method.toLowerCase()]: openApiOperation,
    };
  }

  return {
    operations,
    openapi: {
      openapi: "3.1.0",
      info: { title, version: "0.1.0" },
      servers: serverUrl ? [{ url: serverUrl }] : [],
      paths,
      components: { securitySchemes },
    },
  };
}

export function postmanCollectionToMcpManifestSelect(conversion: PostmanConversionResult): {
  requests: Array<{ method: string; uriTemplate: string }>;
} {
  return {
    requests: conversion.operations.map((operation) => ({
      method: operation.method,
      uriTemplate: operation.path,
    })),
  };
}

export function normalizeToolName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function asCollection(value: unknown): PostmanCollection {
  if (!isRecord(value)) throw new Error("Postman collection must be a JSON object.");
  return value as PostmanCollection;
}

function variablesFor(
  collection: PostmanCollection,
  overrides: Record<string, string>,
): VariableContext {
  const values = new Map<string, string>();
  for (const variable of collection.variable ?? []) {
    if (!variable.key || typeof variable.value !== "string") continue;
    values.set(variable.key, variable.value);
  }
  for (const [key, value] of Object.entries(overrides)) values.set(key, value);
  return { values };
}

function flattenItems(items: PostmanItem[]): PostmanItem[] {
  return items.flatMap((item) => (item.item ? flattenItems(item.item) : [item]));
}

function readRawUrl(url: PostmanRequest["url"]): string {
  if (typeof url === "string") return url;
  if (url?.raw) return url.raw;
  throw new Error("Postman request URL must include a raw URL.");
}

function resolveVariables(value: string, context: VariableContext): string {
  return value.replace(VARIABLE_PATTERN, (_, key: string) => {
    const replacement = context.values.get(key);
    if (replacement === undefined) throw new Error(`Unresolved Postman variable "${key}".`);
    return replacement;
  });
}

function readBaseUrl(context: VariableContext, rawUrl: string): string {
  const baseUrl = context.values.get("baseUrl");
  if (baseUrl) return baseUrl;
  const parsed = new URL(rawUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

function operationPath(rawUrl: string, baseUrl: string): string {
  const parsed = new URL(rawUrl);
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const relativePath =
    basePath && parsed.pathname.startsWith(`${basePath}/`)
      ? parsed.pathname.slice(basePath.length)
      : parsed.pathname;
  return colonParamsToTemplate(relativePath || "/");
}

function colonParamsToTemplate(path: string): string {
  return path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment))
    .join("/");
}

function requestParameters(
  path: string,
  url: PostmanRequest["url"],
  context: VariableContext,
): OpenApiParameter[] {
  const parameters: OpenApiParameter[] = pathParameterNames(path).map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));

  const query = typeof url === "object" && url ? (url.query ?? []) : [];
  for (const entry of query) {
    if (entry.disabled || !entry.key) continue;
    const value = entry.value ? resolveVariables(entry.value, context) : undefined;
    parameters.push({
      name: entry.key,
      in: "query",
      required: false,
      schema: {
        type: "string",
        ...(value ? { default: value } : {}),
      },
    });
  }

  return parameters;
}

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1] ?? "");
}

function requestBodyFromPostman(
  request: PostmanRequest,
): OpenApiOperation["requestBody"] | undefined {
  if (request.body?.mode !== "raw" || !request.body.raw) return undefined;
  const contentType =
    request.header?.find((header) => header.key?.toLowerCase() === "content-type")?.value ??
    "application/json";

  if (!contentType.includes("json")) return undefined;

  return {
    required: true,
    content: {
      "application/json": {
        schema: inferJsonSchema(JSON.parse(request.body.raw)),
      },
    },
  };
}

function inferJsonSchema(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length > 0 ? inferJsonSchema(value[0]) : {},
    };
  }
  if (isRecord(value)) {
    const properties = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, inferJsonSchema(child)]),
    );
    return {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  return { type: "string" };
}

function readAuth(
  auth: PostmanAuthRecord | undefined,
  context: VariableContext,
): PostmanAuth | undefined {
  if (!auth?.type) return undefined;
  if (auth.type === "bearer") {
    const token = authValue(auth.bearer, "token");
    return { type: "bearer", env: envNameFromResolvedValue(resolveVariables(token, context)) };
  }
  if (auth.type === "apikey") {
    const key = authValue(auth.apikey, "key");
    const value = authValue(auth.apikey, "value");
    const placement = authValue(auth.apikey, "in", "header");
    if (placement !== "header") throw new Error("postman-2-mcp supports header API keys only.");
    return {
      type: "api-key",
      env: envNameFromResolvedValue(resolveVariables(value, context)),
      headerName: key,
    };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      usernameEnv: envNameFromResolvedValue(
        resolveVariables(authValue(auth.basic, "username"), context),
      ),
      passwordEnv: envNameFromResolvedValue(
        resolveVariables(authValue(auth.basic, "password"), context),
      ),
    };
  }
  return undefined;
}

function authValue(
  entries: Array<{ key?: string; value?: string }> | undefined,
  key: string,
  fallback?: string,
): string {
  const value = entries?.find((entry) => entry.key === key)?.value ?? fallback;
  if (!value) throw new Error(`Postman auth ${key} value is required.`);
  return value;
}

function envNameFromResolvedValue(value: string): string {
  const placeholder = /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value);
  if (!placeholder?.[1]) {
    throw new Error("Postman auth secrets must resolve to an environment placeholder.");
  }
  return placeholder[1];
}

function securityForAuth(
  auth: PostmanAuth | undefined,
  securitySchemes: Record<string, OpenApiSecurityScheme>,
): Record<string, string[]> | undefined {
  if (!auth) return undefined;
  if (auth.type === "bearer") {
    securitySchemes[auth.env] = { type: "http", scheme: "bearer" };
    return { [auth.env]: [] };
  }
  if (auth.type === "api-key") {
    securitySchemes[auth.env] = { type: "apiKey", in: "header", name: auth.headerName };
    return { [auth.env]: [] };
  }
  securitySchemes[auth.usernameEnv] = { type: "http", scheme: "basic" };
  return { [auth.usernameEnv]: [] };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
