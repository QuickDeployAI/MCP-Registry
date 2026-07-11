import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ArtifactParseResult,
  ArtifactParser,
  ParserDiagnostic,
} from "@quickdeployai/importer-core/parser";
import { openApiArtifactParser } from "@quickdeployai/openapi-2-mcp";
import {
  acpAgentManifestArtifactParser,
  createAcpAgentManifestArtifactParser,
} from "@quickdeployai/acp-agent-manifest-2-mcp";
import {
  buildOpenRpcTools,
  openRpcArtifactParser,
  openRpcToParsedCapabilities,
  parseOpenRpcDocument,
} from "@quickdeployai/openrpc-2-mcp";
import {
  ArdEntrySchema,
  normalizeArtifactMediaType,
  sourceMediaTypeToImporterEngine,
  type ArdEntry,
} from "@quickdeployai/registry-schemas/ard";
import {
  McpProjectionConfigSchema,
  type McpProjectionConfig,
} from "@quickdeployai/registry-schemas/mcp-projection";
import { resolveHostConfig, type HostConfig } from "./config";
import { grpcArtifactParser, wsdlArtifactParser } from "./builtin-parsers";
import { z } from "zod";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

export type HostTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  call: (params: unknown) => unknown;
};

export type HostToolSource = HostTool[] | (() => Promise<HostTool[]>);
export type HostResource = { uri: string; name: string; description?: string };
export type HostPrompt = { name: string; description?: string };
export type HostSurface = {
  tools: HostToolSource;
  resources: HostResource[];
  prompts: HostPrompt[];
};

export type HostReadyState = {
  ok: boolean;
  server: string;
  version: string;
  parser: { name: string; mediaType: string };
  transport: McpProjectionConfig["deployment"]["transport"];
};

