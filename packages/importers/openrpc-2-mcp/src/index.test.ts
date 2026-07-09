import { describe, expect, it } from "vitest";

describe("openrpc-2-mcp package", () => {
  it("parses OpenRPC methods with resolved by-name params and result schemas", async () => {
    const { parseOpenRpcDocument } = await import("./index");

    const model = parseOpenRpcDocument({
      openrpc: "1.3.2",
      info: { title: "Petstore JSON-RPC", version: "1.0.0" },
      servers: [{ name: "main", url: "https://rpc.example.test" }],
      methods: [
        {
          name: "pets.get",
          summary: "Get a pet",
          paramStructure: "by-name",
          params: [
            {
              name: "petId",
              required: true,
              schema: { type: "string" },
            },
          ],
          result: {
            name: "pet",
            schema: { $ref: "#/components/schemas/Pet" },
          },
        },
      ],
      components: {
        schemas: {
          Pet: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      },
    });

    expect(model.servers).toEqual([{ name: "main", url: "https://rpc.example.test" }]);
    expect(model.methods).toHaveLength(1);
    expect(model.methods[0]).toMatchObject({
      name: "pets.get",
      summary: "Get a pet",
      paramStructure: "by-name",
      params: [
        {
          name: "petId",
          required: true,
          schema: { type: "string" },
        },
      ],
      result: {
        name: "pet",
        schema: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
      },
    });
  });

  it("loads a URL-backed OpenRPC document and preserves by-position params", async () => {
    const { loadOpenRpcDocument } = await import("./index");

    const model = await loadOpenRpcDocument(new URL("https://rpc.example.test/openrpc.json"), {
      fetch: async () =>
        new Response(
          JSON.stringify({
            openrpc: "1.3.2",
            info: { title: "Calculator", version: "1.0.0" },
            methods: [
              {
                name: "add",
                paramStructure: "by-position",
                params: [
                  { name: "left", schema: { type: "number" } },
                  { name: "right", schema: { type: "number" } },
                ],
                result: { name: "sum", schema: { type: "number" } },
              },
            ],
          }),
        ),
    });

    expect(model.methods[0]?.paramStructure).toBe("by-position");
    expect(model.methods[0]?.params.map((param) => param.name)).toEqual(["left", "right"]);
  });

  it("loads file-backed OpenRPC fixtures", async () => {
    const { loadOpenRpcDocument } = await import("./index");

    const model = await loadOpenRpcDocument(
      new URL("../fixtures/petstore.openrpc.json", import.meta.url),
    );

    expect(model.info.title).toBe("Petstore JSON-RPC");
    expect(model.methods.map((method) => method.name)).toEqual(["pets.get"]);
  });

  it("rejects malformed OpenRPC documents", async () => {
    const { parseOpenRpcDocument } = await import("./index");

    expect(() =>
      parseOpenRpcDocument({
        openrpc: "1.3.2",
        info: { title: "Missing methods", version: "1.0.0" },
      }),
    ).toThrow(/methods/i);
  });

  it("emits api-contract and tool capabilities from an OpenRPC model", async () => {
    const { openRpcToParsedCapabilities, parseOpenRpcDocument } = await import("./index");

    const model = parseOpenRpcDocument(validOpenRpcDocument());
    expect(
      openRpcToParsedCapabilities(model).map((capability) => [capability.kind, capability.name]),
    ).toEqual([
      ["api-contract", "Petstore JSON-RPC"],
      ["tool", "pets_get"],
    ]);
  });

  it("round-trips by-name JSON-RPC calls through generated tools", async () => {
    const { buildOpenRpcTools, parseOpenRpcDocument } = await import("./index");
    const [tool] = buildOpenRpcTools(parseOpenRpcDocument(validOpenRpcDocument()), {
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch: async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          jsonrpc: "2.0",
          method: "pets.get",
          params: { petId: "pet-1" },
        });
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: { id: "pet-1" } });
      },
    });

    await expect(tool?.execute({ petId: "pet-1" })).resolves.toBe(
      JSON.stringify({ id: "pet-1" }, null, 2),
    );
  });

  it("serializes by-position methods in content descriptor order", async () => {
    const { buildOpenRpcTools, parseOpenRpcDocument } = await import("./index");
    const [tool] = buildOpenRpcTools(
      parseOpenRpcDocument({
        openrpc: "1.3.2",
        info: { title: "Calculator", version: "1.0.0" },
        methods: [
          {
            name: "add",
            paramStructure: "by-position",
            params: [
              { name: "left", schema: { type: "number" } },
              { name: "right", schema: { type: "number" } },
            ],
            result: { name: "sum", schema: { type: "number" } },
          },
        ],
      }),
      {
        endpoint: "https://rpc.example.test",
        transport: "http",
        fetch: async (_input, init) => {
          expect(JSON.parse(String(init?.body))).toMatchObject({
            method: "add",
            params: [2, 3],
          });
          return jsonResponse({ jsonrpc: "2.0", id: 1, result: 5 });
        },
      },
    );

    await expect(tool?.execute({ left: 2, right: 3 })).resolves.toBe("5");
  });

  it("builds an ArtifactParser-compatible projection when runtime options are provided", async () => {
    const { createOpenRpcArtifactParser } = await import("./index");
    const parser = createOpenRpcArtifactParser({
      endpoint: "https://rpc.example.test",
      transport: "http",
      fetch: async () => jsonResponse({ jsonrpc: "2.0", id: 1, result: { id: "pet-1" } }),
    });

    const result = await parser.parse(validOpenRpcDocument(), {
      identifier: "urn:air:example.test:api:petstore",
      displayName: "Petstore",
      type: "application/vnd.open-rpc+json",
      data: validOpenRpcDocument(),
    });

    expect(result.capabilities.map((capability) => capability.kind)).toEqual([
      "api-contract",
      "tool",
    ]);
    expect(result.mcpProjection?.tools.map((tool) => tool.name)).toEqual(["pets_get"]);
    expect(result.diagnostics).toEqual([]);
  });
});

function validOpenRpcDocument() {
  return {
    openrpc: "1.3.2",
    info: { title: "Petstore JSON-RPC", version: "1.0.0" },
    methods: [
      {
        name: "pets.get",
        paramStructure: "by-name",
        params: [
          {
            name: "petId",
            required: true,
            schema: { type: "string" },
          },
        ],
        result: {
          name: "pet",
          schema: { type: "object", properties: { id: { type: "string" } } },
        },
      },
    ],
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
