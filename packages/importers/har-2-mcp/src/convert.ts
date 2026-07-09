import { readFile } from "node:fs/promises";
import {
  envKeyFor,
  findCookieRedactions,
  findHeaderRedactions,
  findQueryRedactions,
  type RedactionFinding,
  type RedactionReport,
} from "./redact";
import {
  isRecord,
  type HarEntry,
  type HarLog,
  type HarQueryParam,
  type JsonSchema,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiSecurityScheme,
  type HarWarning,
} from "./types";

export type { RedactionFinding, RedactionReport } from "./redact";

/**
 * Hosts that only ever carry analytics/telemetry beacons, never API traffic worth
 * cataloguing as an MCP tool. HAR captures made from a browser session are full of
 * this noise; naively converting every entry would produce a spec full of garbage
 * "tools" that call third-party trackers.
 */
const NOISE_HOST_PATTERN =
  /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|segment\.io|sentry\.io|hotjar\.com|mixpanel\.com|facebook\.com)$/i;

/** Static asset paths captured alongside API calls in a browser HAR session. */
const STATIC_ASSET_EXTENSION_PATTERN = /\.(png|jpe?g|gif|svg|css|js|mjs|woff2?|ico|map|ttf|eot)$/i;

const NUMERIC_SEGMENT_PATTERN = /^\d+$/;
const UUID_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadHarArchiveOptions = {
  harPath: string;
};

export async function loadHarArchive(options: LoadHarArchiveOptions): Promise<unknown> {
  return JSON.parse(await readFile(options.harPath, "utf8"));
}

export type ConvertHarOptions = {
  har: unknown;
  title?: string;
};

export type HarOperationSummary = {
  method: string;
  path: string;
  toolName: string;
  sampleCount: number;
};

export type HarConversionResult = {
  /** Unreviewed draft — `openapi["x-quickdeploy-har-review"].status === "draft"`. Do not serve this directly. */
  openapi: OpenApiDocument;
  redactionReport: RedactionReport;
  operations: HarOperationSummary[];
  warnings: HarWarning[];
};

type EntryGroup = {
  method: string;
  template: string;
  pathParamNames: string[];
  entries: HarEntry[];
};

export function convertHarToOpenApi(options: ConvertHarOptions): HarConversionResult {
  const log = asHarLog(options.har);
  const title = options.title ?? "HAR Capture";
  const entries = log.log.entries.filter((entry) => !isNoiseEntry(entry));

  const groups = groupEntries(entries);
  const findings: RedactionFinding[] = [];
  const paths: OpenApiDocument["paths"] = {};
  const securitySchemes: Record<string, OpenApiSecurityScheme> = {};
  const operations: HarOperationSummary[] = [];
  const warnings: HarWarning[] = [];
  let serverUrl = "";

  for (const group of groups) {
    const firstUrl = group.entries[0]?.request.url ?? "";
    if (!serverUrl && firstUrl) serverUrl = new URL(firstUrl).origin;

    const groupFindings = group.entries.flatMap((entry) => redactionsFor(entry));
    findings.push(...groupFindings);
    const sensitiveQueryNames = new Set(
      groupFindings
        .filter((finding) => finding.location === "query")
        .map((finding) => finding.name),
    );

    const toolName = normalizeToolName(`${title}_${group.method}_${group.template}`);
    const { parameters, security } = buildParametersAndSecurity(
      group,
      groupFindings,
      securitySchemes,
    );
    const requestBody = inferRequestBody(group.entries);
    const responses = inferResponses(group.entries);

    if (usesSingleExample(group.entries)) {
      warnings.push({
        code: "single-example-schema",
        operation: toolName,
        message: `${toolName} schema was inferred from a single captured example; verify optional fields and types before publishing.`,
      });
    }

    const operation: OpenApiOperation = {
      operationId: toolName,
      summary: `${group.method} ${group.template} captured through har-2-mcp.`,
      responses,
      "x-quickdeploy-har": {
        method: group.method,
        path: group.template,
        sampleCount: group.entries.length,
        capturedUrls: group.entries.map((entry) =>
          redactUrl(entry.request.url, sensitiveQueryNames),
        ),
      },
    };
    if (parameters.length > 0) operation.parameters = parameters;
    if (requestBody) operation.requestBody = requestBody;
    if (security) operation.security = [security];

    paths[group.template] = {
      ...paths[group.template],
      [group.method.toLowerCase()]: operation,
    };
    operations.push({
      method: group.method,
      path: group.template,
      toolName,
      sampleCount: group.entries.length,
    });
  }

  const redactionReport: RedactionReport = {
    generatedAt: new Date().toISOString(),
    source: "har-capture",
    findings,
  };

  return {
    operations,
    warnings,
    redactionReport,
    openapi: {
      openapi: "3.1.0",
      info: { title, version: "0.1.0" },
      servers: serverUrl ? [{ url: serverUrl }] : [],
      paths,
      components: { securitySchemes },
      "x-quickdeploy-har-review": {
        status: "draft",
        redactionFindingCount: findings.length,
      },
    },
  };
}

