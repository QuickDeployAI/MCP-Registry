import { createServer } from "node:net";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn, type ChildProcess } from "node:child_process";

const packageRoot = resolve(import.meta.dirname, "..");
const serverPath = resolve(packageRoot, "dist/bin.mjs");
const specPath = resolve(packageRoot, "fixtures/petstore.openrpc.json");
let httpProcess: ChildProcess;
let httpPort: number;

beforeAll(async () => {
  httpPort = await freePort();
  httpProcess = spawn(
    process.execPath,
    [serverPath, "serve", "--spec", specPath, "--endpoint", "http://127.0.0.1:1", "--port", String(httpPort)],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  await waitForPing(`http://127.0.0.1:${httpPort}/ping`);
}, 20_000);

afterAll(() => httpProcess?.kill());

describe("openrpc-2-mcp standalone transports", () => {
  it("lists projected tools over streamable HTTP", async () => {
    const client = createClient();
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${httpPort}/mcp`)));
    const result = await client.listTools();
    await client.close();
    expect(result.tools.map((tool) => tool.name)).toContain("pets_get");
  });

  it("lists projected tools over stdio", async () => {
    const client = createClient();
    const port = await freePort();
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [serverPath, "serve", "--spec", specPath, "--endpoint", "http://127.0.0.1:1", "--port", String(port)],
      stderr: "pipe",
    }));
    const result = await client.listTools();
    await client.close();
    expect(result.tools.map((tool) => tool.name)).toContain("pets_get");
  });
});

function createClient(): Client {
  return new Client({ name: "standalone-importer-test", version: "1.0.0" }, { capabilities: {} });
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close(() => reject(new Error("Could not allocate a test port.")));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForPing(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status === 204) return;
    } catch {
      // Server is not listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Server did not become ready at ${url}.`);
}
