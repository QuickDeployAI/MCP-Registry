#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Command } from "commander";
import { dereference } from "@readme/openapi-parser";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { OpenAPIV3 } from "openapi-types";
import { openApiToMcpTools, parseVersion } from "./parser.js";

const program = new Command()
  .name("openapi-2-mcp")
  .description("Build an MCP server from an OpenAPI spec")
  .argument("<spec>", "Path or URL to the OpenAPI spec (local file or http(s)://)")
  .option("--port <number>", "HTTP server port", "3000")
  .option("--mcp <path>",    "HTTP streaming endpoint path", "/mcp")
  .option("--base-url <url>","Override base URL from spec servers")
  .parse();

const [specPath] = program.args as [string];
const { port: portStr, mcp: mcpPath, baseUrl: baseUrlOverride } =
  program.opts<{ port: string; mcp: string; baseUrl?: string }>();

const doc    = await dereference<OpenAPIV3.Document>(specPath);
const baseUrl = baseUrlOverride ?? doc.servers?.[0]?.url ?? "";
const tools  = openApiToMcpTools(doc, baseUrl);
const version = parseVersion(doc.info.version);
const port   = Number(portStr);

// All logging → stderr; stdout is reserved for the MCP stdio protocol
const log = (...a: unknown[]) => process.stderr.write(a.join(" ") + "\n");

log(`[openapi-2-mcp] ${tools.length} tools | :${port} stream:${mcpPath} stdio:on`);

function makeServer(): McpServer {
  const server = new McpServer({ name: doc.info.title, version });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      },
      async (args: unknown) => ({
        content: [{ type: "text", text: await tool.execute(args) }],
      }),
    );
  }
  return server;
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

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? "/", `http://localhost:${port}`).pathname;
}

const httpServer = createServer(async (req, res) => {
  if (requestPath(req) === "/ping") {
    res.writeHead(204).end();
    return;
  }

  if (requestPath(req) !== mcpPath) {
    sendJsonRpcError(res, 404, -32004, "MCP endpoint not found.");
    return;
  }

  if (req.method !== "POST") {
    sendJsonRpcError(res, 405, -32000, "Method not allowed.");
    return;
  }

  const server = makeServer();
  const transport = new StreamableHTTPServerTransport(
    { sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0],
  );

  try {
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    log("Error handling MCP request:", error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal server error.");
    }
  }
});

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(port, resolve);
});

process.once("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.once("SIGINT", () => httpServer.close(() => process.exit(0)));

// Stdio is always active; stdout carries only the MCP wire protocol.
await makeServer().connect(new StdioServerTransport());
