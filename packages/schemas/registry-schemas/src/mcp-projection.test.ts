import { describe, expect, it } from "vitest";

import { McpProjectionConfigSchema } from "./mcp-projection";

describe("McpProjectionConfigSchema", () => {
  it("validates MCP-only projection config linked to an ARD entry", () => {
    const projection = McpProjectionConfigSchema.parse({
      kind: "McpProjectionConfig",
      entryRef: "urn:air:quickdeploy:examples:petstore",
      select: {
        requests: [{ method: "get", uriTemplate: "/pets" }],
      },
      expose: {
        tools: [{ from: "GET /pets", name: "listPets" }],
      },
      auth: [
        {
          type: "api-key",
          in: "header",
          name: "x-api-key",
          valueFrom: { env: "PETSTORE_API_KEY" },
        },
      ],
      deployment: {
        transport: "streamable-http",
        auth: { type: "gateway" },
        userConfig: {
          tenant: { type: "string" },
        },
        configSchema: {
          type: "object",
          properties: {
            tenant: { type: "string" },
          },
        },
      },
    });

    expect(projection.entryRef).toBe("urn:air:quickdeploy:examples:petstore");
    expect(projection.select?.requests).toEqual([{ method: "GET", uriTemplate: "/pets" }]);
    expect(projection.deployment.auth).toEqual({
      type: "gateway",
      authenticatedHeader: {
        name: "x-quickdeploy-gateway-authenticated",
        value: "true",
      },
    });
  });

  it("defaults optional projection-only curation fields", () => {
    const projection = McpProjectionConfigSchema.parse({
      entryRef: "urn:air:quickdeploy:examples:raw-openapi",
      deployment: {
        transport: "stdio",
      },
    });

    expect(projection.expose).toEqual({ tools: [], resources: [], prompts: [] });
    expect(projection.auth).toEqual([]);
  });

  it("rejects source and importer fields from the retired McpManifest role", () => {
    expect(() =>
      McpProjectionConfigSchema.parse({
        entryRef: "urn:air:quickdeploy:examples:petstore",
        source: { type: "http", uri: "https://example.com/openapi.json" },
        importer: { engine: "openapi-2-mcp", versionRange: "1.0.0" },
        deployment: { transport: "stdio" },
      }),
    ).toThrow();
  });

  it("requires entryRef to point at an ARD entry urn", () => {
    expect(() =>
      McpProjectionConfigSchema.parse({
        entryRef: "https://example.com/openapi.json",
        deployment: { transport: "stdio" },
      }),
    ).toThrow(/entryRef must be an ARD urn:air/);
  });
});