export function harConversionToMcpManifestSelect(conversion: HarConversionResult): {
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

function isNoiseEntry(entry: HarEntry): boolean {
  if (entry.request.method.toUpperCase() === "OPTIONS") return true;
  const url = safeParseUrl(entry.request.url);
  if (!url) return true;
  if (NOISE_HOST_PATTERN.test(url.hostname)) return true;
  if (STATIC_ASSET_EXTENSION_PATTERN.test(url.pathname)) return true;
  return false;
}

/**
 * Masks flagged query param values inside a captured URL before it is stored anywhere in the
 * draft spec (e.g. `x-quickdeploy-har.capturedUrls`). Query strings are part of the URL string
 * itself, so leaving them untouched would leak a captured secret even though it never becomes an
 * OpenAPI `parameter`.
 */
function redactUrl(url: string, sensitiveQueryNames: ReadonlySet<string>): string {
  if (sensitiveQueryNames.size === 0) return url;
  const parsed = safeParseUrl(url);
  if (!parsed) return url;
  for (const name of sensitiveQueryNames) {
    if (parsed.searchParams.has(name)) parsed.searchParams.set(name, "[REDACTED]");
  }
  return parsed.toString();
}

function safeParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function groupEntries(entries: HarEntry[]): EntryGroup[] {
  const groups = new Map<string, EntryGroup>();
  for (const entry of entries) {
    const url = safeParseUrl(entry.request.url);
    if (!url) continue;
    const method = entry.request.method.toUpperCase();
    const { template, paramNames } = templatePath(url.pathname);
    const key = `${method} ${template}`;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(key, { method, template, pathParamNames: paramNames, entries: [entry] });
    }
  }
  return [...groups.values()];
}

function templatePath(pathname: string): { template: string; paramNames: string[] } {
  const segments = pathname.split("/");
  const paramNames: string[] = [];
  const templated = segments.map((segment, index) => {
    if (NUMERIC_SEGMENT_PATTERN.test(segment) || UUID_SEGMENT_PATTERN.test(segment)) {
      const prior = segments[index - 1] || "resource";
      const paramName = `${singularize(prior)}Id`;
      paramNames.push(paramName);
      return `{${paramName}}`;
    }
    return segment;
  });
  return { template: templated.join("/") || "/", paramNames };
}

function singularize(segment: string): string {
  const camel = segment.replace(/[^A-Za-z0-9]+(.)/g, (_match, char: string) => char.toUpperCase());
  return camel.endsWith("s") && !camel.endsWith("ss") ? camel.slice(0, -1) : camel;
}

function redactionsFor(entry: HarEntry): RedactionFinding[] {
  const method = entry.request.method.toUpperCase();
  const url = entry.request.url;
  return [
    ...findHeaderRedactions(method, url, entry.request.headers ?? []),
    ...findQueryRedactions(method, url, entry.request.queryString ?? []),
    ...findCookieRedactions(method, url, entry.request.cookies ?? []),
  ];
}

function buildParametersAndSecurity(
  group: EntryGroup,
  findings: RedactionFinding[],
  securitySchemes: Record<string, OpenApiSecurityScheme>,
): { parameters: OpenApiParameter[]; security: Record<string, string[]> | undefined } {
  const parameters: OpenApiParameter[] = group.pathParamNames.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));

  const sensitiveQueryNames = new Set(
    findings.filter((finding) => finding.location === "query").map((finding) => finding.name),
  );
  const queryParams = new Map<string, HarQueryParam>();
  for (const entry of group.entries) {
    for (const param of entry.request.queryString ?? []) {
      if (sensitiveQueryNames.has(param.name)) continue;
      if (!queryParams.has(param.name)) queryParams.set(param.name, param);
    }
  }
  for (const param of queryParams.values()) {
    parameters.push({
      name: param.name,
      in: "query",
      required: false,
      schema: { type: "string" },
    });
  }

  let security: Record<string, string[]> | undefined;
  for (const finding of findings) {
    const envKey = envKeyFor(finding.location, finding.name);
    securitySchemes[envKey] = securitySchemeFor(finding.location, finding.name);
    security = { ...security, [envKey]: [] };
  }

  return { parameters, security };
}

function securitySchemeFor(
  location: RedactionFinding["location"],
  name: string,
): OpenApiSecurityScheme {
  if (location === "header" && name.toLowerCase() === "authorization") {
    return { type: "http", scheme: "bearer" };
  }
  return { type: "apiKey", in: location, name };
}

function inferRequestBody(entries: HarEntry[]): OpenApiOperation["requestBody"] | undefined {
  const withBody = entries.find(
    (entry) => entry.request.postData?.mimeType?.includes("json") && entry.request.postData.text,
  );
  if (!withBody?.request.postData?.text) return undefined;
  return {
    required: true,
    content: {
      "application/json": {
        schema: inferJsonSchema(JSON.parse(withBody.request.postData.text)),
      },
    },
  };
}

function inferResponses(entries: HarEntry[]): OpenApiOperation["responses"] {
  const withBody = entries.find(
    (entry) => entry.response?.content?.mimeType?.includes("json") && entry.response.content.text,
  );
  const status = String(withBody?.response?.status ?? entries[0]?.response?.status ?? 200);
  if (!withBody?.response?.content?.text) {
    return { [status]: { description: "Captured response." } };
  }
  return {
    [status]: {
      description: "Captured response.",
      content: {
        "application/json": {
          schema: inferJsonSchema(JSON.parse(withBody.response.content.text)),
        },
      },
    },
  };
}

function usesSingleExample(entries: HarEntry[]): boolean {
  const withRequestBody = entries.filter((entry) => Boolean(entry.request.postData?.text)).length;
  const withResponseBody = entries.filter((entry) => Boolean(entry.response?.content?.text)).length;
  return withRequestBody === 1 || withResponseBody === 1;
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

function asHarLog(value: unknown): HarLog {
  if (!isRecord(value) || !isRecord(value.log) || !Array.isArray(value.log.entries)) {
    throw new Error("HAR archive must be a JSON object with a log.entries array.");
  }
  return value as HarLog;
}
