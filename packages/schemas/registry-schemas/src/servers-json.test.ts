import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_CURATION_META_KEY,
  QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY,
  ServersJsonSchema,
  extractOfficialServerJsonSchemaVintage,
  quickDeployRegistryCuration,
  serverJsonEntries,
  serverJsonEntryKinds,
} from "./servers-json";

const schema2025_09_29 = "https://modelcontextprotocol.io/schemas/2025-09-29/server.schema.json";
const schema2025_12_11 = "https://modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

describe("ServersJsonSchema", () => {
  it("accepts packages-based, manifest-backed, and remotes-only entries", () => {
    const doc = ServersJsonSchema.parse({
      $schema: "https://quickdeploy.ai/schemas/servers-json.schema.json",
      servers: [
        {
          $schema: schema2025_12_11,
          name: "com.github.filesystem",
          version: "1.0.0",
          description: "Runs from an installable package.",
          packages: [
            {
              registryType: "npm",
              identifier: "@modelcontextprotocol/server-filesystem",
              version: "1.0.0",
            },
          ],
          _meta: {
            [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
              verifiedStatus: "verified",
              category: "developer-tools",
              isOfficial: true,
              isPaid: false,
              tags: ["files", "local"],
            },
          },
        },
        {
          $schema: schema2025_12_11,
          name: "ai.quickdeploy.petstore",
          version: "0.1.0",
          packages: [
            {
              registryType: "oci",
              identifier: "ghcr.io/quickdeployai/mcp-host",
            },
          ],
          _meta: {
            [QUICKDEPLOY_REGISTRY_MANIFEST_META_KEY]: {
              apiVersion: "ai.quickdeploy.registry/v1",
              spec: { importer: "openapi-2-mcp" },
            },
          },
        },
        {
          $schema: schema2025_09_29,
          name: "com.linear.remote",
          description: "External hosted MCP endpoint.",
          remotes: [
            {
              type: "streamable-http",
              url: "https://mcp.linear.app/mcp",
            },
          ],
          _meta: {
            [QUICKDEPLOY_REGISTRY_CURATION_META_KEY]: {
              verifiedStatus: "review",
              category: "productivity",
              tags: ["linear"],
            },
          },
        },
      ],
    });

    const entries = serverJsonEntries(doc);
    expect(entries).toHaveLength(3);
    expect(serverJsonEntryKinds(entries[0])).toEqual(["packages-based"]);
    expect(serverJsonEntryKinds(entries[1])).toEqual(["packages-based", "manifest-backed"]);
    expect(serverJsonEntryKinds(entries[2])).toEqual(["remotes-only"]);
    expect(quickDeployRegistryCuration(entries[0])).toMatchObject({
      verifiedStatus: "verified",
      category: "developer-tools",
      isOfficial: true,
      isPaid: false,
      tags: ["files", "local"],
    });
  });

  it("accepts a bare array root for tools that emit plain server lists", () => {
    const doc = ServersJsonSchema.parse([
      {
        name: "com.context7.remote",
        remotes: [{ type: "streamable-http", url: "https://mcp.context7.com/mcp" }],
      },
    ]);

    expect(serverJsonEntries(doc)[0].name).toBe("com.context7.remote");
  });

  it("rejects QuickDeploy curation at the server document top level", () => {
    const result = ServersJsonSchema.safeParse({
      servers: [
        {
          name: "com.example.bad",
          category: "developer-tools",
          tags: ["bad"],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "servers.0.category",
      "servers.0.tags",
    ]);
  });

  it("rejects unknown explicit official schema vintages", () => {
    const result = ServersJsonSchema.safeParse([
      {
        $schema: "https://modelcontextprotocol.io/schemas/2026-07-28/server.schema.json",
        name: "com.example.future",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([0, "$schema"]);
  });
});

describe("extractOfficialServerJsonSchemaVintage", () => {
  it("identifies supported official schema vintages", () => {
    expect(extractOfficialServerJsonSchemaVintage(schema2025_09_29)).toBe("2025-09-29");
    expect(extractOfficialServerJsonSchemaVintage(schema2025_12_11)).toBe("2025-12-11");
    expect(extractOfficialServerJsonSchemaVintage(undefined)).toBeNull();
  });
});
