import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { buildArazzoTools, loadArazzoDocument } from "@quickdeployai/arazzo-2-mcp";
import { resolveArazzoSources } from "@quickdeployai/arazzo-2-mcp/sources";
import {
  type McpManifest,
  validateMcpManifestImporterConfig,
} from "@quickdeployai/registry-schemas/mcp-manifest";
import {
  buildGit2McpManifest,
  callGit2McpTool,
  fixturePackageRoot,
  type Git2McpManifest,
  type PythonFunctionTool,
  type SandboxRunner,
} from "@quickdeployai/git-2-mcp";
import { EngineResolutionError } from "./errors";
import { resolveHostConfig, type HostConfig } from "./config";
import { assertVersionSatisfies } from "./version";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      result: unknown;
    }
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

export type HostResource = {
  uri: string;
  name: string;
  description?: string;
};

export type HostPrompt = {
  name: string;
  description?: string;
};

export type HostSurface = {
  tools: HostToolSource;
  resources: HostResource[];
  prompts: HostPrompt[];
};

export type HostEngine = {
  name: string;
  version: string;
  createSurface: (manifest: McpManifest, config: HostConfig, runtime: HostRuntime) => HostSurface;
};

export type ResolvedEngine = HostEngine;

export type HostRuntime = {
  readonly gitSandboxRunner?: SandboxRunner;
};

export type HostReadyState = {
  ok: boolean;
  server: string;
  manifest: string;
  engine: {
    name: string;
    version: string;
  };
  transport: McpManifest["deployment"]["transport"];
};

export type McpHost = {
  manifest: McpManifest;
  engine: ResolvedEngine;
  config: HostConfig;
  ready: HostReadyState;
  handleJsonRpc: (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>;
};

export type CreateMcpHostOptions = {
  manifest: McpManifest;
  userConfig?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  engines?: HostEngine[];
  gitSandboxRunner?: SandboxRunner;
};

export const defaultEngines: HostEngine[] = [
  {
    name: "openapi-2-mcp",
    version: "0.1.0",
    createSurface: createOpenApiSurface,
  },
  {
    name: "wsdl-2-mcp",
    version: "0.1.0",
    createSurface: createRequestProxySurface,
  },
  {
    name: "postman-2-mcp",
    version: "0.1.0",
    createSurface: createRequestProxySurface,
  },
  {
    name: "har-2-mcp",
    version: "0.1.0",
    createSurface: createRequestProxySurface,
  },
  {
    name: "grpc-2-mcp",
    version: "0.1.0",
    createSurface: createGrpcSurface,
  },
  {
    name: "knowledge-2-mcp",
    version: "0.1.0",
    createSurface: createCorpusSurface,
  },
  {
    name: "agent-skills-2-mcp",
    version: "0.1.0",
    createSurface: createSkillsSurface,
  },
  {
    name: "git-2-mcp",
    version: "0.1.0",
    createSurface: createGit2McpSurface,
  },
  {
    name: "arazzo-2-mcp",
    version: "0.1.0",
    createSurface: createArazzoSurface,
  },
];

export function createMcpHost(options: CreateMcpHostOptions): McpHost {
  validateMcpManifestImporterConfig(options.manifest);
  const engines = options.engines ?? defaultEngines;
  const engine = resolveEngine(options.manifest, engines);
  const config = resolveHostConfig(options.manifest, options.userConfig ?? {}, options.env);
  const runtime: HostRuntime = { gitSandboxRunner: options.gitSandboxRunner };
  const surface = engine.createSurface(options.manifest, config, runtime);

  return {
    manifest: options.manifest,
    engine,
    config,
    ready: {
      ok: true,
      server: options.manifest.metadata.name,
      manifest: options.manifest.metadata.version,
      engine: { name: engine.name, version: engine.version },
      transport: options.manifest.deployment.transport,
    },
    handleJsonRpc: async (request) => dispatchJsonRpc(options.manifest, surface, request),
  };
}

export function resolveEngine(
  manifest: McpManifest,
  engines: HostEngine[] = defaultEngines,
): ResolvedEngine {
  const expected = manifest.spec.importer.engine;
  const engine = engines.find((candidate) => candidate.name === expected);
  if (!engine) {
    throw new EngineResolutionError(`Importer engine ${expected} is not installed.`);
  }
  assertVersionSatisfies(expected, engine.version, manifest.spec.importer.versionRange);
  return engine;
}

export type HttpHost = {
  server: Server;
  url: string;
  close: () => Promise<void>;
};

export async function startHttpHost(
  host: McpHost,
  options: { port?: number; hostname?: string } = {},
): Promise<HttpHost> {
  const server = createServer((req, res) => {
    void handleHttpRequest(host, req, res);
  });

  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  await new Promise<void>((resolve) => server.listen(port, hostname, resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://${address.address}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleHttpRequest(
  host: McpHost,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && req.url === "/readyz") {
    return sendJson(res, 200, host.ready);
  }
  if (req.method !== "POST" || (req.url !== "/" && req.url !== "/mcp")) {
    return sendJson(res, 404, { error: "not_found" });
  }

  const authFailure = authorizeHttpRequest(host, req);
  if (authFailure) {
    return sendJson(
      res,
      authFailure.status,
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message: authFailure.message,
        },
      },
      authFailure.headers,
    );
  }

  try {
    const body = JSON.parse(await readBody(req)) as JsonRpcRequest;
    const response = await host.handleJsonRpc(body);
    if (response === null) {
      res.writeHead(202).end();
      return;
    }
    sendJson(res, "error" in response ? 400 : 200, response);
  } catch (error) {
    sendJson(res, 400, {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : "Invalid JSON-RPC request.",
      },
    });
  }
}

