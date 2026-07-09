import { describe, expect, it, vi } from "vitest";
import {
  applyCredentialBindingsToUrl,
  credentialBindingsFromMcpAuth,
  credentialBindingsFromOpenApiSecuritySchemes,
  credentialEnvironmentVariables,
  redactCredentialSecrets,
  resolveCredentialBindings,
  type CredentialBinding,
} from "./bindings.js";

describe("importer credential bindings", () => {
  it("resolves bearer tokens and header API keys from env without exposing values", async () => {
    const bindings: CredentialBinding[] = [
      { type: "bearer", token: { env: "PETSTORE_TOKEN" } },
      { type: "api-key", in: "header", name: "x-api-key", value: { env: "PETSTORE_API_KEY" } },
    ];

    const resolved = await resolveCredentialBindings(bindings, {
      env: {
        PETSTORE_TOKEN: "bearer-secret",
        PETSTORE_API_KEY: "key-secret",
      },
    });

    expect(resolved.headers).toEqual({
      authorization: "Bearer bearer-secret",
      "x-api-key": "key-secret",
    });
    expect(resolved.query).toEqual({});
    expect(
      redactCredentialSecrets("Authorization=Bearer bearer-secret x-api-key=key-secret", resolved),
    ).toBe("Authorization=Bearer [REDACTED] x-api-key=[REDACTED]");
  });

  it("applies query API keys to request URLs", async () => {
    const resolved = await resolveCredentialBindings(
      [{ type: "api-key", in: "query", name: "api_key", value: { env: "PETSTORE_API_KEY" } }],
      { env: { PETSTORE_API_KEY: "query-secret" } },
    );

    expect(applyCredentialBindingsToUrl("https://api.example.test/pets?limit=10", resolved)).toBe(
      "https://api.example.test/pets?limit=10&api_key=query-secret",
    );
  });

  it("resolves basic credentials as an authorization header", async () => {
    const resolved = await resolveCredentialBindings(
      [
        {
          type: "basic",
          username: { env: "PETSTORE_USER" },
          password: { env: "PETSTORE_PASSWORD" },
        },
      ],
      { env: { PETSTORE_USER: "aladdin", PETSTORE_PASSWORD: "open-sesame" } },
    );

    expect(resolved.headers.authorization).toBe("Basic YWxhZGRpbjpvcGVuLXNlc2FtZQ==");
    expect(redactCredentialSecrets(resolved.headers.authorization ?? "", resolved)).toBe(
      "Basic [REDACTED]",
    );
  });

  it("exchanges static OAuth2 client credentials through an injected token requester", async () => {
    const requestOAuth2Token = vi.fn(async () => ({
      accessToken: "oauth-access-token",
      tokenType: "Bearer" as const,
    }));

    const resolved = await resolveCredentialBindings(
      [
        {
          type: "oauth2-client-credentials",
          tokenUrl: "https://issuer.example.test/oauth/token",
          clientId: { env: "OAUTH_CLIENT_ID" },
          clientSecret: { env: "OAUTH_CLIENT_SECRET" },
          scopes: ["pets:read"],
        },
      ],
      {
        env: {
          OAUTH_CLIENT_ID: "client-id",
          OAUTH_CLIENT_SECRET: "client-secret",
        },
        requestOAuth2Token,
      },
    );

    expect(requestOAuth2Token).toHaveBeenCalledWith({
      tokenUrl: "https://issuer.example.test/oauth/token",
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: ["pets:read"],
    });
    expect(resolved.headers.authorization).toBe("Bearer oauth-access-token");
  });

  it("reports only secret env keys for server.json environmentVariables", () => {
    expect(
      credentialEnvironmentVariables([
        { type: "bearer", token: { env: "PETSTORE_TOKEN" } },
        { type: "api-key", in: "query", name: "api_key", value: { env: "PETSTORE_API_KEY" } },
        {
          type: "basic",
          username: { env: "PETSTORE_USER" },
          password: { env: "PETSTORE_PASSWORD" },
        },
      ]),
    ).toEqual([
      { name: "PETSTORE_TOKEN", isSecret: true },
      { name: "PETSTORE_API_KEY", isSecret: true },
      { name: "PETSTORE_USER", isSecret: true },
      { name: "PETSTORE_PASSWORD", isSecret: true },
    ]);
  });

  it("maps manifest spec.auth entries to credential bindings", () => {
    expect(
      credentialBindingsFromMcpAuth([
        { type: "bearer", valueFrom: { env: "PETSTORE_TOKEN" } },
        {
          type: "api-key",
          in: "header",
          name: "x-api-key",
          valueFrom: { env: "PETSTORE_API_KEY" },
        },
        {
          type: "basic",
          usernameFrom: { env: "PETSTORE_USER" },
          passwordFrom: { env: "PETSTORE_PASSWORD" },
        },
        {
          type: "oauth2",
          tokenUrl: "https://issuer.example.test/oauth/token",
          clientIdFrom: { env: "OAUTH_CLIENT_ID" },
          clientSecretFrom: { env: "OAUTH_CLIENT_SECRET" },
          scopes: ["pets:read"],
        },
      ]),
    ).toEqual([
      { type: "bearer", token: { env: "PETSTORE_TOKEN" } },
      { type: "api-key", in: "header", name: "x-api-key", value: { env: "PETSTORE_API_KEY" } },
      {
        type: "basic",
        username: { env: "PETSTORE_USER" },
        password: { env: "PETSTORE_PASSWORD" },
      },
      {
        type: "oauth2-client-credentials",
        tokenUrl: "https://issuer.example.test/oauth/token",
        clientId: { env: "OAUTH_CLIENT_ID" },
        clientSecret: { env: "OAUTH_CLIENT_SECRET" },
        scopes: ["pets:read"],
      },
    ]);
  });

  it("maps OpenAPI securitySchemes to env-backed credential bindings", () => {
    expect(
      credentialBindingsFromOpenApiSecuritySchemes({
        bearerAuth: { type: "http", scheme: "bearer" },
        apiHeader: { type: "apiKey", in: "header", name: "x-api-key" },
        apiQuery: { type: "apiKey", in: "query", name: "api_key" },
        basicAuth: { type: "http", scheme: "basic" },
        oauthClient: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: "https://issuer.example.test/oauth/token",
              scopes: { "pets:read": "Read pets" },
            },
          },
        },
      }),
    ).toEqual([
      { type: "bearer", token: { env: "BEARER_AUTH_TOKEN" } },
      { type: "api-key", in: "header", name: "x-api-key", value: { env: "API_HEADER_API_KEY" } },
      { type: "api-key", in: "query", name: "api_key", value: { env: "API_QUERY_API_KEY" } },
      {
        type: "basic",
        username: { env: "BASIC_AUTH_USERNAME" },
        password: { env: "BASIC_AUTH_PASSWORD" },
      },
      {
        type: "oauth2-client-credentials",
        tokenUrl: "https://issuer.example.test/oauth/token",
        clientId: { env: "OAUTH_CLIENT_CLIENT_ID" },
        clientSecret: { env: "OAUTH_CLIENT_CLIENT_SECRET" },
        scopes: ["pets:read"],
      },
    ]);
  });
});
