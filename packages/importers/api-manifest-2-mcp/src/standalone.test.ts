import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const packageRoot = resolve(import.meta.dirname, "..");
let sourceServer: ReturnType<typeof createHttpServer>;
let mcpProcess: ChildProcess;
let mcpPort: number;

beforeAll(async () => {
  const openApi = await readFile(resolve(packageRoot, "fixtures/petstore.openapi.json"), "utf8");
  sourceServer = createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" }).end(openApi);
  });
  const sourcePort = await listen(sourceServer);
  const dir = await mkdtemp(join(tmpdir(), "api-manifest-standalone-"));
  const manifestPath = join(dir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    applicationName: "petstore-standalone",
    apiDependencies: {
      petstore: {
        apiDescriptionUrl: `http://127.0.0.1:${sourcePort}/openapi.json`,
        apiDeploymentBaseUrl: "https://petstore.example/v1",
        requests: [
          { method: "GET", uriTemplate: "/pets/{petId}" },
          { method: "POST", uriTemplate: "/orders" },
        ],
      },
    },
  }));

  mcpPort = await freePort();
  mcpProcess = spawn(
    process.execPath,
    [resolve(packageRoot, "dist/bin.mjs"), "serve", "--manifest", manifestPath, "--port", String(mcpPort)],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  await waitForPing(`http://127.0.0.1:${mcpPort}/ping`);
}, 20_000);

afterAll(() => {
  mcpProcess?.kill();
  sourceServer?.close();
});

describe("api-manifest-2-mcp standalone server", () => {
  it("lists only manifest-selected operations over streamable HTTP", async () => {
    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`)));
    const result = await client.listTools();
    await client.close();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "petstore.getPetById",
      "petstore.createOrder",
    ]);
  });
});

async function listen(server: ReturnType<typeof createHttpServer>): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) return reject(new Error("No port."));
      resolvePort(address.port);
    });
  });
}

async function freePort(): Promise<number> {
  const server = createHttpServer();
  const port = await listen(server);
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  return port;
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
