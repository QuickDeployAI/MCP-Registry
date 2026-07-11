import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectedEntry } from "../src/projection-loader";
import { createMcpHost } from "../src/runtime";

const entryPath = fileURLToPath(
  new URL("../../../../registry/quickdeploy/api-manifest-petstore.ard.json", import.meta.url),
);
const openApiPath = new URL(
  "../../../importers/api-manifest-2-mcp/fixtures/petstore.openapi.json",
  import.meta.url,
);

describe("API Manifest registry projection E2E", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  });

  it("exposes and invokes only requests selected by the API Manifest", async () => {
    const upstreamRequests: Array<{ method?: string; url?: string; authorization?: string }> = [];
    const server = createServer((request, response) => {
      upstreamRequests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "pet-42", name: "Milo" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeCallbacks.push(() => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ));
    const address = server.address() as AddressInfo;
    const openApi = await readFile(openApiPath, "utf8");
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://petstore.example/openapi.json") {
        return new Response(openApi, { status: 200, headers: { "content-type": "application/json" } });
      }
      return fetch(input, init);
    };

    const projected = await loadProjectedEntry(entryPath);
    const host = await createMcpHost({
      ...projected,
      userConfig: {
        deploymentBaseUrlOverride: `http://127.0.0.1:${address.port}/v1`,
      },
      env: { PETSTORE_OAUTH_TOKEN: "fixture-token" } as NodeJS.ProcessEnv,
      fetch: fetchImpl,
    });

    const listed = await host.handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(listed).toMatchObject({
      result: {
        tools: [
          { name: "petstore.getPetById" },
          { name: "petstore.createOrder" },
        ],
      },
    });
    expect(JSON.stringify(listed)).not.toContain("getAuditLog");

    const called = await host.handleJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "petstore.getPetById", arguments: { petId: "pet-42" } },
    });
    expect(called).toMatchObject({ result: { content: [{ type: "text" }] } });
    expect(upstreamRequests).toEqual([
      {
        method: "GET",
        url: "/v1/pets/pet-42",
        authorization: "Bearer fixture-token",
      },
    ]);
  });
});
