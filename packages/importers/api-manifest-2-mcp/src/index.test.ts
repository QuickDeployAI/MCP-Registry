import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  apiManifestToSelect,
  loadApiManifest,
  parseApiManifest,
  resolveApiManifestDependencies,
} from "./index";

describe("api-manifest-2-mcp package", () => {
  it("loads and validates a file-backed API Manifest", async () => {
    const manifest = await loadApiManifest(
      new URL("../fixtures/petstore.apimanifest.json", import.meta.url),
    );

    expect(manifest.applicationName).toBe("petstore-subset");
    expect(manifest.apiDependencies.petstore?.apiDescriptionUrl).toBe(
      "https://petstore.example/openapi.json",
    );
    expect(apiManifestToSelect(manifest).requests).toEqual([
      { method: "GET", uriTemplate: "/pets/{petId}" },
      { method: "POST", uriTemplate: "/orders" },
    ]);
  });

  it("loads a URL-backed API Manifest with an injected fetch implementation", async () => {
    const manifest = await loadApiManifest(new URL("https://example.test/api-manifest.json"), {
      fetch: async () =>
        new Response(
          JSON.stringify({
            applicationName: "remote-client",
            apiDependencies: {
              remote: {
                apiDeploymentBaseUrl: "https://api.example.test",
                requests: [{ method: "patch", uriTemplate: "/accounts/{accountId}" }],
              },
            },
          }),
        ),
    });

    expect(manifest.apiDependencies.remote?.requests).toEqual([
      { method: "PATCH", uriTemplate: "/accounts/{accountId}", dataClassification: [] },
    ]);
  });

  it("parses inline multi-dependency manifests", () => {
    const manifest = parseApiManifest({
      applicationName: "multi-api-client",
      apiDependencies: {
        users: {
          apiDescriptionUrl: "https://api.example.test/users/openapi.json",
          requests: [{ method: "get", uriTemplate: "/users/{userId}" }],
        },
        orders: {
          apiDescriptionUrl: "https://api.example.test/orders/openapi.json",
          requests: [{ method: "post", uriTemplate: "/orders" }],
        },
      },
    });

    expect(Object.keys(manifest.apiDependencies)).toEqual(["users", "orders"]);
    expect(apiManifestToSelect(manifest).requests).toEqual([
      { method: "GET", uriTemplate: "/users/{userId}" },
      { method: "POST", uriTemplate: "/orders" },
    ]);
  });

  it("rejects invalid API Manifests with schema errors", () => {
    expect(() => parseApiManifest({ applicationName: "missing-deps" })).toThrow(/apiDependencies/);
  });

  it("resolves dependency OpenAPI documents and filters exactly the requested operations", async () => {
    const [resolution] = await resolveApiManifestDependencies(
      new URL("../fixtures/petstore.apimanifest.json", import.meta.url),
      {
        fetch: async (input) => {
          expect(String(input)).toBe("https://petstore.example/openapi.json");
          return new Response(
            await readFile(new URL("../fixtures/petstore.openapi.json", import.meta.url), "utf8"),
          );
        },
      },
    );

    expect(resolution?.dependencyKey).toBe("petstore");
    expect(
      resolution?.selectedOperations.map((operation) => operation.operation.operationId),
    ).toEqual(["getPetById", "createOrder"]);
    expect(Object.keys(resolution?.selectedOpenApiDocument.paths ?? {})).toEqual([
      "/pets/{petId}",
      "/orders",
    ]);
  });

  it("resolves independent operation selections for multi-dependency manifests", async () => {
    const [users, orders] = await resolveApiManifestDependencies(
      {
        applicationName: "multi-api-client",
        apiDependencies: {
          users: {
            apiDescriptionUrl: "https://api.example.test/users/openapi.json",
            apiDeploymentBaseUrl: "https://api.example.test/users",
            requests: [{ method: "get", uriTemplate: "/users/{userId}" }],
          },
          orders: {
            apiDescriptionUrl: "https://api.example.test/orders/openapi.json",
            apiDeploymentBaseUrl: "https://api.example.test/orders",
            requests: [{ method: "post", uriTemplate: "/orders" }],
          },
        },
      },
      {
        openApiDocuments: {
          users: openApiFixture({
            "/users/{id}": {
              get: { operationId: "getUser", responses: {} },
              delete: { operationId: "deleteUser", responses: {} },
            },
          }),
          orders: openApiFixture({
            "/orders": {
              get: { operationId: "listOrders", responses: {} },
              post: { operationId: "createOrder", responses: {} },
            },
          }),
        },
      },
    );

    expect(users?.selectedOperations.map((operation) => operation.operation.operationId)).toEqual([
      "getUser",
    ]);
    expect(orders?.selectedOperations.map((operation) => operation.operation.operationId)).toEqual([
      "createOrder",
    ]);
  });

  it("fails when a selected request is not present in the dependency OpenAPI document", async () => {
    await expect(
      resolveApiManifestDependencies(
        {
          applicationName: "missing-operation",
          apiDependencies: {
            petstore: {
              apiDescriptionUrl: "https://petstore.example/openapi.json",
              requests: [{ method: "post", uriTemplate: "/missing" }],
            },
          },
        },
        { openApiDocuments: { petstore: openApiFixture({ "/pets": { get: {} } }) } },
      ),
    ).rejects.toThrow(/POST \/missing/);
  });
});

function openApiFixture(paths: Record<string, Record<string, unknown>>) {
  return {
    openapi: "3.1.0",
    info: { title: "Fixture", version: "1.0.0" },
    paths,
  };
}
