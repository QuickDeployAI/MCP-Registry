import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHarMcpTools,
  convertHarToOpenApi,
  HarNotReviewedError,
  HarReviewError,
  loadHarArchive,
  reviewHarDraft,
} from "./index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

async function convertFixture() {
  const har = await loadHarArchive({ harPath: join(fixturesDir, "petstore.har") });
  return convertHarToOpenApi({ har, title: "Petstore HAR" });
}

describe("reviewHarDraft", () => {
  it("refuses to accept without an explicit accept: true", async () => {
    const { openapi, redactionReport } = await convertFixture();

    expect(() => reviewHarDraft({ draft: openapi, redactionReport, accept: false })).toThrow(
      HarReviewError,
    );
    expect(() => reviewHarDraft({ draft: openapi, redactionReport, accept: false })).toThrow(
      /must explicitly accept/i,
    );
  });

  it("refuses to review against a mismatched redaction report", async () => {
    const { openapi, redactionReport } = await convertFixture();
    const mismatched = { ...redactionReport, findings: [] };

    expect(() =>
      reviewHarDraft({ draft: openapi, redactionReport: mismatched, accept: true }),
    ).toThrow(/does not match/i);
  });

  it("marks the spec reviewed once accepted with the matching redaction report", async () => {
    const { openapi, redactionReport } = await convertFixture();

    const reviewed = reviewHarDraft({ draft: openapi, redactionReport, accept: true });

    expect(reviewed["x-quickdeploy-har-review"].status).toBe("reviewed");
    expect(reviewed["x-quickdeploy-har-review"].redactionFindingCount).toBe(
      redactionReport.findings.length,
    );
    expect(typeof reviewed["x-quickdeploy-har-review"].reviewedAt).toBe("string");
    // Original draft is left untouched.
    expect(openapi["x-quickdeploy-har-review"].status).toBe("draft");
  });
});

describe("buildHarMcpTools", () => {
  it("(c) refuses to serve an unreviewed draft spec", async () => {
    const { openapi } = await convertFixture();

    expect(() =>
      buildHarMcpTools({ spec: openapi, baseUrl: "https://petstore3.swagger.io" }),
    ).toThrow(HarNotReviewedError);
    expect(() =>
      buildHarMcpTools({ spec: openapi, baseUrl: "https://petstore3.swagger.io" }),
    ).toThrow(/refuses to serve an unreviewed/i);
  });

  it("(d) runs a reviewed spec through the openapi-2-mcp engine successfully", async () => {
    const { openapi, redactionReport } = await convertFixture();
    const reviewed = reviewHarDraft({ draft: openapi, redactionReport, accept: true });

    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const tools = buildHarMcpTools({
      spec: reviewed,
      baseUrl: "https://petstore3.swagger.io",
      env: {
        HAR_HEADER_AUTHORIZATION: "test-bearer-value",
        HAR_QUERY_API_KEY: "test-api-key-value",
        HAR_COOKIE_SESSION_ID: "test-session-value",
      },
      executor: async (request) => {
        seen.push({ url: request.url.toString(), headers: request.headers });
        return { status: 200, text: JSON.stringify({ id: 1, name: "Nori", status: "available" }) };
      },
    });

    expect(tools.length).toBeGreaterThan(0);
    const getPetTool = tools.find((tool) => tool.name.includes("get"));
    expect(getPetTool).toBeDefined();

    const result = await getPetTool?.execute({ petId: "1" });
    expect(result).toBe(JSON.stringify({ id: 1, name: "Nori", status: "available" }, null, 2));
    // Path param substituted, plus the redacted query/header/cookie credentials
    // re-applied from real (test) env vars rather than the captured HAR values.
    expect(seen[0]?.url).toBe(
      "https://petstore3.swagger.io/api/v3/pet/1?api_key=test-api-key-value",
    );
    expect(seen[0]?.headers).toMatchObject({
      Authorization: "Bearer test-bearer-value",
      Cookie: "session_id=test-session-value",
    });
  });

  it("fails clearly when a required credential env var is missing at serve time", async () => {
    const { openapi, redactionReport } = await convertFixture();
    const reviewed = reviewHarDraft({ draft: openapi, redactionReport, accept: true });

    expect(() =>
      buildHarMcpTools({ spec: reviewed, baseUrl: "https://petstore3.swagger.io", env: {} }),
    ).toThrow(/HAR_HEADER_AUTHORIZATION/);
  });
});
