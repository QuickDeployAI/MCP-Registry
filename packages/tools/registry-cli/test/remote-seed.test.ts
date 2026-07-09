import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  QUICKDEPLOY_REGISTRY_CURATION_META_KEY,
  OfficialServerJsonDocumentSchema,
  quickDeployRegistryCuration,
} from "@quickdeployai/registry-schemas";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const remoteDir = join(repoRoot, "manifests", "remotes");

describe("remote catalog seed", () => {
  it("keeps the remote authoring template schema-valid but unpublished", async () => {
    const template = OfficialServerJsonDocumentSchema.parse(
      JSON.parse(await readFile(join(remoteDir, "_template.server.json"), "utf8")),
    );

    expect(template.name).toBe("com.example/hosted-mcp");
    expect(template.remotes?.[0]).toMatchObject({
      type: "streamable-http",
      url: "https://mcp.example.com/{tenant_id}/mcp",
    });
    expect(template.remotes?.[0]?.headers?.[0]).toMatchObject({
      name: "Authorization",
      value: "Bearer ${EXAMPLE_MCP_API_TOKEN}",
      isSecret: true,
    });
    expect(template.remotes?.[0]?.variables).toHaveProperty("tenant_id");
    expect(quickDeployRegistryCuration(template)?.tags).toContain("remote");
  });

  it("keeps official hosted remote entries validated and curated", async () => {
    const files = (await readdir(remoteDir)).filter(
      (name) => !name.startsWith("_") && name.endsWith(".server.json"),
    );
    const entries = await Promise.all(
      files.map(async (file) =>
        OfficialServerJsonDocumentSchema.parse(
          JSON.parse(await readFile(join(remoteDir, file), "utf8")),
        ),
      ),
    );

    expect(entries).toHaveLength(23);
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "ai.llamaindex/llamaparse-mcp",
      "com.atlassian/rovo-mcp",
      "com.cloudflare/ai-gateway-mcp",
      "com.cloudflare/api-mcp",
      "com.cloudflare/browser-mcp",
      "com.cloudflare/docs-mcp",
      "com.cloudflare/observability-mcp",
      "com.cloudflare/workers-bindings-mcp",
      "com.cloudflare/workers-builds-mcp",
      "com.confluent/managed-mcp",
      "com.context7/mcp",
      "com.getdbt/platform-mcp",
      "com.github.copilot/mcp",
      "com.hubspot/crm-mcp",
      "com.linear/mcp",
      "com.notion/mcp",
      "com.postman/mcp",
      "com.slack/mcp",
      "com.supabase/mcp",
      "com.vercel/mcp",
      "io.home-assistant/mcp-server",
      "io.sentry/mcp",
      "tech.neon/mcp",
    ]);

    for (const entry of entries) {
      const curation = quickDeployRegistryCuration(entry);
      expect(entry.remotes?.[0]?.url, entry.name).toMatch(/^https:\/\//);
      expect(curation?.verifiedStatus, entry.name).toBe("review");
      expect(curation?.isOfficial, entry.name).toBe(true);
      expect(curation?.category, entry.name).toBeTruthy();
      expect(curation?.tags, entry.name).toContain("remote");
      expect(entry._meta?.[QUICKDEPLOY_REGISTRY_CURATION_META_KEY], entry.name).toBeTruthy();
      expect(entry._meta?.["ai.quickdeploy.registry/auth"], entry.name).toBeTruthy();
    }
  });
});
