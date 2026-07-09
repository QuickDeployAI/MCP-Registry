import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC    = resolve(__dirname, "fixtures/petstore.yaml");
const SERVER  = resolve(__dirname, "../dist/cli.js");
let port: number;
let stdioPort: number;
let base: string;

const EXPECTED_TOOLS = ["getPetById", "findPetsByStatus", "addPet"];

// ── helpers ─────────────────────────────────────────────────────────────────

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(url); return; }
    catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error(`Server not ready at ${url} after ${timeoutMs}ms`);
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close(() => reject(new Error("Could not allocate test port")));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

function mkClient() {
  return new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
}

// ── fixture: streamable HTTP + stdio server ─────────────────────────────────

let httpProc: ReturnType<typeof spawn>;

beforeAll(async () => {
  port = await getFreePort();
  stdioPort = await getFreePort();
  base = `http://127.0.0.1:${port}`;
  httpProc = spawn("node", [SERVER, SPEC, "--port", String(port)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Surface server stderr in test output for debugging
  httpProc.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  await waitForServer(`${base}/ping`);
}, 30_000);

afterAll(() => { httpProc?.kill(); });

// ── tests ────────────────────────────────────────────────────────────────────

describe("MCP transports served simultaneously", () => {

  it("HTTP streaming (/mcp) returns the expected tools", async () => {
    const client = mkClient();
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
  });

  it("does not serve the deprecated SSE endpoint", async () => {
    const response = await fetch(`${base}/sse`);
    expect(response.status).toBe(404);
  });

  it("stdio returns the expected tools", async () => {
    // StdioClientTransport spawns its own child process, so it runs alongside
    // the HTTP server process above.
    const client = mkClient();
    const transport = new StdioClientTransport({
      command: "node",
      args: [SERVER, SPEC, "--port", String(stdioPort)],
      stderr: "pipe",
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
  });

});
