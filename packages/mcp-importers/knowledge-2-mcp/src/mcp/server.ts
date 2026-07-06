/**
 * MCP server assembly.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreAdapter } from "@quickdeployai/corpus-core";
import type { DocChunk } from "../types.js";
import { registerTools, type ToolDeps } from "./tools.js";

const SERVER_NAME = "knowledge-2-mcp";
const SERVER_VERSION = "0.1.0";

export interface ServerAssemblyOptions extends ToolDeps {
  store: StoreAdapter<DocChunk>;
}

export function createMcpServer(opts: ServerAssemblyOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerTools(server, opts);

  return server;
}