export type McpHost = {
  entry: ArdEntry;
  projection: McpProjectionConfig;
  config: HostConfig;
  diagnostics: ParserDiagnostic[];
  ready: HostReadyState;
  handleJsonRpc: (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>;
};

type ArdArtifactParser = ArtifactParser<ArdEntry, string>;

export const defaultArtifactParsers: ArdArtifactParser[] = [
  acpAgentManifestArtifactParser,
  openApiArtifactParser,
  openRpcArtifactParser,
  grpcArtifactParser,
  wsdlArtifactParser,
];

export type CreateMcpHostOptions = {
  entry: ArdEntry;
  projection: McpProjectionConfig;
  nativeArtifact?: unknown;
  userConfig?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  parsers?: readonly ArdArtifactParser[];
  fetch?: typeof fetch;
};

export type ArdSurfaceResult = ArtifactParseResult & { surface: HostSurface };

export type CreateArdSurfaceOptions = {
  entry: ArdEntry;
  projection?: McpProjectionConfig;
  nativeArtifact?: unknown;
  parsers?: readonly ArdArtifactParser[];
  fetch?: typeof fetch;
};

export function createParserRegistry(
  parsers: readonly ArdArtifactParser[] = defaultArtifactParsers,
): Map<string, ArdArtifactParser> {
  return new Map(
    parsers.flatMap((parser) =>
      parser.mediaTypes.map((mediaType) => [normalizeArtifactMediaType(mediaType), parser] as const),
    ),
  );
}

export function resolveParserByMediaType(
  mediaType: string,
  parsers: readonly ArdArtifactParser[] = defaultArtifactParsers,
): ArdArtifactParser | undefined {
  const normalized = normalizeArtifactMediaType(mediaType);
  if (!sourceMediaTypeToImporterEngine(normalized)) return undefined;
  return createParserRegistry(parsers).get(normalized);
}

export async function createArdSurface(options: CreateArdSurfaceOptions): Promise<ArdSurfaceResult> {
  const entry = ArdEntrySchema.parse(options.entry);
  const parser = resolveParserByMediaType(entry.type, options.parsers);
  if (!parser) {
    return {
      capabilities: [],
      diagnostics: [unmappedMediaTypeDiagnostic(entry.type)],
      surface: emptyHostSurface(),
    };
  }

  const nativeArtifact =
    options.nativeArtifact ?? (await loadArdNativeArtifact(entry, options.fetch));
  const result = await parser.parse(nativeArtifact, entry);
  return {
    ...result,
    surface: projectionToHostSurface(result, options.projection),
  };
}

export async function createMcpHost(options: CreateMcpHostOptions): Promise<McpHost> {
  const entry = ArdEntrySchema.parse(options.entry);
  const projection = McpProjectionConfigSchema.parse(options.projection);
  if (projection.entryRef !== entry.identifier) {
    throw new Error(`Projection references ${projection.entryRef}, not ${entry.identifier}.`);
  }

  const config = resolveHostConfig(projection, options.userConfig ?? {}, options.env);
  const parsers = options.parsers ?? configuredHostParsers(projection, config, options.env, options.fetch);
  const parsed = await createArdSurface({
    entry,
    projection,
    nativeArtifact: options.nativeArtifact,
    parsers,
    fetch: options.fetch,
  });
  const parserName = sourceMediaTypeToImporterEngine(entry.type) ?? "unmapped";
  const surface = parsed.surface;

  return {
    entry,
    projection,
    config,
    diagnostics: parsed.diagnostics,
    ready: {
      ok: true,
      server: entry.displayName,
      version: entry.version ?? "0.0.0",
      parser: { name: parserName, mediaType: normalizeArtifactMediaType(entry.type) },
      transport: projection.deployment.transport,
    },
    handleJsonRpc: async (request) => dispatchJsonRpc(entry, surface, request),
  };
}

function unmappedMediaTypeDiagnostic(mediaType: string): ParserDiagnostic {
  return {
    level: "warn",
    message: `No ArtifactParser is installed for media type ${normalizeArtifactMediaType(mediaType)}; entry skipped.`,
  };
}

function emptyHostSurface(): HostSurface {
  return { tools: [], resources: [], prompts: [] };
}

async function loadArdNativeArtifact(entry: ArdEntry, fetchImpl = globalThis.fetch): Promise<unknown> {
  if (entry.data !== undefined) return entry.data;
  if (!entry.url) throw new Error(`ARD entry ${entry.identifier} has no url or inline data.`);

  const url = resolveEntryUrl(entry.url);
  if (url.protocol === "file:") {
    const bytes = await readFile(url);
    return isBinaryMediaType(entry.type) ? bytes : parseNativeArtifactText(bytes.toString("utf8"), entry.type);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported ARD source protocol ${url.protocol}`);
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ARD source ${url.href}: ${response.status} ${response.statusText}`);
  }
  return isBinaryMediaType(entry.type)
    ? new Uint8Array(await response.arrayBuffer())
    : parseNativeArtifactText(await response.text(), entry.type);
}

function resolveEntryUrl(value: string): URL {
  if (!value.startsWith("file://") || /^file:\/\/(localhost\/|\/)/.test(value)) return new URL(value);
  return new URL(`../../../../${value.slice("file://".length)}`, import.meta.url);
}

function isBinaryMediaType(mediaType: string): boolean {
  const normalized = normalizeArtifactMediaType(mediaType);
  return normalized === "application/protobuf" || normalized === "application/octet-stream";
}

function parseNativeArtifactText(text: string, mediaType: string): unknown {
  const normalized = normalizeArtifactMediaType(mediaType);
  if (normalized.endsWith("+json") || normalized === "application/json") return JSON.parse(text);
  return text;
}

type ProjectedTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  parameters?: z.ZodType;
  execute?: (args: unknown) => unknown;
  invoke?: (args: unknown) => unknown;
  call?: (args: unknown) => unknown;
};

