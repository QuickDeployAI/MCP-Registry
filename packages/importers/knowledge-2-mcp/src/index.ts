#!/usr/bin/env node
/**
 * Entry point for knowledge-2-mcp.
 *
 * Loads configuration, ingests the configured source directory (if any),
 * optionally watches it for changes, and connects the MCP server to
 * Streamable HTTP and stdio transports.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { watch } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { startServer } from "@quickdeployai/importer-core";
import { createStore, OpenAIEmbeddingProvider } from "@quickdeployai/corpus-core";
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import { loadConfig } from "./config.js";
import { RefreshCorpusUseCase } from "./application/refresh-corpus.use-case.js";
import { createMcpServer } from "./mcp/server.js";
import type { DocChunk } from "./types.js";

function hasLoadMethod(s: StoreAdapter<DocChunk>): s is StoreAdapter<DocChunk> & { load: () => Promise<void> } {
  return "load" in s && typeof (s as { load?: unknown }).load === "function";
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

function requestPath(req: IncomingMessage, port: number): string {
  return new URL(req.url ?? "/", `http://localhost:${port}`).pathname;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
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
  }) as unknown as StoreAdapter<DocChunk>;

  if (hasLoadMethod(store)) {
    await store.load();
  }

  const refreshUseCase = new RefreshCorpusUseCase(store);

  if (config.sourceDir && config.corpusId) {
    const result = await refreshUseCase.execute({
      corpusId: config.corpusId,
      sourceDir: config.sourceDir,
      sourceType: config.sourceType,
    });
    console.error(`[knowledge-2-mcp] ingested ${config.corpusId}:`, JSON.stringify(result));

    if (config.watch) {
      const triggerRefresh = debounce(() => {
        refreshUseCase
          .execute({ corpusId: config.corpusId!, sourceDir: config.sourceDir!, sourceType: config.sourceType })
          .then((r) => console.error(`[knowledge-2-mcp] re-ingested ${config.corpusId}:`, JSON.stringify(r)))
          .catch((err) => console.error("[knowledge-2-mcp] watch re-ingest failed:", err));
      }, config.watchDebounceMs);

      watch(config.sourceDir, { recursive: true }, () => triggerRefresh());
      console.error(`[knowledge-2-mcp] watching ${config.sourceDir} for changes`);
    }
  }

  const serverDeps = {
    store,
    defaultCorpusId: config.corpusId,
    defaultSourceDir: config.sourceDir,
    sourceType: config.sourceType,
    maxResults: config.maxQueryResults,
    maxFieldSize: config.maxFieldSize,
  };

  const mcpServer = createMcpServer(serverDeps);

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

    const httpMcpServer = createMcpServer(serverDeps);
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

  console.error(`[knowledge-2-mcp] streamable-http=:${config.port}${config.mcpPath} stdio:on`);

  const shutdown = async () => {
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
