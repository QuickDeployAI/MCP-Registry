import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectedEntry } from "../src/projection-loader";
import { createMcpHost } from "../src/runtime";

const entryPath = fileURLToPath(
  new URL("../../../../registry/quickdeploy/openrpc-petstore.ard.json", import.meta.url),
);

describe("OpenRPC registry projection E2E", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it("lists and invokes the selected method against a mock JSON-RPC upstream", async () => {
    const upstreamRequests: unknown[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id: unknown };
        upstreamRequests.push(payload);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: { id: "pet-42", name: "Milo" },
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeCallbacks.push(() => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ));
    const address = server.address() as AddressInfo;

    const projected = await loadProjectedEntry(entryPath);
    const host = await createMcpHost({
      ...projected,
      userConfig: { endpoint: `http://127.0.0.1:${address.port}` },
    });

    const listed = await host.handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(listed).toMatchObject({ result: { tools: [{ name: "get_pet" }] } });

    const called = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_pet", arguments: { petId: "pet-42" } },
    });
    expect(called).toMatchObject({
      result: {
        content: [{ type: "text", text: JSON.stringify({ id: "pet-42", name: "Milo" }, null, 2) }],
      },
    });
    expect(upstreamRequests).toEqual([
      expect.objectContaining({ method: "pets.get", params: { petId: "pet-42" } }),
    ]);
  });
});