function projectionToHostSurface(
  result: ArtifactParseResult,
  projection?: McpProjectionConfig,
): HostSurface {
  const parsedProjection = result.mcpProjection;
  if (!parsedProjection) return emptyHostSurface();

  const capabilities = result.capabilities.filter((item) => item.kind === "tool");
  const selectors = new Map(
    capabilities.map((capability) => [capability.name, capabilitySelector(capability.raw, capability.name)]),
  );
  const selected = projection ? selectedToolSelectors(projection) : undefined;
  const exposure = new Map(projection?.expose.tools.map((item) => [item.from, item]) ?? []);

  const tools = (parsedProjection.tools ?? []).flatMap((candidate) => {
    const tool = asProjectedTool(candidate);
    if (!tool) return [];
    const selector = selectors.get(tool.name) ?? tool.name;
    if (selected && selected.size > 0 && !selected.has(selector) && !selected.has(tool.name)) {
      return [];
    }
    const exposed = exposure.get(selector) ?? exposure.get(tool.name);
    if (exposed?.deny) return [];
    const call = tool.execute ?? tool.invoke ?? tool.call;
    if (!call) return [];
    return [{
      name: exposed?.name ?? tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      inputSchema: tool.inputSchema ?? projectedInputSchema(tool.parameters),
      call,
    }];
  });

  return {
    tools,
    resources: projectNamedSurface(parsedProjection.resources, projection?.expose.resources),
    prompts: projectNamedSurface(parsedProjection.prompts, projection?.expose.prompts),
  };
}

function selectedToolSelectors(projection: McpProjectionConfig): Set<string> {
  const select = projection.select;
  if (!select) return new Set();
  return new Set([
    ...select.requests.map((item) => `${item.method.toUpperCase()} ${item.uriTemplate}`),
    ...select.grpcMethods.map((item) => `${item.service}/${item.method}`),
    ...select.methods,
    ...select.pythonFunctions,
    ...select.skills.map((item) => item.name),
    ...select.workflows,
  ]);
}

function capabilitySelector(raw: unknown, fallback: string): string {
  const record = readRecord(raw);
  if (!record) return fallback;
  if (typeof record.method === "string" && typeof record.path === "string") {
    return `${record.method.toUpperCase()} ${record.path}`;
  }
  if (typeof record.fullName === "string") return record.fullName;
  if (typeof record.name === "string" && typeof record.paramStructure === "string") {
    return record.name;
  }
  return fallback;
}

function configuredHostParsers(
  projection: McpProjectionConfig,
  config: HostConfig,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl = globalThis.fetch,
): ArdArtifactParser[] {
  return defaultArtifactParsers.map((parser) =>
    parser === acpAgentManifestArtifactParser
      ? createAcpAgentManifestArtifactParser({
          ...(config.values.transport === "http" ||
            config.values.transport === "slim" ||
            config.values.transport === "acp"
            ? { transport: config.values.transport }
            : {}),
          ...(Array.isArray(config.values.skillAllowlist)
            ? {
                skillAllowlist: config.values.skillAllowlist.filter(
                  (value): value is string => typeof value === "string",
                ),
              }
            : {}),
        })
      : parser === openRpcArtifactParser
      ? createConfiguredOpenRpcParser(projection, config.values, env, fetchImpl)
      : parser,
  );
}

function createConfiguredOpenRpcParser(
  projection: McpProjectionConfig,
  values: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): ArdArtifactParser {
  return {
    mediaTypes: openRpcArtifactParser.mediaTypes,
    async parse(nativeArtifact) {
      const model = parseOpenRpcDocument(nativeArtifact as Parameters<typeof parseOpenRpcDocument>[0]);
      const endpoint = configuredString(values.endpoint) ?? model.servers[0]?.url;
      if (!endpoint) {
        return {
          capabilities: openRpcToParsedCapabilities(model),
          diagnostics: [{
            level: "warn",
            message: "OpenRPC document has no runtime endpoint in projection config or servers[].",
          }],
        };
      }
      const transport = values.transport === "ws" || /^wss?:/i.test(endpoint) ? "ws" : "http";
      return {
        capabilities: openRpcToParsedCapabilities(model),
        mcpProjection: {
          tools: buildOpenRpcTools(model, {
            endpoint,
            transport,
            fetch: fetchImpl,
            env,
            auth: projectionAuthToOpenRpcAuth(projection.auth),
            ...(configuredHeaders(values.headers) ? { headers: configuredHeaders(values.headers) } : {}),
            ...(typeof values.requestTimeoutMs === "number"
              ? { timeoutMs: values.requestTimeoutMs }
              : {}),
          }),
        },
        diagnostics: [],
      };
    },
  };
}

