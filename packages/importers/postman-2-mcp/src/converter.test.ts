import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  convertPostmanCollectionToOpenApi,
  loadPostmanCollection,
  postmanCollectionToMcpManifestSelect,
} from "./index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("convertPostmanCollectionToOpenApi", () => {
  it("converts collection auth, variables, path params, query params, and JSON bodies into OpenAPI operations", async () => {
    const collection = await loadPostmanCollection({
      collectionPath: join(fixturesDir, "petstore-collection.json"),
    });
    const result = convertPostmanCollectionToOpenApi({
      collection,
      variables: {
        petstoreApiToken: "${PETSTORE_API_TOKEN}",
        petstoreApiKey: "${PETSTORE_API_KEY}",
      },
    });

    expect(result.openapi).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "Postman Petstore",
        version: "0.1.0",
      },
      servers: [{ url: "https://petstore.example/v1" }],
    });
    expect(result.operations).toEqual([
      expect.objectContaining({
        name: "Get pet",
        method: "GET",
        path: "/pets/{petId}",
        toolName: "postman_petstore_get_pet",
        auth: { type: "bearer", env: "PETSTORE_API_TOKEN" },
      }),
      expect.objectContaining({
        name: "Create pet",
        method: "POST",
        path: "/pets",
        toolName: "postman_petstore_create_pet",
        auth: { type: "api-key", env: "PETSTORE_API_KEY", headerName: "x-api-key" },
      }),
    ]);
    expect(result.openapi.paths["/pets/{petId}"]?.get).toMatchObject({
      operationId: "postman_petstore_get_pet",
      parameters: [
        { name: "petId", in: "path", required: true, schema: { type: "string" } },
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", default: "available" },
        },
      ],
      security: [{ PETSTORE_API_TOKEN: [] }],
    });
    expect(result.openapi.paths["/pets"]?.post).toMatchObject({
      operationId: "postman_petstore_create_pet",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                available: { type: "boolean" },
              },
              required: ["name", "tags", "available"],
            },
          },
        },
      },
      security: [{ PETSTORE_API_KEY: [] }],
    });
    expect(result.openapi.components.securitySchemes).toMatchObject({
      PETSTORE_API_TOKEN: { type: "http", scheme: "bearer" },
      PETSTORE_API_KEY: { type: "apiKey", in: "header", name: "x-api-key" },
    });
  });

  it("fails clearly when a collection URL leaves variables unresolved", async () => {
    const collection = await loadPostmanCollection({
      collectionPath: join(fixturesDir, "petstore-collection.json"),
    });

    expect(() => convertPostmanCollectionToOpenApi({ collection })).toThrow(
      /Unresolved Postman variable "petstoreApiToken"/,
    );
  });

  it("builds manifest request selectors from converted collection operations", async () => {
    const collection = await loadPostmanCollection({
      collectionPath: join(fixturesDir, "petstore-collection.json"),
    });
    const result = convertPostmanCollectionToOpenApi({
      collection,
      variables: {
        petstoreApiToken: "${PETSTORE_API_TOKEN}",
        petstoreApiKey: "${PETSTORE_API_KEY}",
      },
    });

    expect(postmanCollectionToMcpManifestSelect(result)).toEqual({
      requests: [
        { method: "GET", uriTemplate: "/pets/{petId}" },
        { method: "POST", uriTemplate: "/pets" },
      ],
    });
  });
});
