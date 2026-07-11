import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("arazzo-2-mcp standalone server", () => {
  it("lists workflow tools over stdio", async () => {
    const packageRoot = resolve(import.meta.dirname, "..");
    const spec = pathToFileURL(resolve(packageRoot, "fixtures/adoption-workflow.arazzo.json")).href;
    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve(packageRoot, "dist/bin.mjs"), "serve", "--spec", spec, "--port", String(await freePort())],
      stderr: "pipe",
    }));
    const result = await client.listTools();
    await client.close();
    expect(result.tools.map((tool) => tool.name)).toContain("create-and-assign-ticket");
  });
});

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