function projectionAuthToOpenRpcAuth(
  auth: McpProjectionConfig["auth"],
): import("@quickdeployai/importer-core").CredentialAuthConfig[] {
  const result: import("@quickdeployai/importer-core").CredentialAuthConfig[] = [];
  for (const item of auth) {
    switch (item.type) {
      case "bearer":
        result.push({ type: "bearer", token: item.valueFrom });
        break;
      case "api-key":
        result.push({ type: "apiKey", in: item.in, name: item.name, value: item.valueFrom });
        break;
      case "basic":
        result.push({
          type: "basic",
          username: item.usernameFrom,
          password: item.passwordFrom,
        });
        break;
      case "oauth2":
        if (!item.valueFrom) {
          throw new Error(
            "OpenRPC runtime auth requires oauth2.valueFrom; token exchange is not supported by this client.",
          );
        }
        result.push({ type: "oauth2ClientCredentials", accessToken: item.valueFrom });
        break;
    }
  }
  return result;
}

function configuredString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function configuredHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function projectNamedSurface<T extends { name?: unknown; description?: unknown; uri?: unknown }>(
  values: readonly unknown[] | undefined,
  expose: readonly { from: string; name?: string; deny?: boolean }[] | undefined,
): T[] {
  const exposure = new Map(expose?.map((item) => [item.from, item]) ?? []);
  return (values ?? []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as T;
    if (typeof item.name !== "string") return [];
    const projected = exposure.get(item.name);
    if (projected?.deny) return [];
    return [{ ...item, name: projected?.name ?? item.name }];
  });
}

function asProjectedTool(value: unknown): ProjectedTool | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ProjectedTool>;
  return typeof candidate.name === "string" ? (candidate as ProjectedTool) : undefined;
}

function projectedInputSchema(parameters: z.ZodType | undefined): Record<string, unknown> {
  if (!parameters) return { type: "object", additionalProperties: true };
  return z.toJSONSchema(parameters) as Record<string, unknown>;
}

export type HttpHost = { server: Server; url: string; close: () => Promise<void> };

export async function startHttpHost(
  host: McpHost,
  options: { port?: number; hostname?: string } = {},
): Promise<HttpHost> {
  const server = createServer((req, res) => void handleHttpRequest(host, req, res));
  const hostname = options.hostname ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, hostname, resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://${address.address}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function handleHttpRequest(host: McpHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });
  if (req.method === "GET" && req.url === "/readyz") return sendJson(res, 200, host.ready);
  if (req.method !== "POST" || (req.url !== "/" && req.url !== "/mcp")) {
    return sendJson(res, 404, { error: "not_found" });
  }
  const authFailure = authorizeHttpRequest(host, req);
  if (authFailure) {
    return sendJson(res, authFailure.status, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: authFailure.message },
    }, authFailure.headers);
  }
  try {
    const response = await host.handleJsonRpc(JSON.parse(await readBody(req)) as JsonRpcRequest);
    if (response === null) return void res.writeHead(202).end();
    sendJson(res, "error" in response ? 400 : 200, response);
  } catch (error) {
    sendJson(res, 400, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: error instanceof Error ? error.message : "Invalid JSON-RPC request." },
    });
  }
}

type HttpAuthFailure = { status: 401 | 403; message: string; headers?: Record<string, string> };

