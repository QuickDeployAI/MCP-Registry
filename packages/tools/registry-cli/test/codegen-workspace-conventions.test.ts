import { describe, expect, it } from "vitest";
import {
  GENERATED_MCP_CODEGEN_ROOT,
  GENERATED_MCP_SHARED_TOOLING_PATH,
  REGISTRY_INDEX_OUTPUT_PATH,
  SERVERS_JSON_OUTPUT_PATH,
  capabilitySlug,
  familySlug,
  generatedMcpWorkspacePaths,
  providerSlug,
} from "../src/codegen/workspace-conventions";

describe("generated MCP workspace conventions", () => {
  it("builds deterministic manifest, test, and codegen paths", () => {
    expect(
      generatedMcpWorkspacePaths({
        provider: "Microsoft 365 / Microsoft Graph",
        family: "openapi-2-mcp",
        capability: "api",
      }),
    ).toEqual({
      provider: "microsoft-365-microsoft-graph",
      family: "openapi",
      capability: "api",
      manifestPath: "registry/microsoft-365-microsoft-graph/api.mcp.json",
      generatedTestPath:
        "packages/tools/registry-cli/test/generated/openapi/microsoft-365-microsoft-graph.test.ts",
      codegenProjectPath: ".generated/mcp-codegen/openapi/microsoft-365-microsoft-graph/",
      sharedToolingPath: "packages/tools/registry-cli/src/codegen",
    });
  });

  it("normalizes provider-safe slugs without path traversal characters", () => {
    expect(providerSlug("../ACME: Billing++")).toBe("acme-billing");
    expect(capabilitySlug("Events.MCP.JSON")).toBe("events");
    expect(familySlug("grpc-2-mcp")).toBe("grpc");
    expect(familySlug("feed")).toBe("feed");
  });

  it("names generated-only roots and outputs explicitly", () => {
    expect(GENERATED_MCP_CODEGEN_ROOT).toBe(".generated/mcp-codegen");
    expect(GENERATED_MCP_SHARED_TOOLING_PATH).toBe("packages/tools/registry-cli/src/codegen");
    expect(SERVERS_JSON_OUTPUT_PATH).toBe("servers.json");
    expect(REGISTRY_INDEX_OUTPUT_PATH).toBe("registry/index.json");
  });

  it("rejects empty or unsupported convention segments", () => {
    expect(() => providerSlug("///")).toThrow(/provider slug/);
    expect(() => capabilitySlug(".mcp.json")).toThrow(/capability slug/);
    expect(() => familySlug("postman-2-mcp")).toThrow(/Unsupported generated MCP family/);
  });
});
