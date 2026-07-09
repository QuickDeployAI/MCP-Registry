#!/usr/bin/env node
/**
 * Entry point for the RSS-to-MCP server.
 *
 * Loads configuration, creates the store, optionally pre-loads a default feed,
 * and connects the MCP server to Streamable HTTP and stdio transports.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { startServer } from "@quickdeployai/importer-core";
import { loadConfig } from "./config.js";
import { createStore } from "./store/factory.js";
import type { StoreAdapter } from "./store/adapter.js";
import { ContentStore } from "./content/content-store.js";
import { PollingCoordinator } from "./polling/coordinator.js";
import { fetchFeedSource } from "./ingestion/fetcher.js";
import { parseFeed } from "feedsmith";
import { OpenAIEmbeddingProvider } from "./store/vector-store.js";
import { createMcpServer } from "./mcp/server.js";

function hasLoadMethod(s: StoreAdapter): s is StoreAdapter & { load: () => Promise<void> } {
  return "load" in s && typeof (s as { load?: unknown }).load === "function";
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

function requestPath(req: IncomingMessage, port: number): string {
  return new URL(req.url ?? "/", `http://localhost:${port}`).pathname;
}

async function main(): Promise<void> {
  const config = loadConfig();

  const embedder =
    config.embeddingProvider === "openai" && config.openaiApiKey
      ? new OpenAIEmbeddingProvider(config.openaiApiKey)
      : undefined;

  const store = createStore({
    backend: config.storageBackend,
    storagePath: config.storagePath,
    maxItems: config.maxItems,
    embedder,
  });

  if (hasLoadMethod(store)) {
    await store.load();
  }

  const contentStore = new ContentStore(
    config.storageBackend !== "memory" ? config.storagePath : null,
  );

  const coordinator = new PollingCoordinator(
    store,
    fetchFeedSource,
    parseFeed,
  );

  if (config.defaultFeed) {
    await coordinator.refresh(config.defaultFeed);

    if (config.pollingEnabled && config.pollIntervalMs > 0) {
      coordinator.register(config.defaultFeed, config.pollIntervalMs);
    }
  }

  const mcpServer = createMcpServer({
    store,
    contentStore,
    fetcher: fetchFeedSource,
    parser: parseFeed,
    defaultFeed: config.defaultFeed,
    maxResults: config.maxQueryResults,
    maxFieldSize: config.maxFieldSize,
  });

  const httpServer = createServer(async (req, res) => {
    if (requestPath(req, config.port) === "/ping") {
      res.writeHead(204).end();
      return;
    }

    if (requestPath(req, config.port) !== config.mcpPath) {
      sendJsonRpcError(res, 404, -32004, "MCP endpoint not found.");
      return;
    }

    if (req.method !== "POST") {
      sendJsonRpcError(res, 405, -32000, "Method not allowed.");
      return;
    }

    const httpMcpServer = createMcpServer({
      store,
      contentStore,
      fetcher: fetchFeedSource,
      parser: parseFeed,
      defaultFeed: config.defaultFeed,
      maxResults: config.maxQueryResults,
      maxFieldSize: config.maxFieldSize,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    try {
      await httpMcpServer.connect(transport as Transport);
      await transport.handleRequest(req, res);
      res.on("close", () => {
        void transport.close();
        void httpMcpServer.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, "Internal server error.");
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, resolve);
  });

  await startServer(mcpServer, new StdioServerTransport());

  console.error(
    `[feed-2-mcp] streamable-http=:${config.port}${config.mcpPath} stdio:on`,
  );

  const shutdown = async () => {
    coordinator.shutdown();
    httpServer.close();
    await store.close();
    await mcpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
