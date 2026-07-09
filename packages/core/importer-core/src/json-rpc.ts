import { applyCredentialToRequest, redactCredentialValues, type ResolvedCredential } from "./auth.js";

export type JsonRpcId = number | string;

export type JsonRpcParamStructure = "by-name" | "by-position";

export type JsonRpcTransport = "http" | "ws";

export type JsonRpcRequestPayload = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type JsonRpcErrorObject = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcCallOptions = {
  paramStructure?: JsonRpcParamStructure;
};

export type JsonRpcBatchCall = JsonRpcCallOptions & {
  method: string;
  params?: unknown;
};

export type JsonRpcWebSocketLike = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

export type CreateJsonRpcClientOptions = {
  endpoint: string;
  transport: JsonRpcTransport;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  credentials?: readonly ResolvedCredential[];
  timeoutMs?: number;
  createWebSocket?: (url: string) => JsonRpcWebSocketLike;
};

export type JsonRpcClient = {
  call(method: string, params?: unknown, options?: JsonRpcCallOptions): Promise<unknown>;
  batch(calls: readonly JsonRpcBatchCall[]): Promise<unknown[]>;
};

export class ImporterError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, options: { code: string; cause?: unknown }) {
    super(message);
    this.name = "ImporterError";
    this.code = options.code;
    this.cause = options.cause;
  }
}

type JsonRpcSuccessResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

type JsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
};

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export function createJsonRpcClient(options: CreateJsonRpcClientOptions): JsonRpcClient {
  let nextId = 1;

  function nextRequest(method: string, params: unknown, callOptions: JsonRpcCallOptions = {}) {
    const id = nextId++;
    const request: JsonRpcRequestPayload = {
      jsonrpc: "2.0",
      id,
      method,
    };
    const normalizedParams = normalizeParams(params, callOptions.paramStructure);
    if (normalizedParams !== undefined) {
      request.params = normalizedParams;
    }
    return request;
  }

  return {
    async call(method, params, callOptions) {
      const request = nextRequest(method, params, callOptions);
      if (options.transport === "ws") {
        return sendWebSocketRequest(options, request);
      }
      const [result] = await sendHttpRequests(options, [request]);
      return result;
    },
    async batch(calls) {
      const requests = calls.map((call) => nextRequest(call.method, call.params, call));
      if (options.transport === "ws") {
        return Promise.all(requests.map((request) => sendWebSocketRequest(options, request)));
      }
      return sendHttpRequests(options, requests);
    },
  };
}

async function sendHttpRequests(
  options: CreateJsonRpcClientOptions,
  requests: readonly JsonRpcRequestPayload[],
): Promise<unknown[]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new ImporterError("JSON-RPC HTTP transport requires a fetch implementation.", {
      code: "TRANSPORT_UNAVAILABLE",
    });
  }

  const { url, headers } = applyRequestCredentials(options);
  const body = JSON.stringify(requests.length === 1 ? requests[0] : requests);
  const controller = options.timeoutMs ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs).unref?.()
    : undefined;

  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
      ...(controller ? { signal: controller.signal } : {}),
    };
    const response = await fetchImpl(url, init);

    const responseText = await response.text();
    if (!response.ok) {
      throw new ImporterError(
        `JSON-RPC HTTP transport failed: ${response.status} ${response.statusText}${
          responseText ? `: ${responseText}` : ""
        }`,
        { code: "HTTP_ERROR" },
      );
    }

    const parsed = parseJson(responseText);
    const responses = Array.isArray(parsed) ? parsed : [parsed];
    return correlateResponses(requests, responses);
  } catch (error) {
    throw redactImporterError(error, options.credentials);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function sendWebSocketRequest(
  options: CreateJsonRpcClientOptions,
  request: JsonRpcRequestPayload,
): Promise<unknown> {
  const socketFactory = options.createWebSocket ?? createGlobalWebSocket;
  const socket = socketFactory(options.endpoint);

  return new Promise((resolve, reject) => {
    const timeout = options.timeoutMs
      ? setTimeout(
          () =>
            fail(
              new ImporterError("JSON-RPC WebSocket request timed out.", {
                code: "WS_TIMEOUT",
              }),
            ),
          options.timeoutMs,
        )
      : undefined;

    function cleanup() {
      if (timeout) clearTimeout(timeout);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }

    function fail(error: unknown) {
      cleanup();
      try {
        socket.close();
      } catch {
        // Ignore close failures after the transport has already failed.
      }
      reject(redactImporterError(error, options.credentials));
    }

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        fail(error);
      }
    };
    socket.onmessage = (event) => {
      try {
        const result = correlateResponses([request], [parseJson(event.data)])[0];
        cleanup();
        socket.close();
        resolve(result);
      } catch (error) {
        fail(error);
      }
    };
    socket.onerror = (event) => {
      fail(
        new ImporterError("JSON-RPC WebSocket transport failed.", {
          code: "WS_ERROR",
          cause: event,
        }),
      );
    };
    socket.onclose = () => {
      fail(
        new ImporterError("JSON-RPC WebSocket closed before a response arrived.", {
          code: "WS_CLOSED",
        }),
      );
    };
  });
}

