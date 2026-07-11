import type { ArdEntry } from "@quickdeployai/registry-schemas/ard";
import { McpProjectionConfigSchema } from "@quickdeployai/registry-schemas/mcp-projection";
import { describe, expect, it } from "vitest";
import { greeterDescriptorBytes } from "../../../importers/grpc-2-mcp/src/test-fixtures";
import {
  createArdSurface,
  createMcpHost,
  resolveParserByMediaType,
  startHttpHost,
} from "../src/runtime";

const petstoreEntry: ArdEntry = {
  identifier: "urn:air:quickdeploy.ai:mcp:petstore",
  displayName: "Petstore",
  version: "1.0.0",
  type: "application/vnd.oai.openapi+json",
  data: {
    openapi: "3.0.0",
    info: { title: "Petstore", version: "1.0.0" },
    servers: [{ url: "https://petstore.example" }],
    paths: {
      "/pet/{petId}": {
        get: {
          operationId: "getPetById",
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Pet" } },
        },
      },
      "/pet": {
        post: { operationId: "createPet", responses: { "200": { description: "Pet" } } },
      },
      "/internal": {
        get: { operationId: "internalOnly", responses: { "200": { description: "Internal" } } },
      },
    },
  },
};

const petstoreProjection = McpProjectionConfigSchema.parse({
  kind: "McpProjectionConfig",
  entryRef: petstoreEntry.identifier,
  select: {
    requests: [
      { method: "get", uriTemplate: "/pet/{petId}" },
      { method: "post", uriTemplate: "/pet" },
    ],
  },
  expose: {
    tools: [
      { from: "GET /pet/{petId}", name: "get_pet" },
      { from: "POST /pet", name: "create_pet" },
    ],
  },
  deployment: { transport: "streamable-http", auth: { type: "none" } },
});

describe("ARD projection host", () => {
  it("loads an ARD artifact by media type and applies select/expose parity", async () => {
    expect(resolveParserByMediaType(petstoreEntry.type)).toBeDefined();
    const host = await createMcpHost({ entry: petstoreEntry, projection: petstoreProjection });
    expect(await toolNames(host)).toEqual(["get_pet", "create_pet"]);
    expect(host.ready).toMatchObject({
      server: "Petstore",
      version: "1.0.0",
      parser: { name: "openapi-2-mcp" },
      transport: "streamable-http",
    });
  });

  it.each([
    {
      type: "application/protobuf",
      data: "descriptor-fixture",
      nativeArtifact: greeterDescriptorBytes(),
      from: "quickdeploy.fixture.Greeter/SayHello",
      exposedName: "greeter_say_hello",
      select: { grpcMethods: [{ service: "quickdeploy.fixture.Greeter", method: "SayHello" }] },
    },
    {
      type: "application/wsdl+xml",
      url: "file://packages/importers/wsdl-2-mcp/fixtures/calculator-document-literal.wsdl",
      nativeArtifact: undefined,
      from: "POST /soap/CalculatorService/Add",
      exposedName: "calculator_add",
      select: { requests: [{ method: "post", uriTemplate: "/soap/CalculatorService/Add" }] },
    },
  ])("starts $type entries through the built-in parser with projected tool parity", async ({
    type,
    url,
    data,
    nativeArtifact,
    from,
    exposedName,
    select,
  }) => {
    const entry: ArdEntry = {
      identifier: `urn:air:quickdeploy.ai:test:${exposedName}`,
      displayName: exposedName,
      type,
      ...(url ? { url } : { data }),
    };
    const projection = McpProjectionConfigSchema.parse({
      entryRef: entry.identifier,
      select,
      expose: { tools: [{ from, name: exposedName }] },
      deployment: { transport: "stdio" },
    });
    const host = await createMcpHost({ entry, projection, nativeArtifact });
    expect(await toolNames(host)).toEqual([exposedName]);
  });

  it("uses projection deployment auth for streamable HTTP", async () => {
    const projection = McpProjectionConfigSchema.parse({
      ...petstoreProjection,
      deployment: {
        transport: "streamable-http",
        auth: { type: "bearer", tokenFrom: { env: "MCP_TOKEN" } },
      },
    });
    const host = await createMcpHost({
      entry: petstoreEntry,
      projection,
      env: { MCP_TOKEN: "secret" },
    });
    const http = await startHttpHost(host);
    try {
      expect((await fetch(`${http.url}/mcp`, { method: "POST", body: "{}" })).status).toBe(401);
      const response = await fetch(`${http.url}/mcp`, {
        method: "POST",
        headers: { authorization: "Bearer secret", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "get_pet",
        "create_pet",
      ]);
    } finally {
      await http.close();
    }
  });

  it("rejects a projection linked to a different entry", async () => {
    await expect(createMcpHost({
      entry: petstoreEntry,
      projection: { ...petstoreProjection, entryRef: "urn:air:quickdeploy.ai:mcp:other" },
    })).rejects.toThrow(/not urn:air:quickdeploy\.ai:mcp:petstore/);
  });

  it("returns a diagnostic and empty surface for an unmapped media type", async () => {
    const result = await createArdSurface({
      entry: {
        identifier: "urn:air:example:unknown",
        displayName: "Unknown",
        type: "application/x-unknown",
        data: {},
      },
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ level: "warn", message: expect.stringContaining("No ArtifactParser") }),
    ]);
    expect(result.surface.tools).toEqual([]);
  });
});

async function toolNames(host: Awaited<ReturnType<typeof createMcpHost>>): Promise<string[]> {
  const response = await host.handleJsonRpc({ jsonrpc: "2.0", id: "tools", method: "tools/list" });
  if (!response || !("result" in response)) throw new Error("tools/list failed");
  return (response.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
}
