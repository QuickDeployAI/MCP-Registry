import { describe, expect, it } from "vitest";
import type { OpenAPIV3 } from "openapi-types";
import { buildOpenApiTools } from "../src/index.js";

describe("openapi-2-mcp package", () => {
  it("builds executable tools on proxy-core and resolves env-backed auth", async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const [tool] = buildOpenApiTools(petstoreDoc(), "https://petstore.example", {
      auth: [{ type: "bearer", valueFrom: { env: "PETSTORE_TOKEN" } }],
      env: { PETSTORE_TOKEN: "secret-token" },
      executor: async (request) => {
        seen.push({ url: request.url.toString(), headers: request.headers });
        return { status: 200, text: JSON.stringify({ petId: "pet-1" }) };
      },
    });

    expect(tool?.name).toBe("getPetById");
    expect(await tool?.execute({ petId: "pet-1" })).toBe(
      JSON.stringify({ petId: "pet-1" }, null, 2),
    );
    expect(seen[0]).toMatchObject({
      url: "https://petstore.example/pets/pet-1",
      headers: { Authorization: "Bearer secret-token" },
    });
  });

  it("fails before startup when a required auth env var is missing", () => {
    expect(() =>
      buildOpenApiTools(petstoreDoc(), "https://petstore.example", {
        auth: [{ type: "api-key", name: "x-api-key", in: "header", valueFrom: { env: "API_KEY" } }],
        env: {},
      }),
    ).toThrow(/API_KEY/);
  });

  it("derives credentials from the document's securitySchemes for each supported auth scheme", async () => {
    const cases: Array<{
      schemeName: string;
      scheme: OpenAPIV3.SecuritySchemeObject;
      envVar: string;
      envValue: string;
      expect: (seen: { url: string; headers: Record<string, string> }) => void;
    }> = [
      {
        schemeName: "bearerAuth",
        scheme: { type: "http", scheme: "bearer" },
        envVar: "PETSTORE_TOKEN",
        envValue: "secret-token",
        expect: (seen) =>
          expect(seen.headers).toMatchObject({ Authorization: "Bearer secret-token" }),
      },
      {
        schemeName: "apiKeyHeaderAuth",
        scheme: { type: "apiKey", name: "x-api-key", in: "header" },
        envVar: "PETSTORE_API_KEY",
        envValue: "secret-key",
        expect: (seen) => expect(seen.headers).toMatchObject({ "x-api-key": "secret-key" }),
      },
      {
        schemeName: "apiKeyQueryAuth",
        scheme: { type: "apiKey", name: "api_key", in: "query" },
        envVar: "PETSTORE_API_KEY",
        envValue: "secret-key",
        expect: (seen) =>
          expect(seen.url).toBe("https://petstore.example/pets/pet-1?api_key=secret-key"),
      },
      {
        schemeName: "basicAuth",
        scheme: { type: "http", scheme: "basic" },
        envVar: "PETSTORE_BASIC",
        envValue: "user:pass",
        expect: (seen) =>
          expect(seen.headers).toMatchObject({
            Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
          }),
      },
      {
        schemeName: "oauth2Auth",
        scheme: {
          type: "oauth2",
          flows: {
            clientCredentials: { tokenUrl: "https://petstore.example/oauth/token", scopes: {} },
          },
        },
        envVar: "PETSTORE_OAUTH_TOKEN",
        envValue: "static-oauth-token",
        expect: (seen) =>
          expect(seen.headers).toMatchObject({ Authorization: "Bearer static-oauth-token" }),
      },
    ];

    for (const testCase of cases) {
      const seen: Array<{ url: string; headers: Record<string, string> }> = [];
      const [tool] = buildOpenApiTools(
        petstoreDoc({ [testCase.schemeName]: testCase.scheme }, [{ [testCase.schemeName]: [] }]),
        "https://petstore.example",
        {
          securityEnv: { [testCase.schemeName]: testCase.envVar },
          env: { [testCase.envVar]: testCase.envValue },
          executor: async (request) => {
            seen.push({ url: request.url.toString(), headers: request.headers });
            return { status: 200, text: "{}" };
          },
        },
      );

      await tool?.execute({ petId: "pet-1" });
      testCase.expect(seen[0]!);
    }
  });

  it("produces an actionable error instead of a silent 401 passthrough when required auth is missing", () => {
    expect(() =>
      buildOpenApiTools(
        petstoreDoc({ bearerAuth: { type: "http", scheme: "bearer" } }, [{ bearerAuth: [] }]),
        "https://petstore.example",
        { securityEnv: { bearerAuth: "PETSTORE_TOKEN" }, env: {} },
      ),
    ).toThrow(/PETSTORE_TOKEN/);
  });

  it("parses securitySchemes and applies the required credential per operation", async () => {
    const seen: Array<{ name: string; url: string; headers: Record<string, string> }> = [];
    const tools = buildOpenApiTools(petstoreWithAuthDoc(), "https://petstore.example", {
      auth: [
        { securityScheme: "headerApiKey", valueFrom: { env: "PETSTORE_HEADER_KEY" } },
        { securityScheme: "queryApiKey", valueFrom: { env: "PETSTORE_QUERY_KEY" } },
        { securityScheme: "cookieApiKey", valueFrom: { env: "PETSTORE_COOKIE_KEY" } },
        { securityScheme: "bearerAuth", valueFrom: { env: "PETSTORE_BEARER" } },
        { securityScheme: "basicAuth", valueFrom: { env: "PETSTORE_BASIC" } },
        { securityScheme: "oauthClient", valueFrom: { env: "PETSTORE_OAUTH_TOKEN" } },
      ],
      env: {
        PETSTORE_HEADER_KEY: "header-secret",
        PETSTORE_QUERY_KEY: "query-secret",
        PETSTORE_COOKIE_KEY: "cookie-secret",
        PETSTORE_BEARER: "bearer-secret",
        PETSTORE_BASIC: "user:secret",
        PETSTORE_OAUTH_TOKEN: "oauth-secret",
      },
      executor: async (request) => {
        seen.push({
          name: request.url.pathname.slice(1),
          url: request.url.toString(),
          headers: request.headers,
        });
        return { status: 200, text: "{}" };
      },
    });

    for (const tool of tools) {
      await tool.execute({});
    }

    expect(seen).toEqual([
      {
        name: "header",
        url: "https://petstore.example/header",
        headers: expect.objectContaining({ "x-api-key": "header-secret" }),
      },
      {
        name: "query",
        url: "https://petstore.example/query?api_key=query-secret",
        headers: expect.not.objectContaining({ "x-api-key": "header-secret" }),
      },
      {
        name: "cookie",
        url: "https://petstore.example/cookie",
        headers: expect.objectContaining({ Cookie: "session=cookie-secret" }),
      },
      {
        name: "bearer",
        url: "https://petstore.example/bearer",
        headers: expect.objectContaining({ Authorization: "Bearer bearer-secret" }),
      },
      {
        name: "basic",
        url: "https://petstore.example/basic",
        headers: expect.objectContaining({ Authorization: "Basic dXNlcjpzZWNyZXQ=" }),
      },
      {
        name: "oauth",
        url: "https://petstore.example/oauth",
        headers: expect.objectContaining({ Authorization: "Bearer oauth-secret" }),
      },
      {
        name: "public",
        url: "https://petstore.example/public",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    ]);
  });

  it("requires auth config for OpenAPI security schemes used by operations", () => {
    expect(() =>
      buildOpenApiTools(petstoreWithAuthDoc(), "https://petstore.example", {
        auth: [{ securityScheme: "headerApiKey", valueFrom: { env: "PETSTORE_HEADER_KEY" } }],
        env: { PETSTORE_HEADER_KEY: "header-secret" },
      }),
    ).toThrow(/queryApiKey/);
  });

  it("accepts one configured credential from an OpenAPI security alternative", async () => {
    const [tool] = buildOpenApiTools(alternativeAuthDoc(), "https://petstore.example", {
      auth: [{ securityScheme: "bearerAuth", valueFrom: { env: "PETSTORE_BEARER" } }],
      env: { PETSTORE_BEARER: "bearer-secret" },
      executor: async (request) => {
        expect(request.headers).toMatchObject({ Authorization: "Bearer bearer-secret" });
        return { status: 200, text: "{}" };
      },
    });

    await expect(tool?.execute({})).resolves.toBe(JSON.stringify({}, null, 2));
  });

  it("redacts resolved OpenAPI security scheme secrets from upstream errors", async () => {
    const [tool] = buildOpenApiTools(singleAuthDoc(), "https://petstore.example", {
      auth: [{ securityScheme: "bearerAuth", valueFrom: { env: "PETSTORE_BEARER" } }],
      env: { PETSTORE_BEARER: "bearer-secret" },
      executor: async () => {
        throw new Error("upstream rejected bearer-secret");
      },
    });

    await expect(tool?.execute({})).rejects.toThrow("upstream rejected [REDACTED]");
  });
});

