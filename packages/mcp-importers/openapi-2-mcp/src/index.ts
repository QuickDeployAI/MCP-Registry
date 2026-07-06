#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Command } from "commander";
import { dereference } from "@readme/openapi-parser";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  normalizeOpenApiDocument,
  OpenApiContentStore,
  openApiToMcpTools,
  parseVersion,
} from "./parser.js";

const program = new Command()
  .name("openapi-2-mcp")
  .description("Build an MCP server from an OpenAPI spec")
  .argument("<spec>", "Path or URL to the OpenAPI spec (local file or http(s)://)")
  .option("--port <number>", "HTTP server port", "3000")
  .option("--mcp <path>",    "HTTP streaming endpoint path", "/mcp")
  .option("--base-url <url>","Override base URL from spec servers")
  .option("--allow-tools <list>", "Comma-separated original operationIds to expose")
  .option("--deny-tools <list>", "Comma-separated original operationIds to hide")
  .option("--rename-tool <mapping...>", "Rename operationId with old=new; repeat or pass space-separated mappings")
  .option("--max-inline-response-bytes <number>", "Return ContentRef resources for larger responses")
  .parse();

const [specPath] = program.args as [string];
const {
  port: portStr,
  mcp: mcpPath,
  baseUrl: baseUrlOverride,
  allowTools,
  denyTools,
  renameTool,
  maxInlineResponseBytes: maxInlineResponseBytesStr,
} = program.opts<{
  port: string;
  mcp: string;
  baseUrl?: string;
  allowTools?: string;
  denyTools?: string;
  renameTool?: string[];
  maxInlineResponseBytes?: string;
}>();

function parseList(value: string | undefined): string[] | undefined {
  const items = value?.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  return items && items.length > 0 ? items : undefined;
}

function parseRenameMappings(values: string[] | undefined): Record<string, string> | undefined {
  if (!values || values.length === 0) return undefined;

  const mappings = Object.fromEntries(
    values.map((value) => {
      const [from, to] = value.split("=");
      if (!from || !to) {
        throw new Error(`Invalid --rename-tool mapping "${value}". Expected old=new.`);
      }
      return [from.trim(), to.trim()];
    }),
  );
  return Object.keys(mappings).length > 0 ? mappings : undefined;
}

const allow = parseList(allowTools);
const deny = parseList(denyTools);
const rename = parseRenameMappings(renameTool);
const expose = {
  ...(allow ? { allow } : {}),
  ...(deny ? { deny } : {}),
  ...(rename ? { rename } : {}),
};

const rawDoc = await dereference(specPath);
const { document: doc, warnings } = await normalizeOpenApiDocument(rawDoc);
const baseUrl = baseUrlOverride ?? doc.servers?.[0]?.url ?? "";
const contentStore = new OpenApiContentStore();
const tools = openApiToMcpTools(doc, baseUrl, {
  ...(Object.keys(expose).length > 0 ? { expose } : {}),
  ...(maxInlineResponseBytesStr !== undefined
    ? { maxInlineResponseBytes: Number(maxInlineResponseBytesStr) }
    : {}),
  contentStore,
});
const version = parseVersion(doc.info.version);
const port   = Number(portStr);

// All logging → stderr; stdout is reserved for the MCP stdio protocol
const log = (...a: unknown[]) => process.stderr.write(a.join(" ") + "\n");

log(`[openapi-2-mcp] ${tools.length} tools | :${port} stream:${mcpPath} stdio:on`);
for (const warning of warnings) {
  log(`[openapi-2-mcp] warning: ${warning}`);
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: doc.info.title, version },
    { capabilities: { resources: {}, tools: {} } },
  );
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
  server.resource(
    "openapi2mcp-content",
    new ResourceTemplate("openapi2mcp://content/{operationId}/{callId}/response", {
      list: undefined,
    }),
    { description: "Full upstream OpenAPI response body for an oversized tool result." },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: contentStore.retrieve(uri.href) ?? "",
        },
      ],
    }),
  );
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
