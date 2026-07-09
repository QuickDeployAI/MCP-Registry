import { readFile } from "node:fs/promises";
import {
  type OfficialServerJsonDocument,
  OfficialServerJsonDocumentSchema,
  ServersJsonSchema,
  serverJsonEntries,
} from "@quickdeployai/registry-schemas";
import { buildRegistryArtifacts } from "./registry-build";

const MCP_PROTOCOL_VERSION = "2025-11-25";
const CLIENT_INFO = {
  name: "quickdeploy-registry-liveness",
  version: "0.1.0",
};

export interface RemoteLivenessOptions {
  rootDir: string;
  timeoutMs?: number;
  serverJsonPath?: string;
  fetchImpl?: typeof fetch;
}

export type RemoteLivenessStatus = "ok" | "auth-required" | "failed";

export interface RemoteLivenessResult {
  serverName: string;
  remoteUrl: string;
  status: RemoteLivenessStatus;
  detail: string;
  statusCode?: number;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export async function validateRemoteLiveness(
  options: RemoteLivenessOptions,
): Promise<RemoteLivenessResult[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const servers = options.serverJsonPath
    ? await readServersJson(options.serverJsonPath)
    : (await buildRegistryArtifacts({ rootDir: options.rootDir })).serversJson.servers;

  const remotes = servers.flatMap((server) =>
    (server.remotes ?? [])
      .filter((remote) => typeof remote.url === "string" && remote.url.trim())
      .filter((remote) => !isTemplateUrl(remote.url as string))
      .map((remote) => ({ serverName: server.name, remoteUrl: remote.url as string })),
  );

  const results: RemoteLivenessResult[] = [];
  for (const remote of remotes) {
    results.push(await validateOneRemote(remote, timeoutMs, fetchImpl));
  }
  return results;
}

export function formatRemoteLivenessResults(results: RemoteLivenessResult[]): string {
  if (results.length === 0) return "No remote MCP endpoints found.\n";
  return `${results
    .map((result) => {
      const prefix = result.status === "failed" ? "FAIL" : result.status.toUpperCase();
      const statusCode = result.statusCode ? ` HTTP ${result.statusCode}` : "";
      return `${prefix} ${result.serverName} ${result.remoteUrl}${statusCode} - ${result.detail}`;
    })
    .join("\n")}\n`;
}

export function failedRemoteLivenessResults(
  results: RemoteLivenessResult[],
): RemoteLivenessResult[] {
  return results.filter((result) => result.status === "failed");
}

async function readServersJson(path: string): Promise<OfficialServerJsonDocument[]> {
  const parsed = ServersJsonSchema.parse(JSON.parse(await readFile(path, "utf8")));
  return serverJsonEntries(parsed).map((entry) => OfficialServerJsonDocumentSchema.parse(entry));
}

async function validateOneRemote(
  remote: { serverName: string; remoteUrl: string },
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<RemoteLivenessResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const initialize = await postJsonRpc(
      remote.remoteUrl,
      initializeRequest(),
      controller,
      fetchImpl,
    );
    if (isAuthChallenge(initialize.response)) {
      return {
        ...remote,
        status: "auth-required",
        statusCode: initialize.response.status,
        detail: "endpoint is reachable and returned an authentication challenge",
      };
    }

    if (!initialize.response.ok) {
      return failed(
        remote,
        initialize.response.status,
        `initialize returned HTTP ${initialize.response.status}`,
      );
    }

    const initializeBody = parseJsonRpcResponse(initialize.text);
    if (!isSuccessfulInitialize(initializeBody)) {
      return failed(
        remote,
        initialize.response.status,
        "initialize response was not a valid MCP initialize result",
      );
    }

    const sessionId =
      initialize.response.headers.get("Mcp-Session-Id") ??
      initialize.response.headers.get("mcp-session-id") ??
      undefined;
    const initialized = await postJsonRpc(
      remote.remoteUrl,
      initializedNotification(),
      controller,
      fetchImpl,
      sessionId,
    );

    if (!initialized.response.ok && initialized.response.status !== 202) {
      return failed(
        remote,
        initialized.response.status,
        `notifications/initialized returned HTTP ${initialized.response.status}`,
      );
    }

    return {
      ...remote,
      status: "ok",
      statusCode: initialize.response.status,
      detail: "initialize completed",
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return failed(remote, undefined, detail);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJsonRpc(
  url: string,
  body: Record<string, unknown>,
  controller: AbortController,
  fetchImpl: typeof fetch,
  sessionId?: string,
): Promise<{ response: Response; text: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
    redirect: "manual",
  });
  const text = await response.text().catch(() => "");
  return { response, text };
}

function initializeRequest(): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: "initialize",
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: CLIENT_INFO,
    },
  };
}

function initializedNotification(): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  };
}

function isAuthChallenge(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

function isTemplateUrl(url: string): boolean {
  return /\{[^}]+\}/.test(url);
}

function parseJsonRpcResponse(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("MCP initialize response body was empty");

  if (/^data:/m.test(trimmed)) return parseSseResponse(trimmed);
  return JSON.parse(trimmed) as JsonRpcResponse;
}

function parseSseResponse(text: string): JsonRpcResponse {
  const events: JsonRpcResponse[] = [];
  let data = "";

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
      continue;
    }

    if (line === "" && data) {
      events.push(JSON.parse(data) as JsonRpcResponse);
      data = "";
    }
  }

  if (data) events.push(JSON.parse(data) as JsonRpcResponse);
  const event = events.find((candidate) => candidate.result !== undefined || candidate.error);
  if (!event) throw new Error("MCP SSE response had no JSON-RPC result event");
  return event;
}

function isSuccessfulInitialize(response: JsonRpcResponse): boolean {
  if (response.error) return false;
  if (!isRecord(response.result)) return false;
  return isRecord(response.result.serverInfo);
}

function failed(
  remote: { serverName: string; remoteUrl: string },
  statusCode: number | undefined,
  detail: string,
): RemoteLivenessResult {
  return {
    ...remote,
    status: "failed",
    ...(statusCode ? { statusCode } : {}),
    detail,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
