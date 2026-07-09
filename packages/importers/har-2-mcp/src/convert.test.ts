import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertHarToOpenApi, harConversionToMcpManifestSelect, loadHarArchive } from "./index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

async function convertFixture() {
  const har = await loadHarArchive({ harPath: join(fixturesDir, "petstore.har") });
  return convertHarToOpenApi({ har, title: "Petstore HAR" });
}

describe("convertHarToOpenApi", () => {
  it("produces an unreviewed draft spec with parameterized paths, inferred schemas, and noise dropped", async () => {
    const result = await convertFixture();

    // (a) draft spec is produced correctly
    expect(result.openapi["x-quickdeploy-har-review"]).toEqual({
      status: "draft",
      redactionFindingCount: result.redactionReport.findings.length,
    });
    expect(result.openapi).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Petstore HAR", version: "0.1.0" },
      servers: [{ url: "https://petstore3.swagger.io" }],
    });

    // The two /pet/{n} GETs collapse into one auto-parameterized operation.
    const getPet = result.openapi.paths["/api/v3/pet/{petId}"]?.get;
    expect(getPet).toBeDefined();
    expect(getPet?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "petId", in: "path", required: true }),
      ]),
    );
    expect(getPet?.["x-quickdeploy-har"]).toMatchObject({
      method: "GET",
      path: "/api/v3/pet/{petId}",
      sampleCount: 2,
    });
    expect(getPet?.responses["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              status: { type: "string" },
            },
          },
        },
      },
    });

    // The captured POST body is inferred into a request schema.
    const createPet = result.openapi.paths["/api/v3/pet"]?.post;
    expect(createPet?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { id: { type: "integer" }, name: { type: "string" } },
          },
        },
      },
    });

    // Analytics beacon and static asset entries never become paths/tools.
    expect(Object.keys(result.openapi.paths)).toHaveLength(2);
    expect(result.openapi.paths["/collect"]).toBeUndefined();
    for (const path of Object.keys(result.openapi.paths)) {
      expect(path).not.toMatch(/\.css$/);
    }

    // Single-example schema inference is called out explicitly as a review risk.
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "single-example-schema" })]),
    );
  });

  it("builds manifest request selectors from the converted operations", async () => {
    const result = await convertFixture();

    expect(harConversionToMcpManifestSelect(result)).toEqual({
      requests: expect.arrayContaining([
        { method: "GET", uriTemplate: "/api/v3/pet/{petId}" },
        { method: "POST", uriTemplate: "/api/v3/pet" },
      ]),
    });
  });

  it("(b) flags the fixture's captured auth header, api key query param, and session cookie", async () => {
    const result = await convertFixture();
    const findings = result.redactionReport.findings;

    expect(result.redactionReport.source).toBe("har-capture");
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: "header",
          name: "authorization",
          reason: "authorization-header",
        }),
        expect.objectContaining({
          location: "query",
          name: "api_key",
          reason: "sensitive-name-pattern",
        }),
        expect.objectContaining({
          location: "cookie",
          name: "session_id",
          reason: "sensitive-name-pattern",
        }),
      ]),
    );

    // Raw secret values must never appear in the findings — only masked samples.
    for (const finding of findings) {
      expect(finding.sample).not.toContain("apikey-FAKEexample-not-a-real-secret-000111");
      expect(finding.sample).not.toContain("sess_FAKEabc123sessiontoken");
    }

    // ...and the draft spec's security schemes reference env vars, never the raw captured secret.
    const serialized = JSON.stringify(result.openapi);
    expect(serialized).not.toContain("apikey-FAKEexample-not-a-real-secret-000111");
    expect(serialized).not.toContain("sess_FAKEabc123sessiontoken");
    expect(serialized).not.toContain("FAKE-fixture-signature-not-a-real-secret");
    expect(result.openapi.components.securitySchemes).toMatchObject({
      HAR_HEADER_AUTHORIZATION: { type: "http", scheme: "bearer" },
      HAR_QUERY_API_KEY: { type: "apiKey", in: "query", name: "api_key" },
      HAR_COOKIE_SESSION_ID: { type: "apiKey", in: "cookie", name: "session_id" },
    });
  });
});