type HttpAuthFailure = {
  status: 401 | 403;
  message: string;
  headers?: Record<string, string>;
};

function authorizeHttpRequest(host: McpHost, req: IncomingMessage): HttpAuthFailure | null {
  const auth = host.manifest.deployment.auth;
  if (host.manifest.deployment.transport === "stdio" || auth?.type === "none") return null;

  if (!auth) {
    return bearerChallenge(
      "MCP host requires deployment.auth for streamable HTTP and SSE transports.",
    );
  }

  switch (auth.type) {
    case "gateway": {
      const actual = readHeader(req, auth.authenticatedHeader.name);
      const expected = auth.authenticatedHeader.value;
      if (expected ? actual === expected : typeof actual === "string" && actual.length > 0) {
        return null;
      }
      return { status: 403, message: "Request was not authenticated by the configured gateway." };
    }
    case "bearer": {
      const token = readBearerToken(req);
      if (!auth.tokenFrom) {
        if (token) return null;
        return bearerChallenge("Missing bearer token.");
      }
      const expected = host.config.secrets[auth.tokenFrom.env];
      if (token && expected && constantTimeEqual(token, expected)) return null;
      return bearerChallenge("Missing or invalid bearer token.");
    }
    case "oauth2-resource": {
      const token = readBearerToken(req);
      if (!token) {
        return bearerChallenge("Missing OAuth access token.", auth.resourceMetadataUrl);
      }

      if (!auth.tokenFrom) return null;

      const expected = host.config.secrets[auth.tokenFrom.env];
      if (expected && constantTimeEqual(token, expected)) return null;
      return bearerChallenge("Invalid OAuth access token.", auth.resourceMetadataUrl);
    }
  }
}

