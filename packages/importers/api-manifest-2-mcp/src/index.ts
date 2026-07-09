import { readFile } from "node:fs/promises";
import type { OpenAPIV3 } from "openapi-types";
import {
  ApiManifestSchema,
  McpManifestSelectSchema,
  apiManifestToMcpManifestSelect,
  selectOpenApiOperations,
  uriTemplatesMatch,
  type ApiManifest,
  type ApiManifestDependency,
  type McpManifestRequestSelect,
  type McpManifestSelect,
  type OpenApiOperationSelection,
} from "@quickdeployai/registry-schemas";

export type ApiManifestInlineInput = ApiManifest | Record<string, unknown> | string | Uint8Array;
export type ApiManifestInput = ApiManifestInlineInput | URL;

export { buildApiManifestTools } from "./tools";
export type { ApiManifestProxyTool, BuildApiManifestToolsOptions } from "./tools";

export type LoadApiManifestOptions = {
  fetch?: typeof fetch;
};

export type ResolveApiManifestDependenciesOptions = LoadApiManifestOptions & {
  openApiDocuments?: Record<string, unknown>;
};

export type ResolvedApiManifestDependency = {
  dependencyKey: string;
  dependency: ApiManifestDependency;
  select: McpManifestSelect;
  openApiDocument: OpenAPIV3.Document;
  selectedOperations: OpenApiOperationSelection[];
  selectedOpenApiDocument: OpenAPIV3.Document;
};

export class ApiManifestLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiManifestLoadError";
  }
}

export async function loadApiManifest(
  input: ApiManifestInput,
  options: LoadApiManifestOptions = {},
): Promise<ApiManifest> {
  return ApiManifestSchema.parse(await readApiManifestInput(input, options));
}

export function parseApiManifest(input: ApiManifestInlineInput): ApiManifest {
  const raw = decodeInlineInput(input);
  return ApiManifestSchema.parse(raw);
}

export function apiManifestToSelect(input: ApiManifestInlineInput): McpManifestSelect {
  return apiManifestToMcpManifestSelect(parseApiManifest(input));
}

export async function resolveApiManifestDependencies(
  input: ApiManifestInput,
  options: ResolveApiManifestDependenciesOptions = {},
): Promise<ResolvedApiManifestDependency[]> {
  const manifest = await loadApiManifest(input, options);
  const entries = Object.entries(manifest.apiDependencies);

  return Promise.all(
    entries.map(async ([dependencyKey, dependency]) => {
      const openApiDocument = await resolveOpenApiDocument(dependencyKey, dependency, options);
      const select = dependencyToSelect(dependency);
      const selectedOperations = selectOpenApiOperations(openApiDocument, select);
      assertAllRequestsSelected(dependencyKey, select.requests, selectedOperations);

      return {
        dependencyKey,
        dependency,
        select,
        openApiDocument,
        selectedOperations,
        selectedOpenApiDocument: filterOpenApiDocument(openApiDocument, selectedOperations),
      };
    }),
  );
}

async function readApiManifestInput(
  input: ApiManifestInput,
  options: LoadApiManifestOptions,
): Promise<unknown> {
  if (input instanceof URL) return readFromUrl(input, options);
  if (typeof input !== "string") return decodeInlineInput(input);

  const trimmed = input.trim();
  if (looksLikeJson(trimmed)) return parseJson(trimmed, "inline API Manifest JSON");

  const asUrl = tryParseUrl(trimmed);
  if (asUrl) return readFromUrl(asUrl, options);

  return parseJson(await readFile(input, "utf8"), `API Manifest file ${input}`);
}

async function readFromUrl(url: URL, options: LoadApiManifestOptions): Promise<unknown> {
  if (url.protocol === "file:") {
    return parseJson(await readFile(url, "utf8"), `API Manifest file ${url.href}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiManifestLoadError(`Unsupported API Manifest URL protocol: ${url.protocol}`);
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new ApiManifestLoadError("No fetch implementation available.");

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new ApiManifestLoadError(
      `Failed to fetch API Manifest ${url.href}: ${response.status} ${response.statusText}`,
    );
  }
  return parseJson(await response.text(), `API Manifest URL ${url.href}`);
}

function decodeInlineInput(input: ApiManifestInlineInput): unknown {
  if (typeof input === "string") return parseJson(input, "inline API Manifest JSON");
  if (input instanceof Uint8Array) return parseJson(Buffer.from(input).toString("utf8"), "buffer");
  return input;
}

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApiManifestLoadError(`Invalid JSON in ${source}.`, { cause: error });
  }
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

async function resolveOpenApiDocument(
  dependencyKey: string,
  dependency: ApiManifestDependency,
  options: ResolveApiManifestDependenciesOptions,
): Promise<OpenAPIV3.Document> {
  if (options.openApiDocuments?.[dependencyKey]) {
    return parseOpenApiDocument(options.openApiDocuments[dependencyKey], dependencyKey);
  }

  if (!dependency.apiDescriptionUrl) {
    throw new ApiManifestLoadError(
      `API Manifest dependency "${dependencyKey}" is missing apiDescriptionUrl.`,
    );
  }

  const raw = await readFromUrl(new URL(dependency.apiDescriptionUrl), options);
  return parseOpenApiDocument(raw, dependencyKey);
}

function parseOpenApiDocument(input: unknown, dependencyKey: string): OpenAPIV3.Document {
  if (!isRecord(input) || !isRecord(input.paths)) {
    throw new ApiManifestLoadError(
      `API Manifest dependency "${dependencyKey}" resolved an OpenAPI document without paths.`,
    );
  }
  return input as unknown as OpenAPIV3.Document;
}

function dependencyToSelect(dependency: ApiManifestDependency): McpManifestSelect {
  return McpManifestSelectSchema.parse({
    requests: dependency.requests.map(({ method, uriTemplate }) => ({ method, uriTemplate })),
  });
}

function assertAllRequestsSelected(
  dependencyKey: string,
  requests: readonly McpManifestRequestSelect[],
  selectedOperations: readonly OpenApiOperationSelection[],
): void {
  const missing = requests.filter(
    (request) =>
      !selectedOperations.some(
        (selection) =>
          selection.method === request.method &&
          uriTemplatesMatch(selection.path, request.uriTemplate),
      ),
  );

  if (missing.length === 0) return;

  throw new ApiManifestLoadError(
    `API Manifest dependency "${dependencyKey}" selected requests not found in OpenAPI document: ${missing
      .map((request) => `${request.method} ${request.uriTemplate}`)
      .join(", ")}.`,
  );
}

function filterOpenApiDocument(
  document: OpenAPIV3.Document,
  selections: readonly OpenApiOperationSelection[],
): OpenAPIV3.Document {
  const selectedByPath = new Map<string, Set<string>>();
  for (const selection of selections) {
    const methods = selectedByPath.get(selection.path) ?? new Set<string>();
    methods.add(selection.method.toLowerCase());
    selectedByPath.set(selection.path, methods);
  }

  const paths: OpenAPIV3.PathsObject = {};
  for (const [path, methods] of selectedByPath) {
    const sourceItem = document.paths[path] as OpenAPIV3.PathItemObject | undefined;
    if (!sourceItem) continue;

    const targetItem: OpenAPIV3.PathItemObject = {};
    if (sourceItem.parameters) targetItem.parameters = sourceItem.parameters;
    for (const method of methods) {
      const operation = sourceItem[method as OpenAPIV3.HttpMethods];
      if (operation) targetItem[method as OpenAPIV3.HttpMethods] = operation;
    }
    paths[path] = targetItem;
  }

  return {
    ...document,
    paths,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
