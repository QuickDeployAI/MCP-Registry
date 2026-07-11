import { describe, expect, it } from "vitest";
import { API_MANIFEST_MEDIA_TYPE, mediaTypeToCapabilityKinds } from "@quickdeployai/registry-schemas/ard";
import { apiManifestArtifactParser, createApiManifestArtifactParser } from "./index.js";

const manifest = {
  applicationName: "petstore-subset",
  apiDependencies: {
    petstore: {
      apiDeploymentBaseUrl: "https://petstore.example.test/v1",
      requests: [
        { method: "get", uriTemplate: "/pets/{petId}" },
        { method: "post", uriTemplate: "/orders" },
      ],
    },
  },
};

const openApiDocuments = {
  petstore: {
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1.0.0" },
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPetById",
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
          responses: {},
        },
      },
      "/orders": {
        post: { operationId: "createOrder", responses: {} },
      },
    },
  },
};

const entry = {
  identifier: "urn:air:example:petstore-subset",
  displayName: "Petstore Subset",
  type: API_MANIFEST_MEDIA_TYPE,
  url: "https://registry.example.test/petstore.apimanifest.json",
};

describe("apiManifestArtifactParser", () => {
  it("emits the authoritative api-contract and tool capabilities", async () => {
    const result = await apiManifestArtifactParser.parse(manifest, entry);

    expect(apiManifestArtifactParser.mediaTypes).toEqual([API_MANIFEST_MEDIA_TYPE]);
    expect(result.capabilities[0]).toMatchObject({ kind: "api-contract", name: "Petstore Subset" });
    expect(result.capabilities.filter((c) => c.kind === "tool")).toHaveLength(2);
    expect(new Set(result.capabilities.map((c) => c.kind))).toEqual(
      new Set(mediaTypeToCapabilityKinds(API_MANIFEST_MEDIA_TYPE)),
    );
  });

  it("omits the MCP projection with an info diagnostic when no runtime is provided", async () => {
    const result = await apiManifestArtifactParser.parse(manifest, entry);

    expect(result.mcpProjection).toBeUndefined();
    expect(result.diagnostics).toEqual([
      { level: "info", message: "API Manifest parsed without runtime options; MCP projection omitted." },
    ]);
  });

  it("builds an executable tool surface when runtime options are provided", async () => {
    const parser = createApiManifestArtifactParser({ openApiDocuments });
    const result = await parser.parse(manifest, entry);

    expect(result.mcpProjection?.tools).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
    const toolNames = (result.mcpProjection?.tools ?? []).map(
      (tool) => (tool as { name: string }).name,
    );
    expect(toolNames).toEqual(["petstore.getPetById", "petstore.createOrder"]);
  });

  it("degrades to a diagnostic instead of throwing when a dependency has no resolvable base URL", async () => {
    const parser = createApiManifestArtifactParser({
      openApiDocuments,
      baseUrls: {},
    });
    const unroutable = {
      applicationName: "no-base-url",
      apiDependencies: {
        petstore: { requests: [{ method: "get", uriTemplate: "/pets/{petId}" }] },
      },
    };

    const result = await parser.parse(unroutable, entry);

    expect(result.mcpProjection).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("apiDeploymentBaseUrl"),
      }),
    ]);
  });
});