function bearerChallenge(message: string, resourceMetadataUrl?: string): HttpAuthFailure {
  const parameters = [
    `error="invalid_token"`,
    `error_description="${escapeHeaderValue(message)}"`,
    resourceMetadataUrl ? `resource_metadata="${escapeHeaderValue(resourceMetadataUrl)}"` : null,
  ].filter((parameter): parameter is string => parameter !== null);
  return {
    status: 401,
    message,
    headers: {
      "WWW-Authenticate": `Bearer ${parameters.join(", ")}`,
    },
  };
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function readBearerToken(req: IncomingMessage): string | null {
  const authorization = readHeader(req, "authorization");
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  return match?.[1] ?? null;
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
  manifest: McpManifest,
  surface: HostSurface,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(request.id ?? null, -32600, "Invalid JSON-RPC request.");
  }
  if (request.id === undefined) return null;

  switch (request.method) {
    case "initialize": {
      const initializeTools = await listTools(surface);
      return rpcResult(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: initializeTools.length > 0 ? {} : undefined,
          resources: surface.resources.length > 0 ? {} : undefined,
          prompts: surface.prompts.length > 0 ? {} : undefined,
        },
        serverInfo: {
          name: manifest.metadata.name,
          version: manifest.metadata.version,
          title: manifest.metadata.title,
        },
      });
    }
    case "ping":
      return rpcResult(request.id, {});
    case "tools/list": {
      const tools = await listTools(surface);
      return rpcResult(request.id, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    }
    case "tools/call":
      return await callTool(request.id, surface, request.params);
    case "resources/list":
      return rpcResult(request.id, { resources: surface.resources });
    case "prompts/list":
      return rpcResult(request.id, { prompts: surface.prompts });
    default:
      return rpcError(request.id, -32601, `Unsupported MCP method ${request.method}.`);
  }
}

async function callTool(
  id: string | number | null,
  surface: HostSurface,
  params: unknown,
): Promise<JsonRpcResponse> {
  const toolName = readRecord(params)?.name;
  if (typeof toolName !== "string") {
    return rpcError(id, -32602, "tools/call requires params.name.");
  }
  const tool = (await listTools(surface)).find((candidate) => candidate.name === toolName);
  if (!tool) return rpcError(id, -32602, `Unknown tool ${toolName}.`);
  const result = await tool.call(readRecord(params)?.arguments ?? {});
  return rpcResult(id, {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  });
}

async function listTools(surface: HostSurface): Promise<HostTool[]> {
  return typeof surface.tools === "function" ? await surface.tools() : surface.tools;
}

function createOpenApiSurface(manifest: McpManifest, config: HostConfig): HostSurface {
  return createRequestProxySurface(manifest, config);
}

function createRequestProxySurface(manifest: McpManifest, config: HostConfig): HostSurface {
  const exposed = new Map(
    manifest.spec.expose.tools
      .filter((item) => !item.deny)
      .map((item) => [item.from, item.name ?? slugToolName(item.from)]),
  );
  const tools = manifest.spec.select.requests.map((request) => {
    const from = `${request.method} ${request.uriTemplate}`;
    const name = exposed.get(from) ?? slugToolName(from);
    return {
      name,
      description: `Invoke ${from} from ${manifest.spec.source.uri}.`,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
      call: (args: unknown) => ({
        importer: manifest.spec.importer.engine,
        source: manifest.spec.source.uri,
        method: request.method,
        uriTemplate: request.uriTemplate,
        config: config.values,
        arguments: args,
      }),
    };
  });

  return { tools, resources: [], prompts: [] };
}

function createGrpcSurface(manifest: McpManifest, config: HostConfig): HostSurface {
  const exposed = new Map(
    manifest.spec.expose.tools
      .filter((item) => !item.deny)
      .map((item) => [item.from, item.name ?? slugToolName(item.from)]),
  );
  const tools = manifest.spec.select.grpcMethods.map((method) => {
    const from = `${method.service}/${method.method}`;
    const name = exposed.get(from) ?? slugToolName(from);
    return {
      name,
      description: `Invoke ${from} from ${manifest.spec.source.uri}.`,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
      call: (args: unknown) => ({
        importer: manifest.spec.importer.engine,
        source: manifest.spec.source.uri,
        service: method.service,
        method: method.method,
        config: config.values,
        arguments: args,
      }),
    };
  });

  return { tools, resources: [], prompts: [] };
}

