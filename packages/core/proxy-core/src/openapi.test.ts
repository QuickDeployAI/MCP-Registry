import { describe, expect, it } from "vitest";
import type { OpenAPIV3 } from "openapi-types";
import { buildBody, buildUrl, openApiToProxyTools, parseVersion, schemaToZod } from "./openapi.js";

describe("OpenAPI proxy core", () => {
  it("maps OpenAPI operations to executable proxy tools", async () => {
    const requests: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: unknown;
    }> = [];
    const [tool] = openApiToProxyTools(petstoreDoc(), "https://petstore.example", {
      credentials: [
        {
          type: "bearer",
          valueFrom: { env: "PETSTORE_TOKEN" },
          value: "secret-token",
        },
      ],
      executor: async (request) => {
        requests.push({ ...request, url: request.url.toString() });
        return { status: 200, text: JSON.stringify({ ok: true }) };
      },
    });

    expect(tool?.name).toBe("getPetById");
    expect(await tool?.execute({ petId: "pet-1", expand: "owner" })).toBe(
      JSON.stringify({ ok: true }, null, 2),
    );
    expect(requests).toEqual([
      {
        url: "https://petstore.example/pets/pet-1?expand=owner",
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer secret-token",
        },
      },
    ]);
  });

  it("redacts secret values from executor errors", async () => {
    const [tool] = openApiToProxyTools(petstoreDoc(), "https://petstore.example", {
      credentials: [
        {
          type: "api-key",
          name: "x-api-key",
          in: "header",
          valueFrom: { env: "PETSTORE_API_KEY" },
          value: "secret-key",
        },
      ],
      executor: async () => {
        throw new Error("upstream rejected secret-key");
      },
    });

    await expect(tool?.execute({ petId: "pet-1" })).rejects.toThrow("upstream rejected [REDACTED]");
  });

  it("applies only credentials required by each OpenAPI operation", async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const tools = openApiToProxyTools(authenticatedPetstoreDoc(), "https://petstore.example", {
      credentials: [
        {
          type: "api-key",
          securityScheme: "headerApiKey",
          name: "x-api-key",
          in: "header",
          valueFrom: { env: "HEADER_KEY" },
          value: "header-secret",
        },
        {
          type: "bearer",
          securityScheme: "bearerAuth",
          valueFrom: { env: "BEARER_TOKEN" },
          value: "bearer-secret",
        },
      ],
      executor: async (request) => {
        requests.push({ url: request.url.toString(), headers: request.headers });
        return { status: 200, text: "{}" };
      },
    });

    await tools.find((tool) => tool.name === "listPets")?.execute({});
    await tools.find((tool) => tool.name === "createPet")?.execute({});
    await tools.find((tool) => tool.name === "publicStatus")?.execute({});

    expect(requests).toEqual([
      {
        url: "https://petstore.example/pets",
        headers: expect.objectContaining({ "x-api-key": "header-secret" }),
      },
      {
        url: "https://petstore.example/pets",
        headers: expect.objectContaining({ Authorization: "Bearer bearer-secret" }),
      },
      {
        url: "https://petstore.example/status",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    ]);
  });

  it("builds URLs and bodies with path, query, and auth query placement", () => {
    const url = buildUrl(
      "https://petstore.example",
      "/pets/{petId}",
      { petId: "pet 1", limit: 2, name: "Miso" },
      ["petId"],
      ["name"],
      [
        {
          type: "api-key",
          name: "api_key",
          in: "query",
          valueFrom: { env: "PETSTORE_API_KEY" },
          value: "secret",
        },
      ],
    );

    expect(url.toString()).toBe("https://petstore.example/pets/pet%201?limit=2&api_key=secret");
    expect(buildBody(["name"], { name: "Miso" })).toEqual({ name: "Miso" });
  });

  it("converts schema primitives and versions", () => {
    expect(schemaToZod({ type: "integer" }, true).safeParse(3).success).toBe(true);
    expect(schemaToZod({ type: "integer" }, true).safeParse(3.14).success).toBe(false);
    expect(parseVersion("v2")).toBe("2.0.0");
  });
});

function petstoreDoc(): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1.0.0" },
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPetById",
          parameters: [
            {
              name: "petId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "expand",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {},
        },
      },
    },
  };
}