function authorizeHttpRequest(host: McpHost, req: IncomingMessage): HttpAuthFailure | null {
  const deployment = host.projection.deployment;
  const auth = deployment.auth;
  if (deployment.transport === "stdio" || auth?.type === "none") return null;
  if (!auth) return bearerChallenge("MCP host requires deployment.auth for streamable HTTP and SSE transports.");
  switch (auth.type) {
    case "gateway": {
      const actual = readHeader(req, auth.authenticatedHeader.name);
      const expected = auth.authenticatedHeader.value;
      return expected ? actual === expected ? null : { status: 403, message: "Request was not authenticated by the configured gateway." }
        : actual ? null : { status: 403, message: "Request was not authenticated by the configured gateway." };
    }
    case "bearer": {
      const token = readBearerToken(req);
      if (!auth.tokenFrom) return token ? null : bearerChallenge("Missing bearer token.");
      const expected = host.config.secrets[auth.tokenFrom.env];
      return token && expected && constantTimeEqual(token, expected) ? null : bearerChallenge("Missing or invalid bearer token.");
    }
    case "oauth2-resource": {
      const token = readBearerToken(req);
      if (!token) return bearerChallenge("Missing OAuth access token.", auth.resourceMetadataUrl);
      if (!auth.tokenFrom) return null;
      const expected = host.config.secrets[auth.tokenFrom.env];
      return expected && constantTimeEqual(token, expected) ? null : bearerChallenge("Invalid OAuth access token.", auth.resourceMetadataUrl);
    }
  }
}

function bearerChallenge(message: string, resourceMetadataUrl?: string): HttpAuthFailure {
  const parameters = [
    `error="invalid_token"`,
    `error_description="${escapeHeaderValue(message)}"`,
    resourceMetadataUrl ? `resource_metadata="${escapeHeaderValue(resourceMetadataUrl)}"` : null,
  ].filter((item): item is string => item !== null);
  return { status: 401, message, headers: { "WWW-Authenticate": `Bearer ${parameters.join(", ")}` } };
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function readBearerToken(req: IncomingMessage): string | null {
  return /^Bearer\s+(.+)$/i.exec(readHeader(req, "authorization") ?? "")?.[1] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function dispatchJsonRpc(
  entry: ArdEntry,
  surface: HostSurface,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(request.id ?? null, -32600, "Invalid JSON-RPC request.");
  }
  if (request.id === undefined) return null;
  switch (request.method) {
    case "initialize": {
      const tools = await listTools(surface);
      return rpcResult(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: tools.length > 0 ? {} : undefined,
          resources: surface.resources.length > 0 ? {} : undefined,
          prompts: surface.prompts.length > 0 ? {} : undefined,
        },
        serverInfo: { name: entry.displayName, version: entry.version ?? "0.0.0" },
      });
    }
    case "ping": return rpcResult(request.id, {});
    case "tools/list": {
      const tools = await listTools(surface);
      return rpcResult(request.id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    }
    case "tools/call": return callTool(request.id, surface, request.params);
    case "resources/list": return rpcResult(request.id, { resources: surface.resources });
    case "prompts/list": return rpcResult(request.id, { prompts: surface.prompts });
    default: return rpcError(request.id, -32601, `Unsupported MCP method ${request.method}.`);
  }
}

async function callTool(id: string | number | null, surface: HostSurface, params: unknown): Promise<JsonRpcResponse> {
  const toolName = readRecord(params)?.name;
  if (typeof toolName !== "string") return rpcError(id, -32602, "tools/call requires params.name.");
  const tool = (await listTools(surface)).find((candidate) => candidate.name === toolName);
  if (!tool) return rpcError(id, -32602, `Unknown tool ${toolName}.`);
  const result = await tool.call(readRecord(params)?.arguments ?? {});
  return rpcResult(id, { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] });
}

async function listTools(surface: HostSurface): Promise<HostTool[]> {
  return typeof surface.tools === "function" ? await surface.tools() : surface.tools;
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(value));
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