function createCorpusSurface(manifest: McpManifest): HostSurface {
  const tools = manifest.spec.expose.tools
    .filter((item) => !item.deny)
    .map((item) => ({
      name: item.name ?? slugToolName(item.from),
      description: `Query ${item.from} from ${manifest.spec.source.uri}.`,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
      call: (args: unknown) => ({
        importer: manifest.spec.importer.engine,
        source: manifest.spec.source.uri,
        selection: manifest.spec.select.corpusGlobs,
        operation: item.from,
        arguments: args,
      }),
    }));

  const exposedResources = manifest.spec.expose.resources.filter((item) => !item.deny);
  const resources =
    exposedResources.length > 0
      ? exposedResources.map((item) => ({
          uri: `qdai+manifest://${manifest.metadata.name}/resources/${encodeURIComponent(item.from)}`,
          name: item.name ?? item.from,
          description: `Corpus resource ${item.from} from ${manifest.spec.source.uri}`,
        }))
      : manifest.spec.select.corpusGlobs.map((glob) => ({
          uri: `qdai+manifest://${manifest.metadata.name}/corpus/${encodeURIComponent(glob)}`,
          name: glob,
          description: `Corpus selection from ${manifest.spec.source.uri}`,
        }));

  return {
    tools,
    resources,
    prompts: [],
  };
}

function createSkillsSurface(manifest: McpManifest): HostSurface {
  const tools = manifest.spec.expose.tools
    .filter((item) => !item.deny)
    .map((item) => ({
      name: item.name ?? slugToolName(item.from),
      description: `Invoke agent skill tool ${item.from} from ${manifest.spec.source.uri}.`,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
      call: (args: unknown) => ({
        importer: manifest.spec.importer.engine,
        source: manifest.spec.source.uri,
        operation: item.from,
        skills: manifest.spec.select.skills.map((skill) => skill.name),
        arguments: args,
      }),
    }));
  const exposedPrompts = manifest.spec.expose.prompts.filter((item) => !item.deny);
  const prompts =
    exposedPrompts.length > 0
      ? exposedPrompts.map((item) => ({
          name: item.name ?? slugToolName(item.from),
          description: `Agent Skill prompt ${item.from} from ${manifest.spec.source.uri}`,
        }))
      : manifest.spec.select.skills.map((skill) => ({
          name: skill.name,
          description: `Agent Skill prompt from ${manifest.spec.source.uri}`,
        }));

  return {
    tools,
    resources: [],
    prompts,
  };
}

function createArazzoSurface(manifest: McpManifest, config: HostConfig): HostSurface {
  let cached: Promise<HostTool[]> | undefined;
  return {
    tools: () => {
      cached ??= createArazzoTools(manifest, config);
      return cached;
    },
    resources: [],
    prompts: [],
  };
}

async function createArazzoTools(
  manifest: McpManifest,
  config: HostConfig,
): Promise<HostTool[]> {
  const document = await loadArazzoDocument(manifest.spec.source.uri);
  const sources = await resolveArazzoSources(document, {
    baseUrl: manifest.spec.source.uri,
  });
  const configuredAllowlist = readStringArray(config.values.workflowAllowlist);
  const manifestAllowlist = manifest.spec.select.workflows;
  const workflowAllowlist =
    manifestAllowlist.length > 0 ? manifestAllowlist : configuredAllowlist;
  const denied = new Set(
    manifest.spec.expose.tools.filter((item) => item.deny).map((item) => item.from),
  );
  const renamed = new Map(
    manifest.spec.expose.tools.flatMap((item) =>
      !item.deny && item.name ? [[item.from, item.name] as const] : [],
    ),
  );

  return buildArazzoTools(document, {
    executor: executeHttpRequest,
    sources,
    sourceOverrides: readStringRecord(config.values.sourceOverrides),
    workflowAllowlist,
    maxSteps: readPositiveInteger(config.values.maxSteps),
    stepTimeoutMs: readPositiveInteger(config.values.stepTimeoutMs),
  })
    .filter((tool) => !denied.has(tool.name))
    .map((tool) => ({
      name: renamed.get(tool.name) ?? tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      call: tool.execute,
    }));
}