function petstoreDoc(
  securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject>,
  security?: OpenAPIV3.SecurityRequirementObject[],
): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1.0.0" },
    ...(securitySchemes ? { components: { securitySchemes } } : {}),
    ...(security ? { security } : {}),
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

function petstoreWithAuthDoc(): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Authenticated Petstore", version: "1.0.0" },
    components: {
      securitySchemes: {
        headerApiKey: { type: "apiKey", name: "x-api-key", in: "header" },
        queryApiKey: { type: "apiKey", name: "api_key", in: "query" },
        cookieApiKey: { type: "apiKey", name: "session", in: "cookie" },
        bearerAuth: { type: "http", scheme: "bearer" },
        basicAuth: { type: "http", scheme: "basic" },
        oauthClient: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: "https://petstore.example/oauth/token",
              scopes: {},
            },
          },
        },
      },
    },
    paths: {
      "/header": {
        get: {
          operationId: "header",
          security: [{ headerApiKey: [] }],
          responses: {},
        },
      },
      "/query": {
        get: {
          operationId: "query",
          security: [{ queryApiKey: [] }],
          responses: {},
        },
      },
      "/cookie": {
        get: {
          operationId: "cookie",
          security: [{ cookieApiKey: [] }],
          responses: {},
        },
      },
      "/bearer": {
        get: {
          operationId: "bearer",
          security: [{ bearerAuth: [] }],
          responses: {},
        },
      },
      "/basic": {
        get: {
          operationId: "basic",
          security: [{ basicAuth: [] }],
          responses: {},
        },
      },
      "/oauth": {
        get: {
          operationId: "oauth",
          security: [{ oauthClient: [] }],
          responses: {},
        },
      },
      "/public": {
        get: {
          operationId: "public",
          security: [],
          responses: {},
        },
      },
    },
  };
}

function singleAuthDoc(): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Authenticated Petstore", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          security: [{ bearerAuth: [] }],
          responses: {},
        },
      },
    },
  };
}

function alternativeAuthDoc(): OpenAPIV3.Document {
  return {
    openapi: "3.1.0",
    info: { title: "Authenticated Petstore", version: "1.0.0" },
    components: {
      securitySchemes: {
        headerApiKey: { type: "apiKey", name: "x-api-key", in: "header" },
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          security: [{ headerApiKey: [] }, { bearerAuth: [] }],
          responses: {},
        },
      },
    },
  };
}
