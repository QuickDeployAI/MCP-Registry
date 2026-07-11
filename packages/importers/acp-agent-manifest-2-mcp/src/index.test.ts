import { describe, expect, it } from "vitest";
import { ACP_AGENT_MANIFEST_MEDIA_TYPE, type ArdEntry } from "@quickdeployai/registry-schemas/ard";
import {
  acpAgentManifestArtifactParser,
  createAcpAgentManifestArtifactParser,
  parseAcpAgentManifest,
} from "./index";

const entry: ArdEntry = {
  identifier: "urn:air:quickdeploy.ai:agent:research-assistant",
  displayName: "Research Assistant",
  type: ACP_AGENT_MANIFEST_MEDIA_TYPE,
  data: {},
};

describe("ACP agent-manifest ArtifactParser", () => {
  it("emits one agent and every declared skill while preserving raw slices", async () => {
    const manifest = {
      agent_id: "research-assistant",
      name: "Research Assistant",
      description: "Finds and summarizes primary sources.",
      transport: "acp",
      skills: [
        {
          id: "search",
          name: "search-primary-sources",
          description: "Search primary sources.",
          input_schema: { type: "object", properties: { query: { type: "string" } } },
        },
        "summarize-source",
      ],
    };

    const result = await acpAgentManifestArtifactParser.parse(manifest, entry);

    expect(acpAgentManifestArtifactParser.mediaTypes).toEqual([
      ACP_AGENT_MANIFEST_MEDIA_TYPE,
    ]);
    expect(result.capabilities.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: "agent", name: "Research Assistant" },
      { kind: "skill", name: "search-primary-sources" },
      { kind: "skill", name: "summarize-source" },
    ]);
    expect(result.capabilities[0]?.raw).toBe(manifest);
    expect(result.capabilities[1]?.raw).toBe(manifest.skills[0]);
  });

  it.each([
    [{ transport: "slim" }, "slim"],
    [{ locators: [{ type: "acp", url: "https://agent.example.test/acp" }] }, "acp"],
    [{ locators: [{ type: "https", url: "https://agent.example.test" }] }, "http"],
  ] as const)("resolves invocation transport from %o", async (transportFields, expected) => {
    const result = await parseAcpAgentManifest(
      { name: "Agent", skills: [{ name: "help" }], ...transportFields },
      entry,
    );
    expect(result.transport).toBe(expected);
    expect(result.diagnostics.at(-1)?.message).toContain(`transport resolved as "${expected}"`);
  });

  it("rejects empty or nameless manifests", async () => {
    await expect(acpAgentManifestArtifactParser.parse({}, entry)).rejects.toThrow(
      "expected a JSON object",
    );
    await expect(acpAgentManifestArtifactParser.parse({ skills: [] }, entry)).rejects.toThrow(
      "requires name or agent_id",
    );
  });

  it("applies projection transport and skill selection deterministically", async () => {
    const parser = createAcpAgentManifestArtifactParser({
      transport: "slim",
      skillAllowlist: ["selected"],
    });
    const result = await parser.parse(
      { name: "Agent", transport: "http", skills: ["selected", "hidden"] },
      entry,
    ) as Awaited<ReturnType<typeof parseAcpAgentManifest>>;

    expect(result.transport).toBe("slim");
    expect(result.capabilities.map(({ name }) => name)).toEqual(["Agent", "selected"]);
  });
});