async function executeHttpRequest(request: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; text: string }> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body:
      request.body === undefined
        ? undefined
        : typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body),
  });
  return { status: response.status, text: await response.text() };
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function createGit2McpSurface(
  manifest: McpManifest,
  config: HostConfig,
  runtime: HostRuntime,
): HostSurface {
  if (manifest.spec.source.type !== "git") {
    throw new EngineResolutionError("git-2-mcp manifests require spec.source.type=git.");
  }

  const selectors = manifest.spec.select.pythonFunctions;
  const exposeNames = new Map(
    manifest.spec.expose.tools
      .filter((item) => !item.deny)
      .map((item) => [item.from, item.name ?? toolNameFromSelector(item.from)]),
  );
  let cached: Promise<HostTool[]> | undefined;

  return {
    tools: () => {
      cached ??= createGit2McpTools(manifest, config, selectors, exposeNames, runtime);
      return cached;
    },
    resources: [],
    prompts: [],
  };
}

async function createGit2McpTools(
  manifest: McpManifest,
  config: HostConfig,
  selectors: readonly string[],
  exposeNames: ReadonlyMap<string, string>,
  runtime: HostRuntime,
): Promise<HostTool[]> {
  const packageRoot =
    typeof config.values.packageRoot === "string"
      ? config.values.packageRoot
      : fixturePackageRoot();
  const sandboxTimeoutMs = readGitSandboxTimeoutMs(config);
  const modules = modulesFromPythonSelectors(selectors);
  const discovered = await Promise.all(
    modules.map((module) =>
      buildGit2McpManifest({
        module,
        packageRoot,
        maxTools: 100,
        packageName: manifest.metadata.name,
        runner: runtime.gitSandboxRunner,
        sandbox: {
          timeoutMs: sandboxTimeoutMs,
        },
      }),
    ),
  );
  const gitManifest: Git2McpManifest = {
    ...discovered[0]!,
    packageName: manifest.metadata.name,
    tools: orderSelectedPythonTools(
      discovered.flatMap((item) => item.tools),
      selectors,
    ),
  };

  return gitManifest.tools.map((tool) => ({
    name: exposeNames.get(`${tool.module}.${tool.functionName}`) ?? tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    call: (params: unknown) =>
      callGit2McpTool({
        manifest: gitManifest,
        packageRoot,
        runner: runtime.gitSandboxRunner,
        toolName: tool.name,
        args: pythonArgs(params, tool),
      }),
  }));
}

function readGitSandboxTimeoutMs(config: HostConfig): number {
  const configured = config.values.sandboxTimeoutMs;
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? configured
    : 15_000;
}

function modulesFromPythonSelectors(selectors: readonly string[]): string[] {
  return [...new Set(selectors.map((selector) => splitPythonSelector(selector).module))];
}

function orderSelectedPythonTools(
  tools: readonly PythonFunctionTool[],
  selectors: readonly string[],
): PythonFunctionTool[] {
  const selected = new Map<string, PythonFunctionTool>();
  for (const selector of selectors) {
    const { module, functionPattern } = splitPythonSelector(selector);
    for (const tool of tools) {
      if (tool.module !== module || !globMatches(functionPattern, tool.functionName)) continue;
      selected.set(`${tool.module}.${tool.functionName}`, tool);
    }
  }
  return [...selected.values()];
}

function splitPythonSelector(selector: string): { module: string; functionPattern: string } {
  const index = selector.lastIndexOf(".");
  return {
    module: selector.slice(0, index),
    functionPattern: selector.slice(index + 1),
  };
}

function globMatches(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  return pattern === value;
}

function toolNameFromSelector(selector: string): string {
  return selector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pythonArgs(params: unknown, tool: PythonFunctionTool): unknown[] {
  if (Array.isArray(params)) return params;
  const record = readRecord(params) ?? {};
  const ordered = [...tool.inputSchema.required];
  for (const key of Object.keys(tool.inputSchema.properties)) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered.filter((key) => Object.hasOwn(record, key)).map((key) => record[key]);
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function slugToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}
