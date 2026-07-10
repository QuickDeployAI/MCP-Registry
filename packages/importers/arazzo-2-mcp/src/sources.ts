import { fetchTextSource, type FetchSourceOptions } from "@quickdeployai/importer-core";
import type { OpenAPIV3 } from "openapi-types";
import {
  ArazzoImportError,
  parseArazzoDocument,
  type ArazzoDocument,
  type ArazzoSourceDescription,
} from "./index.js";

export class SourceResolutionError extends ArazzoImportError {}

export type ResolvedOpenApiSource = {
  type: "openapi";
  name: string;
  document: OpenAPIV3.Document;
};

export type ResolvedArazzoSource = {
  type: "arazzo";
  name: string;
  document: ArazzoDocument;
  sources: SourceResolutionMap;
};

export type ResolvedSource = ResolvedOpenApiSource | ResolvedArazzoSource;

export type SourceResolutionMap = ReadonlyMap<string, ResolvedSource>;

export type ResolveArazzoSourcesOptions = FetchSourceOptions & {
  /**
   * The URL/path the given `document` was itself loaded from, if any. Relative
   * `sourceDescription.url` values are resolved against it (falling back to `cwd`/process cwd
   * when absent, per `fetchTextSource`).
   */
  readonly baseUrl?: string | URL;
  /** Guards against cyclical nested Arazzo sourceDescriptions. Internal use. */
  readonly seenUrls?: ReadonlySet<string>;
};

export type ResolvedOperation = {
  sourceName: string;
  method: string;
  path: string;
  /** JSON Pointer to the Operation Object, e.g. "/paths/~1pets~1{petId}/get". */
  operationPath: string;
  operationId?: string;
  operation: OpenAPIV3.OperationObject;
};

/**
 * Fetches and parses every `sourceDescription` of an Arazzo document. OpenAPI sources are parsed
 * as `OpenAPIV3.Document`s; `arazzo` sources are parsed recursively (their own sourceDescriptions
 * are resolved too), so `resolveOperation` can walk into nested workflows.
 */
export async function resolveArazzoSources(
  document: ArazzoDocument,
  options: ResolveArazzoSourcesOptions = {},
): Promise<SourceResolutionMap> {
  const resolved = new Map<string, ResolvedSource>();
  for (const source of document.sourceDescriptions) {
    resolved.set(source.name, await resolveSource(source, options));
  }
  return resolved;
}

async function resolveSource(
  source: ArazzoSourceDescription,
  options: ResolveArazzoSourcesOptions,
): Promise<ResolvedSource> {
  if (!source.url) {
    throw new SourceResolutionError(
      `Arazzo sourceDescription "${source.name}" has no url to resolve.`,
    );
  }

  const resolvedUrl = resolveRelativeUrl(source.url, options.baseUrl);

  const seenUrls = options.seenUrls ?? new Set<string>();
  if (seenUrls.has(resolvedUrl)) {
    throw new SourceResolutionError(
      `Cyclical Arazzo sourceDescription detected while resolving "${source.name}" (${resolvedUrl}).`,
    );
  }

  const text = await fetchSourceText(source, resolvedUrl, options);
  const raw = parseJsonSource(text, source);

  if (isArazzoSourceType(source)) {
    const nested = parseArazzoDocument(raw);
    const sources = await resolveArazzoSources(nested, {
      ...options,
      baseUrl: resolvedUrl,
      seenUrls: new Set([...seenUrls, resolvedUrl]),
    });
    return { type: "arazzo", name: source.name, document: nested, sources };
  }

  return { type: "openapi", name: source.name, document: raw as OpenAPIV3.Document };
}

function resolveRelativeUrl(url: string, baseUrl?: string | URL): string {
  if (/^(https?|file):\/\//.test(url)) return url;
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

async function fetchSourceText(
  source: ArazzoSourceDescription,
  resolvedUrl: string,
  options: ResolveArazzoSourcesOptions,
): Promise<string> {
  try {
    return await fetchTextSource(resolvedUrl, options);
  } catch (error) {
    throw new SourceResolutionError(
      `Failed to fetch Arazzo sourceDescription "${source.name}" from ${resolvedUrl}.`,
      { cause: error },
    );
  }
}

function parseJsonSource(text: string, source: ArazzoSourceDescription): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SourceResolutionError(
      `Arazzo sourceDescription "${source.name}" (${source.url}) is not valid JSON.`,
      { cause: error },
    );
  }
}

function isArazzoSourceType(source: ArazzoSourceDescription): boolean {
  return source.type === "arazzo" || (source.url ?? "").endsWith(".arazzo.json");
}

/**
 * Resolves a step's `operationId` or `operationPath` against its named source description.
 * `operationId` is matched by scanning every operation in the OpenAPI document; `operationPath`
 * is matched as an exact JSON Pointer (per the Arazzo spec, of the form `/paths/{path}/{method}`
 * with `~`/`/` escaped per RFC 6901).
 */
export function resolveOperation(
  sources: SourceResolutionMap,
  sourceName: string,
  lookup: { operationId?: string; operationPath?: string },
): ResolvedOperation {
  const source = sources.get(sourceName);
  if (!source) {
    throw new SourceResolutionError(
      `Unknown Arazzo source description "${sourceName}". Known sources: ${[...sources.keys()].join(", ") || "(none)"}.`,
    );
  }
  if (source.type !== "openapi") {
    throw new SourceResolutionError(
      `Arazzo source description "${sourceName}" is not an OpenAPI document; operations cannot be resolved from it directly.`,
    );
  }

  const index = indexOpenApiOperations(source.document);

  if (lookup.operationId) {
    const operation = index.byOperationId.get(lookup.operationId);
    if (!operation) {
      throw new SourceResolutionError(
        `Operation id "${lookup.operationId}" was not found in source "${sourceName}".`,
      );
    }
    return { sourceName, ...operation };
  }

  if (lookup.operationPath) {
    const operation = index.byOperationPath.get(lookup.operationPath);
    if (!operation) {
      throw new SourceResolutionError(
        `Operation path "${lookup.operationPath}" was not found in source "${sourceName}".`,
      );
    }
    return { sourceName, ...operation };
  }

  throw new SourceResolutionError(
    `Step targeting source "${sourceName}" has neither operationId nor operationPath.`,
  );
}

type IndexedOperation = Omit<ResolvedOperation, "sourceName">;

export type OpenApiOperationIndex = {
  byOperationId: ReadonlyMap<string, IndexedOperation>;
  byOperationPath: ReadonlyMap<string, IndexedOperation>;
};

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

/** Indexes every operation in an OpenAPI document by `operationId` and by JSON-Pointer path. */
export function indexOpenApiOperations(document: OpenAPIV3.Document): OpenApiOperationIndex {
  const byOperationId = new Map<string, IndexedOperation>();
  const byOperationPath = new Map<string, IndexedOperation>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      const operationPath = `/paths/${escapeJsonPointerSegment(path)}/${method}`;
      const entry: IndexedOperation = { method, path, operationPath, operation };
      if (operation.operationId) {
        entry.operationId = operation.operationId;
        byOperationId.set(operation.operationId, entry);
      }
      byOperationPath.set(operationPath, entry);
    }
  }

  return { byOperationId, byOperationPath };
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
