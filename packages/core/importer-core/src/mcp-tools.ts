import { createServer, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { z } from "zod";

export interface ExecutableMcpTool {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute(args: unknown): Promise<unknown>;
}

export interface ServeMcpToolsOptions {
  name: string;
  version: string;
  tools: readonly ExecutableMcpTool[];
  port?: number;
  mcpPath?: string;
}

export function createMcpToolsServer(options: ServeMcpToolsOptions): McpServer {
  const server = new McpServer(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  );
  for (const tool of options.tools) {
    server.registerTool(
      tool.name,
      { title: tool.name, description: tool.description, inputSchema: tool.parameters },
      async (args: unknown) => ({
        content: [{ type: "text", text: formatToolResult(await tool.execute(args)) }],
      }),
    );
  }
  return server;
}

export async function serveMcpTools(options: ServeMcpToolsOptions): Promise<void> {
  const port = options.port ?? 3000;
  const mcpPath = options.mcpPath ?? "/mcp";
  const httpServer = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", `http://localhost:${port}`).pathname;
    if (path === "/ping") {
      response.writeHead(204).end();
      return;
    }
    if (path !== mcpPath || request.method !== "POST") {
      sendJsonRpcError(response, path === mcpPath ? 405 : 404, "MCP endpoint not found.");
      return;
    }

    const server = createMcpToolsServer(options);
    const transport = new StreamableHTTPServerTransport(
      { sessionIdGenerator: undefined } as unknown as ConstructorParameters<
        typeof StreamableHTTPServerTransport
      >[0],
    );
    try {
      await server.connect(transport as Transport);
      await transport.handleRequest(request, response);
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      process.stderr.write(`${options.name}: ${error instanceof Error ? error.message : String(error)}\n`);
      if (!response.headersSent) sendJsonRpcError(response, 500, "Internal server error.");
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, resolve);
  });
  process.stderr.write(`[${options.name}] streamable-http=:${port}${mcpPath} stdio:on\n`);

  const stdioServer = createMcpToolsServer(options);
  await stdioServer.connect(new StdioServerTransport());
  const shutdown = async () => {
    httpServer.close();
    await stdioServer.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

function formatToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

function sendJsonRpcError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}
