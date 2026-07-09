import { describe, expect, it, vi } from "vitest";
import {
  ImporterError,
  createJsonRpcClient,
  type JsonRpcRequestPayload,
  type JsonRpcWebSocketLike,
} from "./json-rpc.js";

describe("JSON-RPC importer client", () => {
  it("posts by-name params and returns the correlated result", async () => {
    const fetch = vi.fn(
      async (_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as JsonRpcRequestPayload;
        expect(payload).toMatchObject({
          jsonrpc: "2.0",
          method: "pets.search",
          params: { limit: 2 },
        });
        return jsonResponse({ jsonrpc: "2.0", id: payload.id, result: ["cat", "dog"] });
      },
    );

    const client = createJsonRpcClient({
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch,
    });

    await expect(
      client.call("pets.search", { limit: 2 }, { paramStructure: "by-name" }),
    ).resolves.toEqual(["cat", "dog"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://rpc.example.test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
  });

  it("posts by-position params and batches requests", async () => {
    const fetch = vi.fn(
      async (_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as JsonRpcRequestPayload[];
        expect(payload).toMatchObject([
          { jsonrpc: "2.0", method: "math.add", params: [1, 2] },
          { jsonrpc: "2.0", method: "math.multiply", params: [3, 4] },
        ]);
        return jsonResponse([
          { jsonrpc: "2.0", id: payload[1]?.id, result: 12 },
          { jsonrpc: "2.0", id: payload[0]?.id, result: 3 },
        ]);
      },
    );

    const client = createJsonRpcClient({
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch,
    });

    await expect(
      client.batch([
        { method: "math.add", params: [1, 2], paramStructure: "by-position" },
        { method: "math.multiply", params: [3, 4], paramStructure: "by-position" },
      ]),
    ).resolves.toEqual([3, 12]);
  });

  it("maps JSON-RPC and transport errors to ImporterError", async () => {
    const rpcErrorClient = createJsonRpcClient({
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch: async (_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as JsonRpcRequestPayload;
        return jsonResponse({
          jsonrpc: "2.0",
          id: payload.id,
          error: { code: -32602, message: "Invalid params", data: { field: "limit" } },
        });
      },
    });

    await expect(rpcErrorClient.call("pets.search")).rejects.toMatchObject({
      name: "ImporterError",
      message: expect.stringContaining("Invalid params"),
      code: "JSON_RPC_ERROR",
      cause: expect.objectContaining({ code: -32602 }),
    });

    const transportErrorClient = createJsonRpcClient({
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch: async () => new Response("upstream down", { status: 503, statusText: "Unavailable" }),
    });

    await expect(transportErrorClient.call("pets.search")).rejects.toThrow(ImporterError);
    await expect(transportErrorClient.call("pets.search")).rejects.toThrow(/503 Unavailable/);
  });

  it("applies auth headers and redacts secret values from errors", async () => {
    const client = createJsonRpcClient({
      endpoint: "https://rpc.example.test",
      transport: "http",
      credentials: [
        {
          type: "bearer",
          valueFrom: { env: "TOKEN" },
          value: "secret-token",
        },
      ],
      fetch: async (
        _url: Parameters<typeof globalThis.fetch>[0],
        init?: RequestInit,
      ): Promise<Response> => {
        expect(init?.headers).toMatchObject({ authorization: "Bearer secret-token" });
        throw new Error("network rejected secret-token");
      },
    });

    await expect(client.call("pets.search")).rejects.toMatchObject({
      message: "network rejected [REDACTED]",
    });
  });

  it("opens a WebSocket request and correlates the response id", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = createJsonRpcClient({
      endpoint: "wss://rpc.example.test",
      transport: "ws",
      createWebSocket: (url: string) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    });

    const result = client.call("pets.get", { id: "pet-1" }, { paramStructure: "by-name" });
    sockets[0]?.open();
    const payload = JSON.parse(sockets[0]?.sent[0] ?? "") as JsonRpcRequestPayload;
    sockets[0]?.message({ jsonrpc: "2.0", id: payload.id, result: { name: "Rex" } });

    await expect(result).resolves.toEqual({ name: "Rex" });
    expect(sockets[0]?.url).toBe("wss://rpc.example.test");
    expect(sockets[0]?.closed).toBe(true);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

class FakeWebSocket implements JsonRpcWebSocketLike {
  readonly sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  message(body: unknown): void {
    this.onmessage?.({ data: JSON.stringify(body) });
  }
}
