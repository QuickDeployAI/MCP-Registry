import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, "../../../dist/index.js");
const PORT = 13200;
const BASE = `http://localhost:${PORT}`;

const EXPECTED_TOOLS = [
  "get_schema",
  "get_query_examples",
  "get_feed_info",
  "refresh_feed",
  "query_feed_items",
  "get_feed_item",
  "get_feed_stats",
  "get_recent_items",
  "get_new_items_since",
];

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 204) return;
    } catch {
      // Server is not ready yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Server not ready at ${url} after ${timeoutMs}ms`);
}

function mkClient() {
  return new Client({ name: "feed-2-mcp-test", version: "1.0.0" }, { capabilities: {} });
}

let httpProc: ReturnType<typeof spawn>;

beforeAll(async () => {
  httpProc = spawn("node", [SERVER, "--port", String(PORT)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  httpProc.stderr?.on("data", (data: Buffer) => process.stderr.write(data));
  await waitForServer(`${BASE}/ping`);
}, 30_000);

afterAll(() => {
  httpProc?.kill();
});

describe("MCP transports served simultaneously", () => {
  it("Streamable HTTP returns all feed tools", async () => {
    const client = mkClient();
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
  });

  it("stdio returns all feed tools", async () => {
    const client = mkClient();
    const transport = new StdioClientTransport({
      command: "node",
      args: [SERVER, "--port", String(PORT + 1)],
      stderr: "pipe",
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
  });
});
