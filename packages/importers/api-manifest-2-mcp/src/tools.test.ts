import { describe, expect, it } from "vitest";
import { buildApiManifestTools } from "./tools";

describe("buildApiManifestTools", () => {
  it("generates a namespaced tool set for multiple dependencies", async () => {
    const tools = await buildApiManifestTools(
      {
        applicationName: "multi-api-client",
        apiDependencies: {
          users: {
            apiDeploymentBaseUrl: "https://users.example.test",
            requests: [{ method: "get", uriTemplate: "/records/{id}" }],
          },
          orders: {
            apiDeploymentBaseUrl: "https://orders.example.test",
            requests: [{ method: "get", uriTemplate: "/records/{id}" }],
          },
        },
      },
      {
        openApiDocuments: {
          users: openApiFixture({
            "/records/{id}": { get: operationFixture("getRecord") },
          }),
          orders: openApiFixture({
            "/records/{id}": { get: operationFixture("getRecord") },
          }),
        },
      },
    );

    expect(tools.map((tool) => tool.name)).toEqual(["users.getRecord", "orders.getRecord"]);
    expect(tools.map((tool) => tool.operationName)).toEqual(["getRecord", "getRecord"]);
  });

  it("maps API Manifest authorization requirements to executable auth bindings", async () => {
    const requests: Array<{
      url: URL;
      method: string;
      headers: Record<string, string>;
      body?: unknown;
    }> = [];
    const [tool] = await buildApiManifestTools(
      {
        applicationName: "authenticated-client",
        apiDependencies: {
          petstore: {
            apiDeploymentBaseUrl: "https://petstore.example.test/v1",
            authorizationRequirements: {
              clientIdentifier: "quickdeploy-petstore-importer",
              access: [{ type: "scope", scope: "pets.read" }],
            },
            requests: [{ method: "get", uriTemplate: "/pets/{petId}" }],
          },
        },
      },
      {
        env: { PETSTORE_OAUTH_TOKEN: "secret-token" } as NodeJS.ProcessEnv,
        executor: async (request) => {
          requests.push(request);
          return { status: 200, text: '{"ok":true}' };
        },
        openApiDocuments: {
          petstore: openApiFixture({
            "/pets/{petId}": { get: operationFixture("getPetById", "petId") },
          }),
        },
      },
    );

    expect(tool?.auth).toEqual([{ type: "oauth2", valueFrom: { env: "PETSTORE_OAUTH_TOKEN" } }]);
    expect(tool?.credentialBindings).toEqual([
      { type: "bearer", token: { env: "PETSTORE_OAUTH_TOKEN" } },
    ]);

    await tool?.execute({ petId: "pet-123" });

    expect(requests[0]?.url.toString()).toBe("https://petstore.example.test/v1/pets/pet-123");
    expect(requests[0]?.headers.Authorization).toBe("Bearer secret-token");
  });

  it("honors dependency base URL overrides", async () => {
    const requests: URL[] = [];
    const [tool] = await buildApiManifestTools(
      {
        applicationName: "override-client",
        apiDependencies: {
          users: {
            apiDeploymentBaseUrl: "https://manifest.example.test",
            requests: [{ method: "get", uriTemplate: "/users/{id}" }],
          },
        },
      },
      {
        baseUrls: { users: "https://override.example.test/api" },
        executor: async (request) => {
          requests.push(request.url);
          return { status: 200, text: "ok" };
        },
        openApiDocuments: {
          users: openApiFixture({
            "/users/{id}": { get: operationFixture("getUser", "id") },
          }),
        },
      },
    );

    await tool?.execute({ id: "user-123" });

    expect(requests[0]?.toString()).toBe("https://override.example.test/api/users/user-123");
  });
});

function openApiFixture(paths: Record<string, Record<string, unknown>>) {
  return {
    openapi: "3.1.0",
    info: { title: "Fixture", version: "1.0.0" },
    paths,
  };
}

function operationFixture(operationId: string, pathParam?: string) {
  return {
    operationId,
    ...(pathParam
      ? {
          parameters: [
            {
              name: pathParam,
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
        }
      : {}),
    responses: {},
  };
}
