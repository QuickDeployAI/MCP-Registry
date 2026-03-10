/**
 * MCP server assembly.
 *
 * Creates the McpServer, registers all tools/resources/prompts,
 * and returns it ready to connect to a transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreAdapter } from "../store/adapter.js";
import type { ContentStore } from "../content/content-store.js";
import type { FetcherFn, ParserFn, NormalizerFn } from "../polling/coordinator.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const SERVER_NAME = "rss-2-mcp";
const SERVER_VERSION = "0.1.0";

export interface ServerAssemblyOptions {
  store: StoreAdapter;
  contentStore: ContentStore;
  fetcher: FetcherFn;
  parser: ParserFn;
  normalizer: NormalizerFn;
  defaultFeed: string | null;
  maxResults: number;
  maxFieldSize: number;
}

export function createMcpServer(opts: ServerAssemblyOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { resources: {}, tools: {}, prompts: {} } },
  );

  registerTools(server, {
    store: opts.store,
    contentStore: opts.contentStore,
    fetcher: opts.fetcher,
    parser: opts.parser,
    normalizer: opts.normalizer,
    defaultFeed: opts.defaultFeed,
    maxResults: opts.maxResults,
    maxFieldSize: opts.maxFieldSize,
  });

  registerResources(server, opts.store, opts.contentStore);
  registerPrompts(server);

  return server;
}