describe("OpenAPI securitySchemes wiring", () => {
  it("derives bearer credentials from components.securitySchemes and document-level security", async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("bearerAuth"),
      "https://petstore.example",
      {
        securityEnv: { bearerAuth: "PETSTORE_TOKEN" },
        env: { PETSTORE_TOKEN: "secret-token" },
        executor: async (request) => {
          requests.push({ url: request.url.toString(), headers: request.headers });
          return { status: 200, text: JSON.stringify({ ok: true }) };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]).toMatchObject({ headers: { Authorization: "Bearer secret-token" } });
  });

  it("derives api-key header credentials from securitySchemes", async () => {
    const requests: Array<{ headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("apiKeyHeaderAuth"),
      "https://petstore.example",
      {
        securityEnv: { apiKeyHeaderAuth: "PETSTORE_API_KEY" },
        env: { PETSTORE_API_KEY: "secret-key" },
        executor: async (request) => {
          requests.push({ headers: request.headers });
          return { status: 200, text: "{}" };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.headers).toMatchObject({ "x-api-key": "secret-key" });
  });

  it("derives api-key query credentials from securitySchemes", async () => {
    const requests: Array<{ url: string }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("apiKeyQueryAuth"),
      "https://petstore.example",
      {
        securityEnv: { apiKeyQueryAuth: "PETSTORE_API_KEY" },
        env: { PETSTORE_API_KEY: "secret-key" },
        executor: async (request) => {
          requests.push({ url: request.url.toString() });
          return { status: 200, text: "{}" };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.url).toBe("https://petstore.example/pets/pet-1?api_key=secret-key");
  });

  it("derives api-key cookie credentials from securitySchemes", async () => {
    const requests: Array<{ headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("apiKeyCookieAuth"),
      "https://petstore.example",
      {
        securityEnv: { apiKeyCookieAuth: "PETSTORE_SESSION" },
        env: { PETSTORE_SESSION: "secret-session" },
        executor: async (request) => {
          requests.push({ headers: request.headers });
          return { status: 200, text: "{}" };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.headers.Cookie).toBe("session=secret-session");
  });

  it("derives basic credentials from securitySchemes", async () => {
    const requests: Array<{ headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("basicAuth"),
      "https://petstore.example",
      {
        securityEnv: { basicAuth: "PETSTORE_BASIC" },
        env: { PETSTORE_BASIC: "user:pass" },
        executor: async (request) => {
          requests.push({ headers: request.headers });
          return { status: 200, text: "{}" };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
    });
  });

  it("derives a static oauth2 client-credentials token from securitySchemes", async () => {
    const requests: Array<{ headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(
      petstoreWithAuthDoc("oauth2Auth"),
      "https://petstore.example",
      {
        securityEnv: { oauth2Auth: "PETSTORE_OAUTH_TOKEN" },
        env: { PETSTORE_OAUTH_TOKEN: "static-oauth-token" },
        executor: async (request) => {
          requests.push({ headers: request.headers });
          return { status: 200, text: "{}" };
        },
      },
    );

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.headers).toMatchObject({ Authorization: "Bearer static-oauth-token" });
  });

  it("respects operation-level security overriding document-level security", async () => {
    const doc = petstoreWithAuthDoc("bearerAuth");
    doc.paths!["/pets/{petId}"]!.get!.security = [];

    const requests: Array<{ headers: Record<string, string> }> = [];
    const [tool] = openApiToProxyTools(doc, "https://petstore.example", {
      securityEnv: { bearerAuth: "PETSTORE_TOKEN" },
      env: {},
      executor: async (request) => {
        requests.push({ headers: request.headers });
        return { status: 200, text: "{}" };
      },
    });

    await tool?.execute({ petId: "pet-1" });
    expect(requests[0]?.headers.Authorization).toBeUndefined();
  });

  it("fails before any request when the securityEnv mapping is missing", () => {
    expect(() =>
      openApiToProxyTools(petstoreWithAuthDoc("bearerAuth"), "https://petstore.example", {
        env: { PETSTORE_TOKEN: "secret-token" },
      }),
    ).toThrow(/securityEnv/);
  });

  it("fails with an actionable error instead of a silent passthrough when the credential env var is unset", () => {
    expect(() =>
      openApiToProxyTools(petstoreWithAuthDoc("bearerAuth"), "https://petstore.example", {
        securityEnv: { bearerAuth: "PETSTORE_TOKEN" },
        env: {},
      }),
    ).toThrow(/PETSTORE_TOKEN/);
  });
});

function petstoreWithAuthDoc(
  schemeName:
    | "bearerAuth"
    | "apiKeyHeaderAuth"
    | "apiKeyQueryAuth"
    | "apiKeyCookieAuth"
    | "basicAuth"
    | "oauth2Auth",
): OpenAPIV3.Document {
  const securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject> = {
    bearerAuth: { type: "http", scheme: "bearer" },
    apiKeyHeaderAuth: { type: "apiKey", name: "x-api-key", in: "header" },
    apiKeyQueryAuth: { type: "apiKey", name: "api_key", in: "query" },
    apiKeyCookieAuth: { type: "apiKey", name: "session", in: "cookie" },
    basicAuth: { type: "http", scheme: "basic" },
    oauth2Auth: {
      type: "oauth2",
      flows: {
        clientCredentials: {
          tokenUrl: "https://petstore.example/oauth/token",
          scopes: {},
        },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: { title: "Petstore with auth", version: "1.0.0" },
    components: { securitySchemes },
    security: [{ [schemeName]: [] }],
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPetById",
          parameters: [
            {
              name: "petId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {},
        },
      },
    },
  };
}

function authenticatedPetstoreDoc(): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1.0.0" },
    components: {
      securitySchemes: {
        headerApiKey: { type: "apiKey", name: "x-api-key", in: "header" },
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ headerApiKey: [] }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          responses: {},
        },
        post: {
          operationId: "createPet",
          security: [{ bearerAuth: [] }],
          responses: {},
        },
      },
      "/status": {
        get: {
          operationId: "publicStatus",
          security: [],
          responses: {},
        },
      },
    },
  };
}
