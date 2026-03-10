/**
 * MCP server assembly.
 *
 * Generic over TItem — the raw feedsmith item type.
 * Creates the McpServer, registers all tools/resources/prompts,
 * and returns it ready to connect to a transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NativeItem } from "../types.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentStore } from "../content/content-store.js";
import type { FetcherFn, ParserFn } from "../polling/coordinator.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const SERVER_NAME = "rss-2-mcp";
const SERVER_VERSION = "0.1.0";

export interface ServerAssemblyOptions<TItem extends NativeItem = NativeItem> {
  store: StoreAdapter<TItem>;
  contentStore: ContentStore;
  fetcher: FetcherFn;
  parser: ParserFn;
  defaultFeed: string | null;
  maxResults: number;
  maxFieldSize: number;
}

export function createMcpServer<TItem extends NativeItem = NativeItem>(
  opts: ServerAssemblyOptions<TItem>,
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { resources: {}, tools: {}, prompts: {} } },
  );

  registerTools(server, opts);
  registerResources(server, opts.store, opts.contentStore);
  registerPrompts(server);

  return server;
}
