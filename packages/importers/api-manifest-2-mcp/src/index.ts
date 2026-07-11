import { readFile } from "node:fs/promises";
import type { OpenAPIV3 } from "openapi-types";
import type { ArtifactParser, ParsedCapability } from "@quickdeployai/importer-core/parser";
import {
  deriveCapabilityKinds,
  API_MANIFEST_MEDIA_TYPE,
  type ArdCapabilityKind,
  type ArdEntry,
} from "@quickdeployai/registry-schemas/ard";
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

import { buildApiManifestTools, type BuildApiManifestToolsOptions } from "./tools.js";

export type ApiManifestInlineInput = ApiManifest | Record<string, unknown> | string | Uint8Array;
export type ApiManifestInput = ApiManifestInlineInput | URL;

export { buildApiManifestTools };
export type { ApiManifestProxyTool, BuildApiManifestToolsOptions } from "./tools.js";
export { API_MANIFEST_MEDIA_TYPE };

export type LoadApiManifestOptions = {
  fetch?: typeof fetch;
};

export type ResolveApiManifestDependenciesOptions = LoadApiManifestOptions & {
  openApiDocuments?: Record<string, unknown>;
  /** Resolve only this dependency; all dependencies are resolved when omitted. */
  dependencyKey?: string;
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

export function apiManifestToParsedCapabilities(
  manifest: ApiManifest,
  dependencyKey?: string,
): ParsedCapability<ArdCapabilityKind>[] {
  return selectDependencyEntries(manifest, dependencyKey).flatMap(([dependencyKey, dependency]) =>
    dependency.requests.map((request) => ({
      kind: "tool" as const,
      name: `${dependencyKey}.${request.method.toUpperCase()}_${request.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_")}`,
      description: `${request.method.toUpperCase()} ${request.uriTemplate} via ${dependencyKey}.`,
      raw: { dependencyKey, ...request },
    })),
  );
}

/**
 * Builds an executable MCP tool surface from a parsed API Manifest. Any failure (a missing
 * `apiDeploymentBaseUrl`/override, a missing auth environment variable, …) degrades to a
 * diagnostic rather than throwing, matching the dispatch layer's leniency contract — one
 * misconfigured dependency should not take down the whole host.
 */
export function createApiManifestArtifactParser(
  runtime?: BuildApiManifestToolsOptions,
): ArtifactParser<ArdEntry, ArdCapabilityKind> {
  return {
    mediaTypes: [API_MANIFEST_MEDIA_TYPE],
    async parse(nativeArtifact, entry) {
      const manifest = parseApiManifest(nativeArtifact as ApiManifestInlineInput);
      const derived = deriveCapabilityKinds(entry);
      const capabilities: ParsedCapability<ArdCapabilityKind>[] = [];

      if (derived.kinds.includes("api-contract")) {
        capabilities.push({
          kind: "api-contract",
          name: entry.displayName,
          description: entry.description ?? manifest.applicationName,
          raw: manifest,
        });
      }
      if (derived.kinds.includes("tool")) {
        capabilities.push(...apiManifestToParsedCapabilities(manifest, runtime?.dependencyKey));
      }

      const diagnostics = derived.unrecognizedHints.map((hint) => ({
        level: "warn" as const,
        message: `Ignoring unrecognized publisher capabilityKinds hint "${hint}" for ${entry.identifier}.`,
      }));

      if (!runtime) {
        return {
          capabilities,
          diagnostics: [
            ...diagnostics,
            {
              level: "info",
              message: "API Manifest parsed without runtime options; MCP projection omitted.",
            },
          ],
        };
      }

      try {
        const tools = await buildApiManifestTools(manifest, runtime);
        return { capabilities, mcpProjection: { tools }, diagnostics };
      } catch (error) {
        return {
          capabilities,
          diagnostics: [
            ...diagnostics,
            {
              level: "warn",
              message: `Could not build an API Manifest tool surface: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    },
  };
}

export const apiManifestArtifactParser = createApiManifestArtifactParser();

export async function resolveApiManifestDependencies(
  input: ApiManifestInput,
  options: ResolveApiManifestDependenciesOptions = {},
): Promise<ResolvedApiManifestDependency[]> {
  const manifest = await loadApiManifest(input, options);
  const entries = selectDependencyEntries(manifest, options.dependencyKey);

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

function selectDependencyEntries(
  manifest: ApiManifest,
  dependencyKey: string | undefined,
): Array<[string, ApiManifestDependency]> {
  const entries = Object.entries(manifest.apiDependencies);
  if (!dependencyKey) return entries;

  const match = entries.find(([key]) => key === dependencyKey);
  if (!match) {
    throw new ApiManifestLoadError(
      `API Manifest has no dependency "${dependencyKey}". Known dependencies: ${entries
        .map(([key]) => key)
        .join(", ")}.`,
    );
  }
  return [match];
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
