import { describe, expect, it } from "vitest";
import {
  ImporterConfigError,
  applyCredentialToRequest,
  readEnvCredential,
  redactCredentialValues,
} from "./auth.js";

describe("importer auth helpers", () => {
  it("reads env-backed bearer credentials and applies Authorization headers", () => {
    const credential = readEnvCredential(
      { type: "bearer", valueFrom: { env: "PETSTORE_TOKEN" } },
      { PETSTORE_TOKEN: "secret-token" },
    );

    expect(applyCredentialToRequest(credential)).toEqual({
      headers: { Authorization: "Bearer secret-token" },
      query: {},
      cookies: {},
    });
  });

  it("supports API key placement in headers, query strings, and cookies", () => {
    expect(
      applyCredentialToRequest({
        type: "api-key",
        name: "x-api-key",
        in: "header",
        valueFrom: { env: "API_KEY" },
        value: "secret",
      }),
    ).toMatchObject({ headers: { "x-api-key": "secret" } });
    expect(
      applyCredentialToRequest({
        type: "api-key",
        name: "api_key",
        in: "query",
        valueFrom: { env: "API_KEY" },
        value: "secret",
      }),
    ).toMatchObject({ query: { api_key: "secret" } });
    expect(
      applyCredentialToRequest({
        type: "api-key",
        name: "session",
        in: "cookie",
        valueFrom: { env: "API_KEY" },
        value: "secret",
      }),
    ).toMatchObject({ cookies: { session: "secret" } });
  });

  it("fails fast with the missing env var name", () => {
    expect(() =>
      readEnvCredential({ type: "oauth2", valueFrom: { env: "PETSTORE_OAUTH_TOKEN" } }, {}),
    ).toThrow(ImporterConfigError);
    expect(() =>
      readEnvCredential({ type: "oauth2", valueFrom: { env: "PETSTORE_OAUTH_TOKEN" } }, {}),
    ).toThrow(/PETSTORE_OAUTH_TOKEN/);
  });

  it("redacts resolved secret values from diagnostics", () => {
    const credential = readEnvCredential(
      { type: "basic", valueFrom: { env: "PETSTORE_BASIC" } },
      { PETSTORE_BASIC: "user:secret" },
    );

    expect(redactCredentialValues("upstream rejected user:secret", [credential])).toBe(
      "upstream rejected [REDACTED]",
    );
  });
});