function normalizeParams(
  params: unknown,
  structure: JsonRpcParamStructure = "by-name",
): unknown[] | Record<string, unknown> | undefined {
  if (params === undefined) {
    return undefined;
  }
  if (structure === "by-position") {
    return Array.isArray(params) ? params : [params];
  }
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    return params as Record<string, unknown>;
  }
  throw new ImporterError("JSON-RPC by-name params must be an object.", {
    code: "INVALID_PARAMS",
  });
}

function applyRequestCredentials(options: CreateJsonRpcClientOptions): {
  url: string;
  headers: Record<string, string>;
} {
  const url = new URL(options.endpoint);
  let changedUrl = false;
  const headers = lowerCaseHeaders(options.headers ?? {});
  const cookies: string[] = [];

  for (const credential of options.credentials ?? []) {
    const patch = applyCredentialToRequest(credential);
    Object.assign(headers, lowerCaseHeaders(patch.headers));
    for (const [name, value] of Object.entries(patch.query)) {
      url.searchParams.set(name, String(value));
      changedUrl = true;
    }
    for (const [name, value] of Object.entries(patch.cookies)) {
      cookies.push(`${name}=${value}`);
    }
  }

  if (cookies.length > 0) {
    headers.cookie = cookies.join("; ");
  }

  return { url: changedUrl ? url.toString() : options.endpoint, headers };
}

function correlateResponses(
  requests: readonly JsonRpcRequestPayload[],
  responses: readonly unknown[],
): unknown[] {
  const byId = new Map<JsonRpcId | null, JsonRpcResponse>();
  for (const response of responses) {
    if (!isJsonRpcResponse(response)) {
      throw new ImporterError("JSON-RPC response had an invalid envelope.", {
        code: "INVALID_RESPONSE",
        cause: response,
      });
    }
    byId.set(response.id, response);
  }

  return requests.map((request) => {
    const response = byId.get(request.id);
    if (!response) {
      throw new ImporterError(`JSON-RPC response missing id ${request.id}.`, {
        code: "MISSING_RESPONSE",
      });
    }
    if ("error" in response) {
      throw new ImporterError(`JSON-RPC error ${response.error.code}: ${response.error.message}`, {
        code: "JSON_RPC_ERROR",
        cause: response.error,
      });
    }
    return response.result;
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ImporterError("JSON-RPC response was not valid JSON.", {
      code: "INVALID_JSON",
      cause: error,
    });
  }
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !("id" in value)) {
    return false;
  }
  if ("error" in value) {
    return isJsonRpcError(value.error);
  }
  return "result" in value;
}

function isJsonRpcError(value: unknown): value is JsonRpcErrorObject {
  return isRecord(value) && typeof value.code === "number" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function lowerCaseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function redactImporterError(
  error: unknown,
  credentials: readonly ResolvedCredential[] = [],
): Error {
  if (error instanceof ImporterError) {
    return new ImporterError(redactCredentialValues(error.message, credentials), {
      code: error.code,
      cause: error.cause,
    });
  }
  if (error instanceof Error) {
    return new ImporterError(redactCredentialValues(error.message, credentials), {
      code: "TRANSPORT_ERROR",
      cause: error,
    });
  }
  return new ImporterError(redactCredentialValues(String(error), credentials), {
    code: "TRANSPORT_ERROR",
    cause: error,
  });
}

function createGlobalWebSocket(url: string): JsonRpcWebSocketLike {
  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => JsonRpcWebSocketLike })
    .WebSocket;
  if (!WebSocketCtor) {
    throw new ImporterError("JSON-RPC WebSocket transport requires a WebSocket implementation.", {
      code: "TRANSPORT_UNAVAILABLE",
    });
  }
  return new WebSocketCtor(url);
}
