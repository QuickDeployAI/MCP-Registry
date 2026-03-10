#!/usr/bin/env node
/**
 * Entry point for the RSS-to-MCP server.
 *
 * Loads configuration, creates the store, optionally pre-loads a default feed,
 * and connects the MCP server to stdio transport.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store/factory.js";
import type { StoreAdapter } from "./store/adapter.js";
import { ContentStore } from "./content/content-store.js";
import { PollingCoordinator } from "./polling/coordinator.js";
import { fetchFeedSource } from "./ingestion/fetcher.js";
import { parseFeedXml } from "./ingestion/parser.js";
import { normalizeFeed } from "./ingestion/normalizer.js";
import { OpenAIEmbeddingProvider } from "./store/vector-store.js";
import { createMcpServer } from "./mcp/server.js";

function hasLoadMethod(s: StoreAdapter): s is StoreAdapter & { load: () => Promise<void> } {
  return "load" in s && typeof (s as { load?: unknown }).load === "function";
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
    parseFeedXml,
    normalizeFeed,
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
    parser: parseFeedXml,
    normalizer: normalizeFeed,
    defaultFeed: config.defaultFeed,
    maxResults: config.maxQueryResults,
    maxFieldSize: config.maxFieldSize,
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  process.on("SIGINT", async () => {
    coordinator.shutdown();
    await store.close();
    await mcpServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
